import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { TourRegistry, publicTour, resolveInside } from './tours.js';
import { Store } from './store.js';
import { sign, verify } from './tokens.js';
import { issueLink, checkLink, sendAudio } from './media.js';
import { tourPage, codePage, messagePage, indexPage, CODE_ERRORS } from './pages.js';

const STATIC_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
// Only these may be served from a tour folder; audio stays behind /media links.
const TOUR_ASSET_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: https://*.tile.openstreetmap.org https://unpkg.com",
  "media-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function createApp(config = loadConfig()) {
  const tours = new TourRegistry(config.toursDir);
  const store = new Store(config.dataDir);

  const cookieName = (slug) => `ag_${slug.replace(/-/g, '_')}`;

  function readSession(req, slug) {
    const raw = parseCookies(req.headers.cookie)[cookieName(slug)];
    const claim = verify(raw, config.secret);
    if (!claim || claim.slug !== slug) return { cookieSid: null, session: null };
    return { cookieSid: claim.sid, session: store.getSession(claim.sid) };
  }

  function setSessionCookie(req, res, session) {
    const maxAge = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
    const secure = isHttps(req, config) ? '; Secure' : '';
    const value = sign({ sid: session.sid, slug: session.slug }, config.secret);
    res.setHeader('Set-Cookie', `${cookieName(session.slug)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean).map(safeDecode);
    if (parts.includes(null)) return send(res, 400, 'Bad request');
    const meta = { ip: clientIp(req, config), ua: req.headers['user-agent'] || '' };

    if (req.method === 'GET' && parts.length === 0) {
      return html(res, 200, indexPage(tours.list()));
    }

    if (parts[0] === 'static' && parts.length === 2) {
      return serveFile(res, path.join(config.publicDir, path.basename(parts[1])), STATIC_TYPES);
    }

    if (req.method === 'GET' && parts[0] === 'expired' && parts.length === 1) {
      return html(res, 200, messagePage('หมดเวลาแล้ว / Time is up', 'เวลาใช้งานทัวร์ของคุณหมดแล้ว ขอบคุณที่ใช้บริการ / Your tour session has ended. Thank you!'));
    }

    if (parts[0] === 't' && parts[1]) {
      const tour = tours.get(parts[1]);
      if (!tour) return html(res, 404, messagePage('Not found', 'ไม่พบทัวร์นี้ / Tour not found'));

      if (parts.length > 2) {
        let file;
        try {
          file = resolveInside(tour.dir, parts.slice(2).join('/'));
        } catch {
          return send(res, 404, 'Not found');
        }
        if (!TOUR_ASSET_EXT.has(path.extname(file).toLowerCase())) return send(res, 404, 'Not found');
        return serveFile(res, file, STATIC_TYPES);
      }

      const { session } = readSession(req, tour.slug);
      const code = (url.searchParams.get('code') || '').trim().toUpperCase();

      if (store.isActive(session)) {
        if (code) return redirect(res, `/t/${tour.slug}`);
        store.touch(session);
        return html(res, 200, tourPage(publicTour(tour), { expiresAt: session.expiresAt }));
      }

      if (tour.access.mode === 'code') {
        if (!code) return html(res, 200, codePage(tour));
        const result = store.redeemCode(tour, code, meta);
        if (!result.ok) {
          store.log('code_rejected', { slug: tour.slug, code, reason: result.reason, ip: meta.ip });
          return html(res, 403, codePage(tour, { error: CODE_ERRORS[result.reason] }));
        }
        setSessionCookie(req, res, result.session);
        return redirect(res, `/t/${tour.slug}`);
      }

      // Open mode: a browser that already had a session for this tour does not get a new one.
      if (session) return redirect(res, tour.access.expiredRedirect);
      const fresh = store.startSession(tour, meta);
      setSessionCookie(req, res, fresh);
      return html(res, 200, tourPage(publicTour(tour), { expiresAt: fresh.expiresAt }));
    }

    if (parts[0] === 'api' && parts[1]) {
      const tour = tours.get(parts[1]);
      if (!tour) return json(res, 404, { error: 'not_found' });
      const { session } = readSession(req, tour.slug);
      if (!store.isActive(session)) {
        return json(res, 401, { error: 'session_expired', redirect: tour.access.expiredRedirect });
      }

      if (req.method === 'GET' && parts[2] === 'session') {
        store.touch(session);
        return json(res, 200, { expiresAt: session.expiresAt, now: Date.now() });
      }

      if (req.method === 'POST' && parts[2] === 'play') {
        const body = await readJsonBody(req);
        const stopIndex = Number(body?.stop);
        const lang = String(body?.lang || '');
        if (!Number.isInteger(stopIndex) || !tour.stops[stopIndex]?.audio[lang]) {
          return json(res, 400, { error: 'unknown_track' });
        }
        if (!fs.existsSync(tour.stops[stopIndex].audio[lang])) {
          return json(res, 404, { error: 'missing_audio' });
        }
        const count = store.recordFetch(session, `${stopIndex}:${lang}`);
        if (count > tour.access.maxTracksPerMinute) {
          store.log('rate_limited', { slug: tour.slug, sid: session.sid, ip: meta.ip });
          return json(res, 429, { error: 'too_many_tracks' });
        }
        session.plays += 1;
        store.log('play', { slug: tour.slug, sid: session.sid, stop: stopIndex, lang });
        const link = issueLink({ session, tour, stopIndex, lang, secret: config.secret, seconds: config.mediaLinkSeconds });
        return json(res, 200, { url: link });
      }
      return json(res, 404, { error: 'not_found' });
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && parts[0] === 'media' && parts.length === 2) {
      const claim = verify(parts[1], config.secret);
      const cookieSid = claim?.slug ? readSession(req, claim.slug).cookieSid : null;
      const result = checkLink({ token: parts[1], secret: config.secret, store, tours, cookieSid });
      if (!result.ok) {
        store.log('media_refused', { reason: result.reason, ip: meta.ip });
        return send(res, result.status, 'Not available');
      }
      return sendAudio(req, res, result.file);
    }

    if (req.method === 'GET' && parts[0] === 'admin' && parts[1] === 'stats') {
      if (!config.adminKey || req.headers['x-admin-key'] !== config.adminKey) return json(res, 403, { error: 'forbidden' });
      return json(res, 200, store.stats());
    }

    return send(res, 404, 'Not found');
  }

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // OpenStreetMap refuses tile requests that carry no Referer.
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, 500, 'Server error');
      else res.end();
    });
  });

  return { server, store, tours };
}

// --- helpers --------------------------------------------------------------

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function safeDecode(s) {
  try {
    const d = decodeURIComponent(s);
    return d.includes('\0') ? null : d;
  } catch {
    return null;
  }
}

function clientIp(req, config) {
  if (config.trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

function isHttps(req, config) {
  return Boolean(req.socket.encrypted) || (config.trustProxy && req.headers['x-forwarded-proto'] === 'https');
}

function readJsonBody(req, limit = 4096) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) req.destroy();
      else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function serveFile(res, file, types) {
  const type = types[path.extname(file).toLowerCase()];
  if (!type) return send(res, 404, 'Not found');
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'public, max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
}

function send(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(text);
}

function html(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(value));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' }).end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const { server, store } = createApp(config);
  store.prune();
  server.listen(config.port, () => console.log(`Audio guide running on http://localhost:${config.port}`));
  const stop = () => {
    store.saveNow();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
