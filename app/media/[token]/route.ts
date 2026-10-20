import { getApp, getCookie, readVisitor, visitorCookie, clientIp } from '@/lib/app';
import { checkLink, readLinkClaim, audioResponse } from '@/lib/media';

async function serve(req: Request, ctx: RouteContext<'/media/[token]'>) {
  const { token } = await ctx.params;
  const app = getApp();
  const claim = readLinkClaim(token, app.config.secret);
  const cookieSid = claim ? readVisitor(app, claim.slug, getCookie(req, visitorCookie(claim.slug))).cookieSid : null;
  const result = checkLink({ token, secret: app.config.secret, store: app.store, tours: app.tours, cookieSid });
  if (!result.ok) {
    app.store.log('media_refused', { reason: result.reason, ip: clientIp(app, req) });
    return new Response('Not available', { status: result.status });
  }
  return audioResponse(result.file, req.headers.get('range'), req.method);
}

export const GET = serve;
export const HEAD = serve;
