import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';

let tmp, app, base, admin;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-admin-'));
  fs.mkdirSync(path.join(tmp, 'tours'));
  app = createApp({
    root: tmp,
    port: 0,
    secret: 'test-secret',
    toursDir: path.join(tmp, 'tours'),
    dataDir: path.join(tmp, 'data'),
    publicDir: path.resolve('public'),
    adminPassword: 'correct horse',
    maxUploadBytes: 2048,
    mediaLinkSeconds: 60,
    trustProxy: false,
  });
  await new Promise((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});

after(() => {
  app.server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function call(method, p, body, { raw = false, cookie = admin, header = true } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (header) headers['x-admin'] = '1';
  if (body !== undefined && !raw) headers['content-type'] = 'application/json';
  return fetch(`${base}/admin/api/${p}`, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
}

test('the dashboard needs the admin password', async () => {
  assert.equal((await call('GET', 'overview', undefined, { cookie: null })).status, 401);
  assert.equal((await call('POST', 'login', { password: 'wrong' }, { cookie: null })).status, 401);
  const res = await call('POST', 'login', { password: 'correct horse' }, { cookie: null });
  assert.equal(res.status, 200);
  admin = res.headers.get('set-cookie').split(';')[0];
  assert.match(res.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await call('GET', 'overview')).status, 200);
});

test('changes without the x-admin header are refused', async () => {
  assert.equal((await call('POST', 'tours', { slug: 'x' }, { header: false })).status, 403);
});

test('create, edit and copy a tour, with uploads', async () => {
  assert.equal((await call('POST', 'tours', { slug: 'Bad Slug' })).status, 400);
  assert.equal((await call('POST', 'tours', { slug: 'wat-pho', languages: ['th', 'en'] })).status, 201);
  assert.equal((await call('POST', 'tours', { slug: 'wat-pho' })).status, 409);

  const up = await call('PUT', `tours/wat-pho/media?path=${encodeURIComponent('audio/th/01.mp3')}`, Buffer.alloc(500, 1), { raw: true });
  assert.equal(up.status, 200);
  assert.equal((await call('PUT', `tours/wat-pho/media?path=${encodeURIComponent('../tour.json')}`, 'x', { raw: true })).status, 400);
  assert.equal((await call('PUT', `tours/wat-pho/media?path=${encodeURIComponent('audio/th/run.exe')}`, 'x', { raw: true })).status, 400);
  assert.equal((await call('PUT', `tours/wat-pho/media?path=${encodeURIComponent('audio/th/big.mp3')}`, Buffer.alloc(4096), { raw: true })).status, 413);
  assert.ok(!fs.existsSync(path.join(tmp, 'tours/wat-pho/audio/th/big.mp3')));

  const { raw, media } = await (await call('GET', 'tours/wat-pho')).json();
  assert.deepEqual(media.map((m) => m.path), ['audio/th/01.mp3']);
  raw.title.th = 'วัดโพธิ์';
  raw.stops[0].audio = { th: 'audio/th/01.mp3' };
  assert.equal((await call('PUT', 'tours/wat-pho', { raw })).status, 200);
  assert.equal(app.tours.get('wat-pho').title.th, 'วัดโพธิ์');

  const broken = { ...raw, stops: [] };
  const bad = await call('PUT', 'tours/wat-pho', { raw: broken });
  assert.equal(bad.status, 400);
  assert.equal(app.tours.get('wat-pho').stops.length, 1, 'invalid save leaves the tour unchanged');

  assert.equal((await call('POST', 'tours', { slug: 'wat-pho-copy', from: 'wat-pho' })).status, 201);
  const copy = await (await call('GET', 'tours/wat-pho-copy')).json();
  assert.equal(copy.raw.title.th, 'วัดโพธิ์');
  assert.deepEqual(copy.raw.stops[0].audio, {}, 'audio is not copied');
});

test('passes work like queue tickets: first scan starts, staff extend and revoke', async () => {
  const created = await (await call('POST', 'passes', { slug: 'wat-pho', minutes: 10, devices: 1, count: 2, note: 'table 5' })).json();
  assert.equal(created.passes.length, 2);
  const code = created.passes[0].code;
  assert.equal(created.passes[0].status, 'unused');

  const scan = await fetch(`${base}/t/wat-pho?code=${code}`, { redirect: 'manual' });
  assert.equal(scan.status, 302);
  const visitor = scan.headers.get('set-cookie').split(';')[0];
  const before = await (await fetch(`${base}/api/wat-pho/session`, { headers: { cookie: visitor } })).json();

  const ext = await (await call('POST', `passes/${code}/extend`, { minutes: 30 })).json();
  assert.equal(ext.status, 'active');
  const after = await (await fetch(`${base}/api/wat-pho/session`, { headers: { cookie: visitor } })).json();
  assert.equal(after.expiresAt - before.expiresAt, 30 * 60_000, 'visitor sees the extension');

  assert.equal((await call('POST', `passes/${code}/revoke`, {})).status, 200);
  assert.equal((await fetch(`${base}/api/wat-pho/session`, { headers: { cookie: visitor } })).status, 401);
  const again = await fetch(`${base}/t/wat-pho?code=${code}`);
  assert.equal(again.status, 403, 'a revoked code cannot be reused');

  // Reopening a revoked pass lets the same visitor back in.
  await call('POST', `passes/${code}/extend`, { minutes: 15 });
  assert.equal((await fetch(`${base}/api/wat-pho/session`, { headers: { cookie: visitor } })).status, 200);

  const list = await (await call('GET', 'passes?slug=wat-pho')).json();
  assert.equal(list.passes.length, 2);
  const overview = await (await call('GET', 'overview')).json();
  assert.equal(overview.tours.find((t) => t.slug === 'wat-pho').stats.unusedPasses, 1);
  assert.equal(overview.sessions.length, 1);
  assert.equal(overview.sessions[0].note, 'table 5');
});

test('an expired pass is refused until staff reopen it', async () => {
  const pass = app.store.createPass({ slug: 'wat-pho', minutes: 1, devices: 2 });
  const scan = await fetch(`${base}/t/wat-pho?code=${pass.code}`, { redirect: 'manual' });
  assert.equal(scan.status, 302);
  pass.expiresAt = Date.now() - 1;
  app.store.syncSessions(pass);
  assert.equal((await fetch(`${base}/t/wat-pho?code=${pass.code}`)).status, 403);
  await call('POST', `passes/${pass.code}/extend`, { minutes: 20 });
  assert.equal((await fetch(`${base}/t/wat-pho?code=${pass.code}`, { redirect: 'manual' })).status, 302);
});
