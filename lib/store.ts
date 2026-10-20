import fs from 'node:fs';
import path from 'node:path';
import { newId } from './tokens';
import type { Tour } from './tours';

// Sessions, access passes and an append-only event log, kept as JSON files in data/.
// Fine for a single server process; move to a database if you run several.
//
// A pass is one QR code. Like a queue ticket in a restaurant: its timer starts on the
// first scan, it stops working when time is up or staff revoke it, and staff can extend
// or reopen it. The pass owns the expiry; its sessions follow it.

export interface Session {
  sid: string;
  slug: string;
  code: string | null;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  ip: string;
  ua: string;
  plays: number;
  recentFetches: { key: string; at: number }[];
}

export interface Pass {
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
}

export type PassStatus = 'unused' | 'active' | 'expired' | 'revoked';
export type RedeemFailure = 'unknown_code' | 'code_revoked' | 'code_expired' | 'code_device_limit';
export interface Meta {
  ip?: string;
  ua?: string;
}

export interface TourStats {
  sessions: number;
  activeSessions: number;
  plays: number;
  passes: number;
  activePasses: number;
  unusedPasses: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no 0/O/1/I

export class Store {
  private sessionsFile: string;
  private passesFile: string;
  private eventsFile: string;
  sessions: Map<string, Session>;
  passes: Map<string, Pass>;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.sessionsFile = path.join(dataDir, 'sessions.json');
    this.passesFile = path.join(dataDir, 'passes.json');
    this.eventsFile = path.join(dataDir, 'events.jsonl');
    this.sessions = new Map(Object.entries(readJson<Record<string, Session>>(this.sessionsFile, {})));
    this.passes = new Map(Object.entries(readJson<Record<string, Pass>>(this.passesFile, {})));
  }

  // --- sessions ---------------------------------------------------------

  startSession(tour: Tour, { code = null, ip = '', ua = '', expiresAt = null }: Meta & { code?: string | null; expiresAt?: number | null } = {}, now = Date.now()): Session {
    const session: Session = {
      sid: newId(),
      slug: tour.slug,
      code,
      createdAt: now,
      expiresAt: expiresAt ?? now + tour.access.sessionMinutes * 60_000,
      lastSeenAt: now,
      ip,
      ua: ua.slice(0, 200),
      plays: 0,
      recentFetches: [],
    };
    this.sessions.set(session.sid, session);
    this.log('session_start', { slug: tour.slug, sid: session.sid, code, ip });
    this.scheduleSave();
    return session;
  }

  getSession(sid: string | null | undefined): Session | null {
    return (sid && this.sessions.get(sid)) || null;
  }

  isActive(session: Session | null, now = Date.now()): session is Session {
    return Boolean(session) && now < session!.expiresAt;
  }

  touch(session: Session, now = Date.now()) {
    session.lastSeenAt = now;
    this.scheduleSave();
  }

  endSession(sid: string, now = Date.now()): boolean {
    const s = this.sessions.get(sid);
    if (!s) return false;
    s.expiresAt = Math.min(s.expiresAt, now);
    this.log('session_ended', { sid });
    this.scheduleSave();
    return true;
  }

  activeSessions(now = Date.now()): Session[] {
    return [...this.sessions.values()].filter((s) => now < s.expiresAt);
  }

  /** Counts distinct tracks fetched in the last minute, so bulk downloading can be limited. */
  recordFetch(session: Session, trackKey: string, now = Date.now()): number {
    session.recentFetches = session.recentFetches.filter((f) => now - f.at < 60_000);
    if (!session.recentFetches.some((f) => f.key === trackKey)) session.recentFetches.push({ key: trackKey, at: now });
    this.scheduleSave();
    return session.recentFetches.length;
  }

  // --- passes (QR codes) ------------------------------------------------

  createPass({ slug, minutes, devices = 1, note = '' }: { slug: string; minutes: number; devices?: number; note?: string }, now = Date.now()): Pass {
    let code: string;
    do code = randomCode(8);
    while (this.passes.has(code));
    const pass: Pass = {
      code,
      slug,
      note: String(note).slice(0, 120),
      minutes: Number(minutes),
      devices: Math.max(1, Math.floor(Number(devices)) || 1),
      createdAt: now,
      firstUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      sids: [],
    };
    this.passes.set(code, pass);
    this.log('pass_created', { code, slug, minutes: pass.minutes, devices: pass.devices });
    this.saveNow();
    return pass;
  }

