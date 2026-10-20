import { json } from '@/lib/app';
import { adminRoute, readJson } from '@/lib/admin-api';

export const GET = adminRoute((req, { store }) => {
  const slug = new URL(req.url).searchParams.get('slug') || undefined;
  return json({ now: Date.now(), passes: store.listPasses({ slug }) });
});

export const POST = adminRoute(async (req, { store, tours }) => {
  const body = await readJson<{ slug?: string; minutes?: number; devices?: number; count?: number; note?: string }>(req);
  const tour = tours.get(body?.slug);
  if (!tour) return json({ error: 'ไม่พบทัวร์' }, 404);
  if (tour.access.mode !== 'code') return json({ error: 'ทัวร์นี้เปิดสาธารณะ ไม่ต้องใช้ QR' }, 400);
  const minutes = Number(body?.minutes) || tour.access.sessionMinutes;
  if (!(minutes > 0 && minutes <= 7 * 24 * 60)) return json({ error: 'เวลาต้องอยู่ระหว่าง 1 นาที ถึง 7 วัน' }, 400);
  const count = Math.min(200, Math.max(1, Math.floor(Number(body?.count)) || 1));
  const passes = Array.from({ length: count }, () =>
    store.createPass({ slug: tour.slug, minutes, devices: Number(body?.devices) || 1, note: body?.note || '' }),
  );
  return json({ passes: passes.map((p) => ({ ...p, status: store.passStatus(p) })) }, 201);
});
