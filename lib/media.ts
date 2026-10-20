import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { sign, verify, newId } from './tokens';
import type { Store, Session } from './store';
import type { Tour, TourRegistry } from './tours';

// Audio never has a public URL. The player asks /api/tours/<slug>/play for a short-lived
// link bound to the visitor's session; the link stops working after it expires, when the
// session ends, or when it is opened without the session cookie.

const AUDIO_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
};

interface LinkClaim {
  sid: string;
  slug: string;
  i: number;
  l: string;
  exp: number;
}

export function issueLink(opts: { session: Session; tour: Tour; stopIndex: number; lang: string; secret: string; seconds: number; now?: number }) {
  const { session, tour, stopIndex, lang, secret, seconds, now = Date.now() } = opts;
  const token = sign({ sid: session.sid, slug: tour.slug, i: stopIndex, l: lang, exp: now + seconds * 1000, n: newId(6) }, secret);
  return `/media/${token}`;
}

export function readLinkClaim(token: string, secret: string) {
  return verify<LinkClaim>(token, secret);
}

export type LinkCheck = { ok: true; file: string } | { ok: false; status: number; reason: string };

export function checkLink(opts: { token: string; secret: string; store: Store; tours: TourRegistry; cookieSid: string | null; now?: number }): LinkCheck {
  const { token, secret, store, tours, cookieSid, now = Date.now() } = opts;
  const claim = readLinkClaim(token, secret);
  if (!claim) return { ok: false, status: 403, reason: 'bad_link' };
  if (now > claim.exp) return { ok: false, status: 403, reason: 'link_expired' };
  if (!cookieSid || cookieSid !== claim.sid) return { ok: false, status: 403, reason: 'wrong_session' };
  if (!store.isActive(store.getSession(claim.sid), now)) return { ok: false, status: 401, reason: 'session_expired' };
  const file = tours.get(claim.slug)?.stops[claim.i]?.audio[claim.l];
  if (!file) return { ok: false, status: 404, reason: 'not_found' };
  return { ok: true, file };
}

/** Streams a file with HTTP Range support (needed for seeking and for Safari). */
export function audioResponse(file: string, rangeHeader: string | null, method: string): Response {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const headers: Record<string, string> = {
    'Content-Type': AUDIO_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'Content-Disposition': 'inline',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || '');
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : size - Number(range[2]);
    end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = String(end - start + 1);
  if (method === 'HEAD' || size === 0) return new Response(null, { status, headers });
  const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
  return new Response(stream, { status, headers });
}
