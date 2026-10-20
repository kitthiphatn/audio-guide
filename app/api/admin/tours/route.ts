import { json } from '@/lib/app';
import { adminRoute, readJson } from '@/lib/admin-api';
import { createTour } from '@/lib/workspace';

export const POST = adminRoute(async (req, { config, tours }) => {
  const body = await readJson<{ slug?: string; languages?: string[]; from?: string | null }>(req);
  const slug = String(body?.slug || '').trim();
  createTour(config.toursDir, slug, Array.isArray(body?.languages) ? body.languages.map(String) : [], body?.from || null);
  tours.refresh(true);
  return json({ slug }, 201);
});
