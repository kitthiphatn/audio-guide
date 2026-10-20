import { createHash, timingSafeEqual } from 'node:crypto';
import { loadConfig, type Config } from './config';
import { TourRegistry } from './tours';
import { Store, type Session } from './store';
import { sign, verify } from './tokens';

// One shared instance per server process. Kept on globalThis so `next dev` hot reloads
// don't create a second store that would overwrite the first one's files.

export interface AppContext {
  config: Config;
  tours: TourRegistry;
  store: Store;
}

const KEY = Symbol.for('audio-guide.app');
type GlobalWithApp = typeof globalThis & { [KEY]?: AppContext };

export function getApp(): AppContext {
  const g = globalThis as GlobalWithApp;
  if (!g[KEY]) {
    const config = loadConfig();
    const store = new Store(config.dataDir);
    store.prune();
    g[KEY] = { config, tours: new TourRegistry(config.toursDir), store };
  }
  return g[KEY];
}

/** Tests use this to run against a temporary folder. */
export function setApp(ctx: AppContext | undefined) {
  (globalThis as GlobalWithApp)[KEY] = ctx;
}

// --- visitor session cookie -------------------------------------------------

export const visitorCookie = (slug: string) => `ag_${slug.replace(/-/g, '_')}`;

export function readVisitor(app: AppContext, slug: string, cookieValue: string | undefined) {
  const claim = verify<{ sid: string; slug: string }>(cookieValue, app.config.secret);
  if (!claim || claim.slug !== slug) return { cookieSid: null, session: null };
  return { cookieSid: claim.sid, session: app.store.getSession(claim.sid) };
}

export function visitorCookieHeader(app: AppContext, session: Session, secure: boolean): string {
  const maxAge = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
  const value = sign({ sid: session.sid, slug: session.slug }, app.config.secret);
  // Kept for a week past expiry, so a returning visitor is recognised and redirected.
  return `${visitorCookie(session.slug)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge + 7 * 86400}${secure ? '; Secure' : ''}`;
}

// --- admin cookie -----------------------------------------------------------

export const ADMIN_COOKIE = 'ag_admin';
export const ADMIN_HOURS = 12;

export function isAdminToken(app: AppContext, value: string | undefined): boolean {
  const claim = verify<{ admin: boolean; exp: number }>(value, app.config.secret);
  return Boolean(claim?.admin && Date.now() < claim.exp);
}

export function adminToken(app: AppContext): string {
  return sign({ admin: true, exp: Date.now() + ADMIN_HOURS * 3_600_000 }, app.config.secret);
}

export function passwordMatches(app: AppContext, given: unknown): boolean {
  const a = createHash('sha256').update(String(given ?? '')).digest();
  const b = createHash('sha256').update(app.config.adminPassword).digest();
  return Boolean(app.config.adminPassword) && timingSafeEqual(a, b);
}

// --- request helpers ----------------------------------------------------------

export function getCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

export function clientIp(app: AppContext, req: Request): string {
  if (app.config.trustProxy) {
    const fwd = req.headers.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '';
}

export function isSecure(app: AppContext, req: Request): boolean {
  if (app.config.trustProxy && req.headers.get('x-forwarded-proto') === 'https') return true;
  return new URL(req.url).protocol === 'https:';
}

export const json = (value: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
