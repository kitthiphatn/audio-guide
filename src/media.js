import fs from 'node:fs';
import path from 'node:path';
import { sign, verify, newId } from './tokens.js';

// Audio never has a public URL. The player asks /api/<slug>/play for a short-lived
// link bound to the visitor's session; the link stops working after it expires,
// when the session ends, or when it is opened without the session cookie.

const AUDIO_TYPES = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
};

export function issueLink({ session, tour, stopIndex, lang, secret, seconds, now = Date.now() }) {
  const token = sign(
    { sid: session.sid, slug: tour.slug, i: stopIndex, l: lang, exp: now + seconds * 1000, n: newId(6) },
    secret,
  );
  return `/media/${token}`;
}

// Returns { ok: true, file } or { ok: false, status, reason }.
export function checkLink({ token, secret, store, tours, cookieSid, now = Date.now() }) {
  const claim = verify(token, secret);
  if (!claim) return { ok: false, status: 403, reason: 'bad_link' };
  if (now > claim.exp) return { ok: false, status: 403, reason: 'link_expired' };
  if (!cookieSid || cookieSid !== claim.sid) return { ok: false, status: 403, reason: 'wrong_session' };
  const session = store.getSession(claim.sid);
  if (!store.isActive(session, now)) return { ok: false, status: 401, reason: 'session_expired' };
  const tour = tours.get(claim.slug);
  const file = tour?.stops[claim.i]?.audio[claim.l];
  if (!file) return { ok: false, status: 404, reason: 'not_found' };
  return { ok: true, file, session, tour };
}

// Streams a file with HTTP Range support (needed for seeking and for Safari).
export function sendAudio(req, res, file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    res.writeHead(404).end();
    return;
  }
  const type = AUDIO_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}
