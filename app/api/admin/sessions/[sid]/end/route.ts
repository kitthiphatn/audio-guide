import { json } from '@/lib/app';
import { adminRoute } from '@/lib/admin-api';

export const POST = adminRoute<{ sid: string }>((_req, { store }, { sid }) =>
  store.endSession(sid) ? json({ ok: true }) : json({ error: 'not_found' }, 404),
);
