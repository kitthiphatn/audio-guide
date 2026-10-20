import { json } from '@/lib/app';
import { adminRoute } from '@/lib/admin-api';

export const GET = adminRoute((_req, { store, tours }) => {
  const now = Date.now();
  const stats = store.stats(now);
  return json({
    now,
    loadErrors: tours.errors,
    tours: tours.list().map((t) => ({
      slug: t.slug,
      title: t.title,
      defaultLanguage: t.defaultLanguage,
      mode: t.access.mode,
      sessionMinutes: t.access.sessionMinutes,
      stops: t.stops.length,
      stats: stats[t.slug] || { sessions: 0, activeSessions: 0, plays: 0, passes: 0, activePasses: 0, unusedPasses: 0 },
    })),
    sessions: store
      .activeSessions(now)
      .sort((a, b) => a.expiresAt - b.expiresAt)
      .map((s) => ({
        sid: s.sid,
        slug: s.slug,
        code: s.code,
        note: (s.code && store.getPass(s.code)?.note) || '',
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        lastSeenAt: s.lastSeenAt,
        plays: s.plays,
      })),
  });
});
