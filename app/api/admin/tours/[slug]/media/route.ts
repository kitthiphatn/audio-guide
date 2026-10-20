import { json } from '@/lib/app';
import { adminRoute } from '@/lib/admin-api';
import { saveUpload, deleteMedia } from '@/lib/workspace';

export const PUT = adminRoute<{ slug: string }>(async (req, { config }, { slug }) => {
  const rel = new URL(req.url).searchParams.get('path');
  return json(await saveUpload(config.toursDir, slug, rel, req.body, config.maxUploadBytes));
});

export const DELETE = adminRoute<{ slug: string }>((req, { config }, { slug }) => {
  deleteMedia(config.toursDir, slug, new URL(req.url).searchParams.get('path'));
  return json({ ok: true });
});