  getPass(code: string | null | undefined): Pass | null {
    return (code && this.passes.get(code)) || null;
  }

  passStatus(pass: Pass, now = Date.now()): PassStatus {
    if (pass.revokedAt) return 'revoked';
    if (!pass.firstUsedAt) return 'unused';
    if (now >= (pass.expiresAt ?? 0)) return 'expired';
    return 'active';
  }

  listPasses({ slug }: { slug?: string } = {}, now = Date.now()) {
    return [...this.passes.values()]
      .filter((p) => !slug || p.slug === slug)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({ ...p, status: this.passStatus(p, now) }));
  }

  /** First scan starts the timer. Later scans may join from other devices up to the limit. */
  redeemPass(tour: Tour, code: string, meta: Meta = {}, now = Date.now()): { ok: true; session: Session } | { ok: false; reason: RedeemFailure } {
    const pass = this.passes.get(code);
    if (!pass || pass.slug !== tour.slug) return { ok: false, reason: 'unknown_code' };
    const status = this.passStatus(pass, now);
    if (status === 'revoked') return { ok: false, reason: 'code_revoked' };
    if (status === 'expired') return { ok: false, reason: 'code_expired' };
    if (pass.sids.length >= pass.devices) return { ok: false, reason: 'code_device_limit' };
    if (!pass.firstUsedAt) {
      pass.firstUsedAt = now;
      pass.expiresAt = now + pass.minutes * 60_000;
    }
    const session = this.startSession(tour, { ...meta, code, expiresAt: pass.expiresAt }, now);
    pass.sids.push(session.sid);
    this.saveNow();
    return { ok: true, session };
  }

  /** Adds time. An expired or revoked pass is reopened from now. */
  extendPass(code: string, minutes: number, now = Date.now()): Pass | null {
    const pass = this.passes.get(code);
    if (!pass) return null;
    pass.revokedAt = null;
    if (!pass.firstUsedAt) pass.minutes += minutes;
    else pass.expiresAt = Math.max(pass.expiresAt ?? now, now) + minutes * 60_000;
    this.syncSessions(pass);
    this.log('pass_extended', { code, minutes });
    this.saveNow();
    return pass;
  }

  revokePass(code: string, now = Date.now()): Pass | null {
    const pass = this.passes.get(code);
    if (!pass) return null;
    pass.revokedAt = now;
    for (const sid of pass.sids) {
      const s = this.sessions.get(sid);
      if (s) s.expiresAt = Math.min(s.expiresAt, now);
    }
    this.log('pass_revoked', { code });
    this.saveNow();
    return pass;
  }

  syncSessions(pass: Pass) {
    for (const sid of pass.sids) {
      const s = this.sessions.get(sid);
      if (s && pass.expiresAt) s.expiresAt = pass.expiresAt;
    }
  }

  // --- stats and log ----------------------------------------------------

  stats(now = Date.now()): Record<string, TourStats> {
    const bySlug: Record<string, TourStats> = {};
    const row = (slug: string) =>
      (bySlug[slug] ||= { sessions: 0, activeSessions: 0, plays: 0, passes: 0, activePasses: 0, unusedPasses: 0 });
    for (const s of this.sessions.values()) {
      const r = row(s.slug);
      r.sessions += 1;
      if (now < s.expiresAt) r.activeSessions += 1;
      r.plays += s.plays;
    }
    for (const p of this.passes.values()) {
      const r = row(p.slug);
      r.passes += 1;
      const st = this.passStatus(p, now);
      if (st === 'active') r.activePasses += 1;
      if (st === 'unused') r.unusedPasses += 1;
    }
    return bySlug;
  }

  log(type: string, data: Record<string, unknown> = {}) {
    const line = JSON.stringify({ at: new Date().toISOString(), type, ...data });
    fs.appendFile(this.eventsFile, line + '\n', () => {});
  }

  /** Drop sessions that ended more than `keepDays` ago so the file stays small. */
  prune(keepDays = 30, now = Date.now()) {
    const cutoff = now - keepDays * 86_400_000;
    for (const [sid, s] of this.sessions) if (s.expiresAt < cutoff) this.sessions.delete(sid);
    this.scheduleSave();
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.saveNow(), 1000);
    this.saveTimer.unref?.();
  }

  saveNow() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    writeJson(this.sessionsFile, Object.fromEntries(this.sessions));
    writeJson(this.passesFile, Object.fromEntries(this.passes));
  }
}

function randomCode(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
  fs.renameSync(tmp, file);
}
