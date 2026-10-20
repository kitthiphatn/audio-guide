import fs from 'node:fs';
import { getApp, getCookie, readVisitor, visitorCookie, clientIp, json } from '@/lib/app';
import { issueLink } from '@/lib/media';

export async function POST(req: Request, ctx: RouteContext<'/api/tours/[slug]/play'>) {
  const { slug } = await ctx.params;
  const app = getApp();
  const tour = app.tours.get(slug);
  if (!tour) return json({ error: 'not_found' }, 404);
  const { session } = readVisitor(app, slug, getCookie(req, visitorCookie(slug)));
  if (!app.store.isActive(session)) return json({ error: 'session_expired', redirect: tour.access.expiredRedirect }, 401);

  const body = (await req.json().catch(() => null)) as { stop?: number; lang?: string } | null;
  const stopIndex = Number(body?.stop);
  const lang = String(body?.lang || '');
  const file = Number.isInteger(stopIndex) ? tour.stops[stopIndex]?.audio[lang] : undefined;
  if (!file) return json({ error: 'unknown_track' }, 400);
  if (!fs.existsSync(file)) return json({ error: 'missing_audio' }, 404);

  const count = app.store.recordFetch(session, `${stopIndex}:${lang}`);
  if (count > tour.access.maxTracksPerMinute) {
    app.store.log('rate_limited', { slug, sid: session.sid, ip: clientIp(app, req) });
    return json({ error: 'too_many_tracks' }, 429);
  }
  session.plays += 1;
  app.store.log('play', { slug, sid: session.sid, stop: stopIndex, lang });
  const url = issueLink({ session, tour, stopIndex, lang, secret: app.config.secret, seconds: app.config.mediaLinkSeconds });
  return json({ url, expiresAt: session.expiresAt });
}
