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
import { createAdmin } from './admin.js';
import { parseCookies, clientIp, isHttps, readJsonBody, serveFile, send, html, json, redirect } from './http.js';

// Only images may be served from a tour folder; audio stays behind signed /media links.
const TOUR_ASSET_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://unpkg.com",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function createApp(config = loadConfig()) {
  const tours = new TourRegistry(config.toursDir);
  const store = new Store(config.dataDir);
  const handleAdmin = createAdmin({ config, store, tours });

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
    // Kept for a week past expiry, so a returning visitor is recognised and redirected.
    res.setHeader('Set-Cookie', `${cookieName(session.slug)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge + 7 * 86400}${secure}`);
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean).map(safeDecode);
    if (parts.includes(null)) return send(res, 400, 'Bad request');
    const meta = { ip: clientIp(req, config), ua: req.headers['user-agent'] || '' };

    if (req.method === 'GET' && parts.length === 0) {
      return html(res, 200, indexPage(tours.list()));
    }

    if (parts[0] === 'admin') return handleAdmin(req, res, parts, url);

    if (parts[0] === 'static' && parts.length === 2) {
      return serveFile(res, path.join(config.publicDir, path.basename(parts[1])));
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
        return serveFile(res, file);
      }

      const { session } = readSession(req, tour.slug);
      const code = (url.searchParams.get('code') || '').trim().toUpperCase();

      // A new QR code always wins over an old session in this browser.
      if (code && !(store.isActive(session) && session.code === code)) {
        if (tour.access.mode !== 'code') return redirect(res, `/t/${tour.slug}`);
        const result = store.redeemPass(tour, code, meta);
        if (!result.ok) {
          store.log('code_rejected', { slug: tour.slug, code, reason: result.reason, ip: meta.ip });
          return html(res, 403, codePage(tour, { error: CODE_ERRORS[result.reason] }));
        }
        setSessionCookie(req, res, result.session);
        return redirect(res, `/t/${tour.slug}`);
      }
      if (code) return redirect(res, `/t/${tour.slug}`);

      if (store.isActive(session)) {
        store.touch(session);
        return html(res, 200, tourPage(publicTour(tour), { expiresAt: session.expiresAt }));
      }

      if (session) return redirect(res, tour.access.expiredRedirect);
      if (tour.access.mode === 'code') return html(res, 200, codePage(tour));

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
        const body = await readJsonBody(req, 4096);
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
        return json(res, 200, { url: link, expiresAt: session.expiresAt });
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

function safeDecode(s) {
  try {
    const d = decodeURIComponent(s);
    return d.includes('\0') ? null : d;
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const { server, store } = createApp(config);
  store.prune();
  server.listen(config.port, () => {
    console.log(`Audio guide running on http://localhost:${config.port}`);
    console.log(config.adminPassword ? `Dashboard: http://localhost:${config.port}/admin` : 'Dashboard disabled: set AG_ADMIN_PASSWORD in .env');
  });
  const stop = () => {
    store.saveNow();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
