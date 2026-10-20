import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { sign } from '@/lib/tokens';
import { publicTour } from '@/lib/tours';
import { GET as enter } from '@/app/t/[slug]/enter/route';
import { POST as playRoute } from '@/app/api/tours/[slug]/play/route';
import { GET as sessionRoute } from '@/app/api/tours/[slug]/session/route';
import { GET as media } from '@/app/media/[token]/route';
import { GET as asset } from '@/app/t/[slug]/[...asset]/route';
import { BASE, cookieOf, cleanup, ctx, freshApp } from './helpers';

let app: ReturnType<typeof freshApp>;
beforeEach(() => {
  app = freshApp();
});
afterEach(() => cleanup(app));

async function openSession(slug = 'open-tour') {
  const res = await enter(new Request(`${BASE}/t/${slug}/enter`), ctx({ slug }));
  expect(res.status).toBe(303);
  const cookie = cookieOf(res);
  expect(cookie).toMatch(/^ag_open_tour=/);
  return cookie;
}

const play = (cookie: string, stop = 0, slug = 'open-tour') =>
  playRoute(
    new Request(`${BASE}/api/tours/${slug}/play`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ stop, lang: 'th' }),
    }),
    ctx({ slug }),
  );

const fetchMedia = (url: string, headers: Record<string, string> = {}) =>
  media(new Request(BASE + url, { headers }), ctx({ token: url.split('/').pop()! }));

const sidOf = (cookie: string) => JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[0], 'base64url').toString()).sid as string;

describe('visitor access', () => {
  test('the data sent to the browser never contains audio file paths', () => {
    const tour = app.tours.get('open-tour')!;
    const text = JSON.stringify(publicTour(tour));
    expect(text).not.toMatch(/\.mp3/);
    expect(text).not.toContain(app.tmp);
  });

  test('tour folders serve images only, never audio or files outside the folder', async () => {
    const img = await asset(new Request(`${BASE}/t/open-tour/images/hero.png`), ctx({ slug: 'open-tour', asset: ['images', 'hero.png'] }));
    expect(img.status).toBe(200);
    const audio = await asset(new Request(BASE), ctx({ slug: 'open-tour', asset: ['audio', 'th', '01.mp3'] }));
    expect(audio.status).toBe(404);
    const escape = await asset(new Request(BASE), ctx({ slug: 'open-tour', asset: ['..', '..', 'package.json'] }));
    expect(escape.status).toBe(404);
  });

  test('a session gets a working, range-capable audio link', async () => {
    const cookie = await openSession();
    const res = await play(cookie);
    expect(res.status).toBe(200);
    const { url } = await res.json();
    const full = await fetchMedia(url, { cookie });
    expect(full.status).toBe(200);
    expect((await full.arrayBuffer()).byteLength).toBe(1000);
    const part = await fetchMedia(url, { cookie, range: 'bytes=100-199' });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 100-199/1000');
    expect((await part.arrayBuffer()).byteLength).toBe(100);
  });

  test('an audio link does not work without its own session cookie', async () => {
    const cookie = await openSession();
    const { url } = await (await play(cookie)).json();
    expect((await fetchMedia(url)).status).toBe(403);
    const other = await openSession();
    expect((await fetchMedia(url, { cookie: other })).status).toBe(403);
  });

  test('expired and forged links are refused', async () => {
    const cookie = await openSession();
    const sid = sidOf(cookie);
    const old = sign({ sid, slug: 'open-tour', i: 0, l: 'th', exp: Date.now() - 1000, n: 'x' }, 'test-secret');
    expect((await fetchMedia(`/media/${old}`, { cookie })).status).toBe(403);
    const forged = sign({ sid, slug: 'open-tour', i: 0, l: 'th', exp: Date.now() + 60_000, n: 'x' }, 'wrong');
    expect((await fetchMedia(`/media/${forged}`, { cookie })).status).toBe(403);
  });

  test('too many different tracks per minute is rate limited', async () => {
    const cookie = await openSession();
    expect((await play(cookie, 0)).status).toBe(200);
    expect((await play(cookie, 1)).status).toBe(200);
    expect((await play(cookie, 0)).status).toBe(200);
    const tour = app.tours.get('open-tour')!;
    tour.stops.push({ ...tour.stops[0], id: 'c' });
    expect((await play(cookie, 2)).status).toBe(429);
  });

  test('a missing audio file is reported instead of handing out a dead link', async () => {
    const cookie = await openSession();
    fs.rmSync(app.tours.get('open-tour')!.stops[1].audio.th);
    const res = await play(cookie, 1);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('missing_audio');
  });

  test('an expired session redirects and stops audio', async () => {
    const cookie = await openSession();
    const { url } = await (await play(cookie)).json();
    app.store.getSession(sidOf(cookie))!.expiresAt = Date.now() - 1;

    const again = await enter(new Request(`${BASE}/t/open-tour/enter`, { headers: { cookie } }), ctx({ slug: 'open-tour' }));
    expect(again.headers.get('location')).toBe('/bye');

    const s = await sessionRoute(new Request(BASE, { headers: { cookie } }), ctx({ slug: 'open-tour' }));
    expect(s.status).toBe(401);
    expect((await s.json()).redirect).toBe('/bye');
    expect((await fetchMedia(url, { cookie })).status).toBe(401);
  });

  test('code tours need a valid code and limit devices per code', async () => {
    const tryCode = (code: string, cookie = '') =>
      enter(new Request(`${BASE}/t/code-tour/enter?code=${code}`, { headers: { cookie } }), ctx({ slug: 'code-tour' }));

    const none = await enter(new Request(`${BASE}/t/code-tour/enter`), ctx({ slug: 'code-tour' }));
    expect(none.headers.get('location')).toBe('/t/code-tour');
    expect(cookieOf(none)).toBe('');

    expect((await tryCode('NOPE1234')).headers.get('location')).toBe('/t/code-tour?error=unknown_code');

    const pass = app.store.createPass({ slug: 'code-tour', minutes: 30, devices: 1 });
    const first = await tryCode(pass.code.toLowerCase());
    expect(first.headers.get('location')).toBe('/t/code-tour');
    expect(cookieOf(first)).toMatch(/^ag_code_tour=/);
    expect((await tryCode(pass.code)).headers.get('location')).toBe('/t/code-tour?error=code_device_limit');
    // The same phone scanning again just goes back in.
    expect((await tryCode(pass.code, cookieOf(first))).headers.get('location')).toBe('/t/code-tour');
  });
});
