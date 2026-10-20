import { json } from '@/lib/app';
import { adminRoute } from '@/lib/admin-api';

export const POST = adminRoute<{ code: string }>((_req, { store }, { code }) => {
  const pass = store.revokePass(code);
  return pass ? json({ ...pass, status: store.passStatus(pass) }) : json({ error: 'not_found' }, 404);
});
