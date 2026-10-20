import { getApp, getCookie, readVisitor, visitorCookie, visitorCookieHeader, clientIp, isSecure } from '@/lib/app';

// Starts a visitor session (open tours) or redeems a QR code (code tours), sets the
// session cookie, then sends the visitor to the tour page. Pages cannot set cookies,
// which is why this is a route handler.

export async function GET(req: Request, ctx: RouteContext<'/t/[slug]/enter'>) {
  const { slug } = await ctx.params;
  const app = getApp();
  const tour = app.tours.get(slug);
  const url = new URL(req.url);
  const to = (path: string) => new Response(null, { status: 303, headers: { Location: path, 'Cache-Control': 'no-store' } });
  if (!tour) return to('/');

  const meta = { ip: clientIp(app, req), ua: req.headers.get('user-agent') || '' };
  const secure = isSecure(app, req);
  const { session } = readVisitor(app, slug, getCookie(req, visitorCookie(slug)));
  const code = (url.searchParams.get('code') || '').trim().toUpperCase();

  if (code && tour.access.mode === 'code') {
    if (app.store.isActive(session) && session.code === code) return to(`/t/${slug}`);
    const result = app.store.redeemPass(tour, code, meta);
    if (!result.ok) {
      app.store.log('code_rejected', { slug, code, reason: result.reason, ip: meta.ip });
      return to(`/t/${slug}?error=${result.reason}`);
    }
    const res = to(`/t/${slug}`);
    res.headers.set('Set-Cookie', visitorCookieHeader(app, result.session, secure));
    return res;
  }

  if (app.store.isActive(session)) return to(`/t/${slug}`);
  if (session) return to(tour.access.expiredRedirect);
  if (tour.access.mode === 'code') return to(`/t/${slug}`);

  const fresh = app.store.startSession(tour, meta);
  const res = to(`/t/${slug}`);
  res.headers.set('Set-Cookie', visitorCookieHeader(app, fresh, secure));
  return res;
}
