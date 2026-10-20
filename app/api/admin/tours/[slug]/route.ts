import { json } from '@/lib/app';
import { adminRoute, readJson } from '@/lib/admin-api';
import { readTourRaw, saveTourRaw, listMedia } from '@/lib/workspace';

export const GET = adminRoute<{ slug: string }>((_req, { config }, { slug }) =>
  json({ raw: readTourRaw(config.toursDir, slug), media: listMedia(config.toursDir, slug) }),
);

export const PUT = adminRoute<{ slug: string }>(async (req, { config, tours, store }, { slug }) => {
  const body = await readJson<{ raw?: unknown }>(req);
  if (!body?.raw) return json({ error: 'raw is required' }, 400);
  saveTourRaw(config.toursDir, slug, body.raw);
  tours.refresh(true);
  store.log('tour_saved', { slug });
  return json({ ok: true });
});
