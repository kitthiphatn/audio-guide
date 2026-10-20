import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

// Compact signed tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
// Used for the visitor cookie, the admin cookie and short-lived audio links.

export function sign(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body, secret)}`;
}

export function verify<T = Record<string, unknown>>(token: string | undefined | null, secret: string): T | null {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(mac(body, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function newId(bytes = 12): string {
  return randomBytes(bytes).toString('base64url');
}

function mac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}
