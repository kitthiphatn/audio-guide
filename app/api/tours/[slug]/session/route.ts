import { getApp, getCookie, readVisitor, visitorCookie, json } from '@/lib/app';

export async function GET(req: Request, ctx: RouteContext<'/api/tours/[slug]/session'>) {
  const { slug } = await ctx.params;
  const app = getApp();
  const tour = app.tours.get(slug);
  if (!tour) return json({ error: 'not_found' }, 404);
  const { session } = readVisitor(app, slug, getCookie(req, visitorCookie(slug)));
  if (!app.store.isActive(session)) return json({ error: 'session_expired', redirect: tour.access.expiredRedirect }, 401);
  app.store.touch(session);
  return json({ expiresAt: session.expiresAt, now: Date.now() });
}
