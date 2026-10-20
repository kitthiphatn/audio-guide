import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
import { sign } from '../src/tokens.js';

let tmp, app, base, config;

function writeTour(slug, access) {
  const dir = path.join(tmp, 'tours', slug);
  fs.mkdirSync(path.join(dir, 'audio', 'th'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'audio', 'th', '01.mp3'), Buffer.alloc(1000, 7));
  fs.writeFileSync(path.join(dir, 'audio', 'th', '02.mp3'), Buffer.alloc(500, 9));
  fs.writeFileSync(
    path.join(dir, 'tour.json'),
    JSON.stringify({
      title: { th: slug },
      languages: { th: { label: 'ไทย' } },
      access,
      stops: [
        { title: { th: 'A' }, lat: 13.75, lng: 100.49, audio: { th: 'audio/th/01.mp3' } },
        { title: { th: 'B' }, audio: { th: 'audio/th/02.mp3' } },
      ],
    }),
  );
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-'));
  writeTour('open-tour', { mode: 'open', sessionMinutes: 60, expiredRedirect: '/bye', maxTracksPerMinute: 2 });
  writeTour('code-tour', { mode: 'code', sessionMinutes: 60 });
  config = {
    root: tmp,
    port: 0,
    secret: 'test-secret',
    toursDir: path.join(tmp, 'tours'),
    dataDir: path.join(tmp, 'data'),
    publicDir: path.resolve('public'),
    adminKey: 'admin',
    mediaLinkSeconds: 60,
    trustProxy: false,
  };
  app = createApp(config);
  await new Promise((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});

after(() => {
  app.server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const cookieOf = (res) => res.headers.get('set-cookie')?.split(';')[0];

async function openSession(slug = 'open-tour') {
  const res = await fetch(`${base}/t/${slug}`);
  assert.equal(res.status, 200);
  const cookie = cookieOf(res);
  assert.ok(cookie, 'session cookie set');
  return cookie;
}

async function play(cookie, stop = 0) {
  return fetch(`${base}/api/open-tour/play`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ stop, lang: 'th' }),
  });
}

test('tour page never exposes audio file paths', async () => {
  const res = await fetch(`${base}/t/open-tour`);
  const html = await res.text();
  assert.match(html, /tour-data/);
  assert.doesNotMatch(html, /\.mp3/);
});

test('audio files are not reachable as static files', async () => {
  const res = await fetch(`${base}/t/open-tour/audio/th/01.mp3`);
  assert.equal(res.status, 404);
  const traversal = await fetch(`${base}/t/open-tour/..%2F..%2Fpackage.json`);
  assert.equal(traversal.status, 404);
});

test('a session gets a working, range-capable audio link', async () => {
  const cookie = await openSession();
  const res = await play(cookie);
  assert.equal(res.status, 200);
  const { url } = await res.json();
  const full = await fetch(base + url, { headers: { cookie } });
  assert.equal(full.status, 200);
  assert.equal((await full.arrayBuffer()).byteLength, 1000);
  const part = await fetch(base + url, { headers: { cookie, range: 'bytes=100-199' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 100-199/1000');
  assert.equal((await part.arrayBuffer()).byteLength, 100);
});

test('an audio link does not work without its session cookie', async () => {
  const cookie = await openSession();
  const { url } = await (await play(cookie)).json();
  assert.equal((await fetch(base + url)).status, 403);
  const other = await openSession();
  assert.equal((await fetch(base + url, { headers: { cookie: other } })).status, 403);
});

test('expired links and forged links are refused', async () => {
  const cookie = await openSession();
  const sid = JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[0], 'base64url')).sid;
  const old = sign({ sid, slug: 'open-tour', i: 0, l: 'th', exp: Date.now() - 1000, n: 'x' }, config.secret);
  assert.equal((await fetch(`${base}/media/${old}`, { headers: { cookie } })).status, 403);
  const forged = sign({ sid, slug: 'open-tour', i: 0, l: 'th', exp: Date.now() + 60000, n: 'x' }, 'wrong');
  assert.equal((await fetch(`${base}/media/${forged}`, { headers: { cookie } })).status, 403);
});

test('too many different tracks per minute is rate limited', async () => {
  const cookie = await openSession();
  assert.equal((await play(cookie, 0)).status, 200);
  assert.equal((await play(cookie, 1)).status, 200);
  assert.equal((await play(cookie, 0)).status, 200, 'replaying a fetched track is fine');
  // Third distinct track within the minute exceeds maxTracksPerMinute=2.
  const tour = app.tours.get('open-tour');
  tour.stops.push({ ...tour.stops[0], id: 'c' });
  assert.equal((await play(cookie, 2)).status, 429);
  tour.stops.pop();
});

test('an expired session redirects and stops audio', async () => {
  const cookie = await openSession();
  const { url } = await (await play(cookie)).json();
  const sid = JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[0], 'base64url')).sid;
  app.store.getSession(sid).expiresAt = Date.now() - 1;

  const page = await fetch(`${base}/t/open-tour`, { headers: { cookie }, redirect: 'manual' });
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/bye');

  const api = await fetch(`${base}/api/open-tour/session`, { headers: { cookie } });
  assert.equal(api.status, 401);
  assert.equal((await api.json()).redirect, '/bye');

  assert.equal((await fetch(base + url, { headers: { cookie } })).status, 401);
});

test('code tours need a valid code and limit devices per code', async () => {
  const page = await fetch(`${base}/t/code-tour`);
  assert.match(await page.text(), /name="code"/);
  assert.equal((await fetch(`${base}/t/code-tour?code=NOPE`)).status, 403);

  const [code] = app.store.createCodes('code-tour', 1, { devices: 1 });
  const first = await fetch(`${base}/t/code-tour?code=${code}`, { redirect: 'manual' });
  assert.equal(first.status, 302);
  const cookie = cookieOf(first);
  assert.equal((await fetch(`${base}/t/code-tour`, { headers: { cookie } })).status, 200);

  const second = await fetch(`${base}/t/code-tour?code=${code}`, { redirect: 'manual' });
  assert.equal(second.status, 403, 'second device is refused');
});

test('admin stats count sessions and need the admin key', async () => {
  assert.equal((await fetch(`${base}/admin/stats`)).status, 403);
  const res = await fetch(`${base}/admin/stats`, { headers: { 'x-admin-key': 'admin' } });
  const stats = await res.json();
  assert.ok(stats['open-tour'].total >= 1);
  assert.ok(stats['open-tour'].plays >= 1);
});

test('a stop whose audio file is missing reports missing_audio', async () => {
  const cookie = await openSession();
  const file = path.join(tmp, 'tours', 'open-tour', 'audio', 'th', '02.mp3');
  fs.renameSync(file, file + '.bak');
  try {
    const res = await play(cookie, 1);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'missing_audio');
  } finally {
    fs.renameSync(file + '.bak', file);
  }
});

test('pages send a Referer-friendly policy so map tiles load', async () => {
  const res = await fetch(`${base}/t/open-tour`);
  assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});
