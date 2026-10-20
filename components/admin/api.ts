'use client';

// Browser-side helper for the admin API. Every call sends "x-admin: 1"; a 401 sends
// the user back to the sign-in screen.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
  const headers: Record<string, string> = { 'x-admin': '1' };
  if (body !== undefined && !raw) headers['content-type'] = 'application/json';
  const res = await fetch(`/api/admin/${path}`, {
    method,
    headers,
    cache: 'no-store',
    body: body === undefined ? undefined : raw ? (body as BodyInit) : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== 'login') {
    window.location.reload();
    throw new ApiError('login_required', 401);
  }
  if (!res.ok) throw new ApiError(data.error || `HTTP ${res.status}`, res.status);
  return data as T;
}

export interface OverviewTour {
  slug: string;
  title: string | Record<string, string>;
  defaultLanguage: string;
  mode: 'open' | 'code';
  sessionMinutes: number;
  stops: number;
  stats: { sessions: number; activeSessions: number; plays: number; passes: number; activePasses: number; unusedPasses: number };
}

export interface Overview {
  now: number;
  loadErrors: string[];
  tours: OverviewTour[];
  sessions: { sid: string; slug: string; code: string | null; note: string; createdAt: number; expiresAt: number; lastSeenAt: number; plays: number }[];
}

export interface PassRow {
  code: string;
  slug: string;
  note: string;
  minutes: number;
  devices: number;
  createdAt: number;
  firstUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
  sids: string[];
  status: 'unused' | 'active' | 'expired' | 'revoked';
}

export const fmtLeft = (ms: number) => {
  if (ms <= 0) return 'หมดเวลา';
  const m = Math.ceil(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)} ชม. ${m % 60} น.` : `${m} นาที`;
};

export const fmtWhen = (t: number | null) => (t ? new Date(t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '–');
