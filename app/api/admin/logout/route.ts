import { json, ADMIN_COOKIE } from '@/lib/app';

export function POST() {
  return json({ ok: true }, 200, { 'Set-Cookie': `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
}
