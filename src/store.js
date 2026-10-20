import fs from 'node:fs';
import path from 'node:path';
import { newId } from './tokens.js';

// Sessions, access codes and an append-only event log, kept as JSON files in data/.
// Fine for a single server process; move to a database if you run several.

export class Store {
  constructor(dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.sessionsFile = path.join(dataDir, 'sessions.json');
    this.codesFile = path.join(dataDir, 'codes.json');
    this.eventsFile = path.join(dataDir, 'events.jsonl');
    this.sessions = new Map(Object.entries(readJson(this.sessionsFile, {})));
    this.codes = readJson(this.codesFile, {});
    this.saveTimer = null;
  }

  // --- sessions ---------------------------------------------------------

  startSession(tour, { code = null, ip = '', ua = '' } = {}, now = Date.now()) {
    const session = {
      sid: newId(),
      slug: tour.slug,
      code,
      createdAt: now,
      expiresAt: now + tour.access.sessionMinutes * 60_000,
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

  getSession(sid) {
    return (sid && this.sessions.get(sid)) || null;
  }

  isActive(session, now = Date.now()) {
    return Boolean(session) && now < session.expiresAt;
  }

  touch(session, now = Date.now()) {
    session.lastSeenAt = now;
    this.scheduleSave();
  }

  // Counts audio fetches in the last minute, so bulk downloaders can be spotted.
  recordFetch(session, trackKey, now = Date.now()) {
    session.recentFetches = session.recentFetches.filter((f) => now - f.at < 60_000);
    if (!session.recentFetches.some((f) => f.key === trackKey)) {
      session.recentFetches.push({ key: trackKey, at: now });
    }
    this.scheduleSave();
    return session.recentFetches.length;
  }

  // --- access codes -----------------------------------------------------

  createCodes(slug, count, { devices = 2 } = {}) {
    const bucket = (this.codes[slug] ||= {});
    const created = [];
    for (let i = 0; i < count; i++) {
      const code = newId(6).replace(/[-_]/g, 'x').toUpperCase().slice(0, 8);
      bucket[code] = { createdAt: Date.now(), devices, sids: [], firstUsedAt: null };
      created.push(code);
    }
    this.saveNow();
    return created;
  }

  // A code starts its timer on first use and can be opened on a limited number of devices.
  redeemCode(tour, code, meta, now = Date.now()) {
    const entry = this.codes[tour.slug]?.[code];
    if (!entry) return { ok: false, reason: 'unknown_code' };
    if (entry.firstUsedAt && now >= entry.firstUsedAt + tour.access.sessionMinutes * 60_000) {
      return { ok: false, reason: 'code_expired' };
    }
    if (entry.sids.length >= entry.devices) return { ok: false, reason: 'code_device_limit' };
    const session = this.startSession(tour, { ...meta, code }, now);
    if (entry.firstUsedAt) session.expiresAt = entry.firstUsedAt + tour.access.sessionMinutes * 60_000;
    else entry.firstUsedAt = now;
    entry.sids.push(session.sid);
    this.saveNow();
    return { ok: true, session };
  }

  // --- stats and log ----------------------------------------------------

  stats(now = Date.now()) {
    const bySlug = {};
    for (const s of this.sessions.values()) {
      const row = (bySlug[s.slug] ||= { total: 0, active: 0, plays: 0 });
      row.total += 1;
      if (now < s.expiresAt) row.active += 1;
      row.plays += s.plays;
    }
    return bySlug;
  }

  log(type, data = {}) {
    const line = JSON.stringify({ at: new Date().toISOString(), type, ...data });
    fs.appendFile(this.eventsFile, line + '\n', () => {});
  }

  // Drop sessions that ended more than `keepDays` ago so the file stays small.
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
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    writeJson(this.sessionsFile, Object.fromEntries(this.sessions));
    writeJson(this.codesFile, this.codes);
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
  fs.renameSync(tmp, file);
}
