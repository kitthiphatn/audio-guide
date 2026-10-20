import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { sign, verify } from './tokens.js';
import { json, send, serveFile, parseCookies, isHttps, readJsonBody, clientIp } from './http.js';
import { createTour, readTourRaw, saveTourRaw, listMedia, saveUpload, deleteMedia, WorkspaceError } from './workspace.js';

// Admin workspace: /admin serves the dashboard page, /admin/api/* is its JSON API.
// Sign-in uses AG_ADMIN_PASSWORD and a signed, HttpOnly, SameSite=Strict cookie.
// Every state-changing request must also carry the "x-admin: 1" header, which a
// cross-site form cannot send.

const COOKIE = 'ag_admin';
const SESSION_HOURS = 12;

export function createAdmin({ config, store, tours }) {
  const loginAttempts = new Map();

  function isAdmin(req) {
    const claim = verify(parseCookies(req.headers.cookie)[COOKIE], config.secret);
    return Boolean(claim?.admin && Date.now() < claim.exp);
  }

  function passwordMatches(given) {
    const a = createHash('sha256').update(String(given ?? '')).digest();
    const b = createHash('sha256').update(config.adminPassword).digest();
    return timingSafeEqual(a, b);
  }

  function tooManyAttempts(ip, now = Date.now()) {
    const recent = (loginAttempts.get(ip) || []).filter((t) => now - t < 10 * 60_000);
    recent.push(now);
    loginAttempts.set(ip, recent);
    return recent.length > 10;
  }

  function overview(now = Date.now()) {
    const stats = store.stats(now);
    const tourList = tours.list().map((t) => ({
      slug: t.slug,
      title: t.title,
      defaultLanguage: t.defaultLanguage,
      mode: t.access.mode,
      sessionMinutes: t.access.sessionMinutes,
      stops: t.stops.length,
      stats: stats[t.slug] || {},
    }));
    const sessions = store
      .activeSessions(now)
      .sort((a, b) => a.expiresAt - b.expiresAt)
      .map((s) => ({
        sid: s.sid,
        slug: s.slug,
        code: s.code,
        note: s.code ? store.getPass(s.code)?.note || '' : '',
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        lastSeenAt: s.lastSeenAt,
        plays: s.plays,
        ua: s.ua,
      }));
    return { now, tours: tourList, sessions, loadErrors: tours.errors };
  }

  async function api(req, res, parts, url) {
    const method = req.method;
    const route = parts.join('/');

    if (method === 'POST' && route === 'login') {
      if (!config.adminPassword) return json(res, 503, { error: 'ยังไม่ได้ตั้ง AG_ADMIN_PASSWORD ในไฟล์ .env' });
      if (tooManyAttempts(clientIp(req, config))) return json(res, 429, { error: 'ลองหลายครั้งเกินไป รอ 10 นาที' });
      const body = await readJsonBody(req);
      if (!passwordMatches(body?.password)) return json(res, 401, { error: 'รหัสผ่านไม่ถูกต้อง' });
      const token = sign({ admin: true, exp: Date.now() + SESSION_HOURS * 3_600_000 }, config.secret);
      const secure = isHttps(req, config) ? '; Secure' : '';
      res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure}`);
      store.log('admin_login', { ip: clientIp(req, config) });
      return json(res, 200, { ok: true });
    }

    if (!isAdmin(req)) return json(res, 401, { error: 'login_required', configured: Boolean(config.adminPassword) });
    if (method !== 'GET' && req.headers['x-admin'] !== '1') return json(res, 403, { error: 'missing x-admin header' });

    if (method === 'POST' && route === 'logout') {
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0`);
      return json(res, 200, { ok: true });
    }
    if (method === 'GET' && route === 'me') return json(res, 200, { ok: true });
    if (method === 'GET' && route === 'overview') return json(res, 200, overview());

    if (method === 'POST' && parts[0] === 'sessions' && parts[2] === 'end') {
      return json(res, store.endSession(parts[1]) ? 200 : 404, {});
    }

    // --- tours ---
    if (parts[0] === 'tours') {
      const slug = parts[1];
      if (method === 'POST' && parts.length === 1) {
        const body = await readJsonBody(req);
        createTour(config.toursDir, body?.slug, body?.languages, body?.from || null);
        tours.refresh(true);
        return json(res, 201, { slug: body.slug });
      }
      if (method === 'GET' && parts.length === 2) {
        return json(res, 200, { raw: readTourRaw(config.toursDir, slug), media: listMedia(config.toursDir, slug) });
      }
      if (method === 'PUT' && parts.length === 2) {
        const body = await readJsonBody(req);
        if (!body?.raw) return json(res, 400, { error: 'raw is required' });
        saveTourRaw(config.toursDir, slug, body.raw);
        tours.refresh(true);
        store.log('tour_saved', { slug });
        return json(res, 200, { ok: true });
      }
      if (parts[2] === 'media' && parts.length === 3) {
        const rel = url.searchParams.get('path');
        if (method === 'PUT') {
          const saved = await saveUpload(config.toursDir, slug, rel, req, config.maxUploadBytes);
          return json(res, 200, saved);
        }
        if (method === 'DELETE') {
          deleteMedia(config.toursDir, slug, rel);
          return json(res, 200, { ok: true });
        }
      }
    }

    // --- passes (QR codes) ---
    if (parts[0] === 'passes') {
      if (method === 'GET' && parts.length === 1) {
        return json(res, 200, { now: Date.now(), passes: store.listPasses({ slug: url.searchParams.get('slug') || undefined }) });
      }
      if (method === 'POST' && parts.length === 1) {
        const body = await readJsonBody(req);
        const tour = tours.get(body?.slug);
        if (!tour) return json(res, 404, { error: 'ไม่พบทัวร์' });
        const minutes = Number(body.minutes) || tour.access.sessionMinutes;
        const count = Math.min(200, Math.max(1, Number(body.count) || 1));
        if (minutes <= 0 || minutes > 7 * 24 * 60) return json(res, 400, { error: 'เวลาต้องอยู่ระหว่าง 1 นาที ถึง 7 วัน' });
        const created = Array.from({ length: count }, () =>
          store.createPass({ slug: tour.slug, minutes, devices: body.devices, note: body.note || '' }),
        );
        return json(res, 201, { passes: created.map((p) => ({ ...p, status: store.passStatus(p) })) });
      }
      const code = parts[1];
      if (method === 'POST' && parts[2] === 'extend') {
        const body = await readJsonBody(req);
        const minutes = Number(body?.minutes);
        if (!(minutes > 0 && minutes <= 24 * 60)) return json(res, 400, { error: 'เวลาไม่ถูกต้อง' });
        const pass = store.extendPass(code, minutes);
        return pass ? json(res, 200, { ...pass, status: store.passStatus(pass) }) : json(res, 404, {});
      }
      if (method === 'POST' && parts[2] === 'revoke') {
        const pass = store.revokePass(code);
        return pass ? json(res, 200, { ...pass, status: store.passStatus(pass) }) : json(res, 404, {});
      }
    }

    return json(res, 404, { error: 'not_found' });
  }

  return async function handleAdmin(req, res, parts, url) {
    // parts[0] === 'admin'
    if (parts.length === 1 && req.method === 'GET') {
      return serveFile(res, path.join(config.publicDir, 'admin.html'), { cache: 'no-store' });
    }
    if (parts[1] === 'api') {
      try {
        return await api(req, res, parts.slice(2), url);
      } catch (err) {
        if (err instanceof WorkspaceError) return json(res, err.status, { error: err.message });
        if (err?.code === 'ENOENT') return json(res, 404, { error: 'ไม่พบไฟล์' });
        throw err;
      }
    }
    return send(res, 404, 'Not found');
  };
}
