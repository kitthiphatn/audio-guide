import { getApp, adminToken, passwordMatches, clientIp, isSecure, json, ADMIN_COOKIE, ADMIN_HOURS } from '@/lib/app';
import { readJson } from '@/lib/admin-api';

const attempts = new Map<string, number[]>();

export async function POST(req: Request) {
  const app = getApp();
  if (!app.config.adminPassword) return json({ error: 'ยังไม่ได้ตั้ง AG_ADMIN_PASSWORD ในไฟล์ .env' }, 503);
  const ip = clientIp(app, req) || 'local';
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  attempts.set(ip, recent);
  if (recent.length > 10) return json({ error: 'ลองหลายครั้งเกินไป รอ 10 นาที' }, 429);

  const body = await readJson<{ password?: string }>(req);
  if (!passwordMatches(app, body?.password)) return json({ error: 'รหัสผ่านไม่ถูกต้อง' }, 401);
  app.store.log('admin_login', { ip });
  const secure = isSecure(app, req) ? '; Secure' : '';
  return json({ ok: true }, 200, {
    'Set-Cookie': `${ADMIN_COOKIE}=${adminToken(app)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_HOURS * 3600}${secure}`,
  });
}
