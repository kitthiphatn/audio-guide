import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { POST as login } from '@/app/api/admin/login/route';
import { POST as createTourRoute } from '@/app/api/admin/tours/route';
import { GET as getTour, PUT as putTour } from '@/app/api/admin/tours/[slug]/route';
import { PUT as upload, DELETE as removeMedia } from '@/app/api/admin/tours/[slug]/media/route';
import { GET as listPasses, POST as issuePasses } from '@/app/api/admin/passes/route';
import { POST as extend } from '@/app/api/admin/passes/[code]/extend/route';
import { POST as revoke } from '@/app/api/admin/passes/[code]/revoke/route';
import { GET as enter } from '@/app/t/[slug]/enter/route';
import { POST as playRoute } from '@/app/api/tours/[slug]/play/route';
import { BASE, cookieOf, cleanup, ctx, freshApp } from './helpers';

let app: ReturnType<typeof freshApp>;
let admin = '';

beforeEach(async () => {
  app = freshApp();
  const res = await login(new Request(`${BASE}/api/admin/login`, { method: 'POST', body: JSON.stringify({ password: 'pw' }) }));
  expect(res.status).toBe(200);
  admin = cookieOf(res);
});
afterEach(() => cleanup(app));

const req = (method: string, url: string, body?: unknown, raw = false) =>
  new Request(BASE + url, {
    method,
    headers: { cookie: admin, 'x-admin': '1', ...(raw ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : raw ? (body as BodyInit) : JSON.stringify(body),
    // @ts-expect-error Node needs duplex for streamed bodies
    duplex: 'half',
  });

test('the dashboard needs the password, and changes need the x-admin header', async () => {
  const wrong = await login(new Request(BASE, { method: 'POST', body: JSON.stringify({ password: 'nope' }) }));
  expect(wrong.status).toBe(401);
  const anon = await getTour(new Request(BASE), ctx({ slug: 'open-tour' }));
  expect(anon.status).toBe(401);
  const noHeader = await createTourRoute(
    new Request(BASE, { method: 'POST', headers: { cookie: admin }, body: JSON.stringify({ slug: 'x' }) }),
    ctx({}),
  );
  expect(noHeader.status).toBe(403);
});

test('create, edit and copy a tour, with uploads', async () => {
  expect((await createTourRoute(req('POST', '/api/admin/tours', { slug: 'wat-pho', languages: ['th', 'en'] }), ctx({}))).status).toBe(201);
  expect((await createTourRoute(req('POST', '/api/admin/tours', { slug: 'wat-pho' }), ctx({}))).status).toBe(409);
  expect((await createTourRoute(req('POST', '/api/admin/tours', { slug: '../x' }), ctx({}))).status).toBe(400);

  const up = await upload(req('PUT', '/api/admin/tours/wat-pho/media?path=audio/th/01-1.mp3', new Uint8Array(300), true), ctx({ slug: 'wat-pho' }));
  expect(up.status).toBe(200);
  expect(await up.json()).toEqual({ path: 'audio/th/01-1.mp3', size: 300 });
  const bad = await upload(req('PUT', '/api/admin/tours/wat-pho/media?path=../../evil.mp3', new Uint8Array(1), true), ctx({ slug: 'wat-pho' }));
  expect(bad.status).toBe(400);
  const exe = await upload(req('PUT', '/api/admin/tours/wat-pho/media?path=audio/x.sh', new Uint8Array(1), true), ctx({ slug: 'wat-pho' }));
  expect(exe.status).toBe(400);
  const big = await upload(
    req('PUT', '/api/admin/tours/wat-pho/media?path=audio/big.mp3', new Uint8Array(app.config.maxUploadBytes + 1), true),
    ctx({ slug: 'wat-pho' }),
  );
  expect(big.status).toBe(413);
  expect(fs.existsSync(path.join(app.config.toursDir, 'wat-pho', 'audio', 'big.mp3'))).toBe(false);

  const { raw, media } = await (await getTour(req('GET', '/api/admin/tours/wat-pho'), ctx({ slug: 'wat-pho' }))).json();
  expect(media.map((m: { path: string }) => m.path)).toEqual(['audio/th/01-1.mp3']);
  raw.title.th = 'วัดโพธิ์';
  raw.stops[0].audio = { th: 'audio/th/01-1.mp3' };
  expect((await putTour(req('PUT', '/api/admin/tours/wat-pho', { raw }), ctx({ slug: 'wat-pho' }))).status).toBe(200);
  expect(app.tours.get('wat-pho')!.title).toMatchObject({ th: 'วัดโพธิ์' });

  // A broken tour is refused and the saved file is left alone.
  const broken = await putTour(req('PUT', '/api/admin/tours/wat-pho', { raw: { ...raw, stops: [] } }), ctx({ slug: 'wat-pho' }));
  expect(broken.status).toBe(400);
  expect(app.tours.get('wat-pho')!.stops).toHaveLength(1);

  // Copying a tour as a template keeps text but not audio.
  expect((await createTourRoute(req('POST', '/api/admin/tours', { slug: 'wat-pho-2', from: 'wat-pho' }), ctx({}))).status).toBe(201);
  const copy = app.tours.get('wat-pho-2')!;
  expect(copy.title).toMatchObject({ th: 'วัดโพธิ์' });
  expect(copy.stops[0].audio).toEqual({});

  expect((await removeMedia(req('DELETE', '/api/admin/tours/wat-pho/media?path=audio/th/01-1.mp3'), ctx({ slug: 'wat-pho' }))).status).toBe(200);
});

test('passes work like queue tickets: first scan starts the clock, staff extend and revoke', async () => {
  expect((await issuePasses(req('POST', '/api/admin/passes', { slug: 'open-tour' }), ctx({}))).status).toBe(400);
  const issued = await issuePasses(req('POST', '/api/admin/passes', { slug: 'code-tour', minutes: 30, count: 3, note: 'โต๊ะ 4' }), ctx({}));
  expect(issued.status).toBe(201);
  const { passes } = await issued.json();
  expect(passes).toHaveLength(3);
  expect(new Set(passes.map((p: { code: string }) => p.code)).size).toBe(3);
  expect(passes[0]).toMatchObject({ status: 'unused', expiresAt: null, note: 'โต๊ะ 4' });

  const code = passes[0].code;
  const before = Date.now();
  const scan = await enter(new Request(`${BASE}/t/code-tour/enter?code=${code}`), ctx({ slug: 'code-tour' }));
  const visitor = cookieOf(scan);
  expect(visitor).toBeTruthy();
  const listed = await (await listPasses(req('GET', '/api/admin/passes?slug=code-tour'), ctx({}))).json();
  const used = listed.passes.find((p: { code: string }) => p.code === code);
  expect(used.status).toBe('active');
  expect(used.expiresAt).toBeGreaterThanOrEqual(before + 30 * 60_000);

  const extended = await (await extend(req('POST', `/api/admin/passes/${code}/extend`, { minutes: 15 }), ctx({ code }))).json();
  expect(extended.expiresAt).toBe(used.expiresAt + 15 * 60_000);

  expect((await revoke(req('POST', `/api/admin/passes/${code}/revoke`, {}), ctx({ code }))).status).toBe(200);
  const play = () =>
    playRoute(
      new Request(BASE, { method: 'POST', headers: { cookie: visitor }, body: JSON.stringify({ stop: 0, lang: 'th' }) }),
      ctx({ slug: 'code-tour' }),
    );
  expect((await play()).status).toBe(401);
  const rescan = await enter(new Request(`${BASE}/t/code-tour/enter?code=${code}`), ctx({ slug: 'code-tour' }));
  expect(rescan.headers.get('location')).toBe('/t/code-tour?error=code_revoked');

  // Staff reopen it: the same phone works again.
  await extend(req('POST', `/api/admin/passes/${code}/extend`, { minutes: 15 }), ctx({ code }));
  expect((await play()).status).toBe(200);
});

test('an expired pass is refused until staff reopen it', async () => {
  const pass = app.store.createPass({ slug: 'code-tour', minutes: 1 });
  const scan = await enter(new Request(`${BASE}/t/code-tour/enter?code=${pass.code}`), ctx({ slug: 'code-tour' }));
  const visitor = cookieOf(scan);
  app.store.getPass(pass.code)!.expiresAt = Date.now() - 1;
  app.store.syncSessions(app.store.getPass(pass.code)!);
  const again = await enter(new Request(`${BASE}/t/code-tour/enter?code=${pass.code}`), ctx({ slug: 'code-tour' }));
  expect(again.headers.get('location')).toBe('/t/code-tour?error=code_expired');

  await extend(req('POST', `/api/admin/passes/${pass.code}/extend`, { minutes: 10 }), ctx({ code: pass.code }));
  const back = await enter(new Request(`${BASE}/t/code-tour/enter?code=${pass.code}`, { headers: { cookie: visitor } }), ctx({ slug: 'code-tour' }));
  expect(back.headers.get('location')).toBe('/t/code-tour');
});
