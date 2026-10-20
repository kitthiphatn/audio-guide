import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

// Compact signed tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
// Used for the session cookie and for short-lived audio links.

export function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body, secret)}`;
}

export function verify(token, secret) {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(mac(body, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function newId(bytes = 12) {
  return randomBytes(bytes).toString('base64url');
}

function mac(body, secret) {
  return createHmac('sha256', secret).update(body).digest('base64url');
}
