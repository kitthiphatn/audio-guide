import { json } from '@/lib/app';
import { adminRoute, readJson } from '@/lib/admin-api';

export const POST = adminRoute<{ code: string }>(async (req, { store }, { code }) => {
  const minutes = Number((await readJson<{ minutes?: number }>(req))?.minutes);
  if (!(minutes > 0 && minutes <= 24 * 60)) return json({ error: 'เวลาไม่ถูกต้อง' }, 400);
  const pass = store.extendPass(code, minutes);
  return pass ? json({ ...pass, status: store.passStatus(pass) }) : json({ error: 'not_found' }, 404);
});
