import { getApp, getCookie, isAdminToken, json, ADMIN_COOKIE, type AppContext } from './app';
import { WorkspaceError } from './workspace';

// Wraps an admin API route: requires the admin cookie, and for anything that changes
// state also the "x-admin: 1" header, which a cross-site form cannot send.

type Handler<P> = (req: Request, app: AppContext, params: P) => Promise<Response> | Response;

export function adminRoute<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    const app = getApp();
    if (!isAdminToken(app, getCookie(req, ADMIN_COOKIE))) {
      return json({ error: 'login_required', configured: Boolean(app.config.adminPassword) }, 401);
    }
    if (req.method !== 'GET' && req.headers.get('x-admin') !== '1') return json({ error: 'missing x-admin header' }, 403);
    try {
      return await handler(req, app, await ctx.params);
    } catch (err) {
      if (err instanceof WorkspaceError) return json({ error: err.message }, err.status);
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return json({ error: 'ไม่พบไฟล์' }, 404);
      throw err;
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
