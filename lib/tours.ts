import fs from 'node:fs';
import path from 'node:path';

// Each folder in tours/ with a tour.json is one tour page at /t/<folder-name>.
// Audio files live in that folder too, but are never served as static files:
// they are only reachable through signed, session-bound links (see media.ts).

import type { Text } from './text';

export type { Text };

export interface Stop {
  id: string;
  title: Text;
  description: Text;
  transcript: Text;
  lat: number | null;
  lng: number | null;
  /** language code -> absolute file path */
  audio: Record<string, string>;
}

export interface Access {
  mode: 'open' | 'code';
  sessionMinutes: number;
  expiredRedirect: string;
  maxTracksPerMinute: number;
}

export interface Tour {
  slug: string;
  dir: string;
  title: Text;
  subtitle: Text;
  listed: boolean;
  defaultLanguage: string;
  languages: Record<string, { label?: string }>;
  heroImages: string[];
  theme: { accent?: string };
  links: { label: Text; url: string }[];
  access: Access;
  stops: Stop[];
}

export type PublicTour = ReturnType<typeof publicTour>;

export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DEFAULT_ACCESS: Access = { mode: 'open', sessionMinutes: 180, expiredRedirect: '/expired', maxTracksPerMinute: 8 };

export class TourRegistry {
  private loadedAt = 0;
  private tours = new Map<string, Tour>();
  errors: string[] = [];

  constructor(
    readonly toursDir: string,
    private readonly ttlMs = 5000,
  ) {}

  get(slug: string | undefined | null): Tour | null {
    this.refresh();
    return (slug && this.tours.get(slug)) || null;
  }

  list(): Tour[] {
    this.refresh();
    return [...this.tours.values()];
  }

  refresh(force = false) {
    if (!force && Date.now() - this.loadedAt < this.ttlMs) return;
    const tours = new Map<string, Tour>();
    const errors: string[] = [];
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(this.toursDir, { withFileTypes: true });
    } catch (err) {
      errors.push(`${this.toursDir}: ${(err as Error).message}`);
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !SLUG.test(entry.name)) continue;
      const dir = path.join(this.toursDir, entry.name);
      const file = path.join(dir, 'tour.json');
      if (!fs.existsSync(file)) continue;
      try {
        tours.set(entry.name, normalizeTour(entry.name, dir, JSON.parse(fs.readFileSync(file, 'utf8'))));
      } catch (err) {
        errors.push(`${entry.name}/tour.json: ${(err as Error).message}`);
      }
    }
    for (const e of errors) if (!this.errors.includes(e)) console.error(`[tours] ${e}`);
    this.tours = tours;
    this.errors = errors;
    this.loadedAt = Date.now();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeTour(slug: string, dir: string, raw: any): Tour {
  if (!raw || typeof raw !== 'object') throw new Error('tour.json must be an object');
  const languages = raw.languages;
  if (!languages || typeof languages !== 'object' || !Object.keys(languages).length) {
    throw new Error('"languages" must list at least one language, e.g. {"th": {"label": "ไทย"}}');
  }
  const langCodes = Object.keys(languages);
  if (!Array.isArray(raw.stops) || raw.stops.length === 0) throw new Error('"stops" must be a non-empty array');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stops: Stop[] = raw.stops.map((stop: any, i: number) => {
    const where = `stops[${i}]`;
    if (!stop || typeof stop !== 'object') throw new Error(`${where} must be an object`);
    const audio: Record<string, string> = {};
    for (const [lang, rel] of Object.entries(stop.audio || {})) {
      if (!langCodes.includes(lang)) throw new Error(`${where}.audio has unknown language "${lang}"`);
      audio[lang] = resolveInside(dir, rel, `${where}.audio.${lang}`);
    }
    const hasPoint = typeof stop.lat === 'number' && typeof stop.lng === 'number';
    return {
      id: String(stop.id ?? i + 1),
      title: stop.title || {},
      description: stop.description || {},
      transcript: stop.transcript || {},
      lat: hasPoint ? stop.lat : null,
      lng: hasPoint ? stop.lng : null,
      audio,
    };
  });
  const access: Access = { ...DEFAULT_ACCESS, ...(raw.access || {}) };
  if (!['open', 'code'].includes(access.mode)) throw new Error('access.mode must be "open" or "code"');
  if (!(access.sessionMinutes > 0)) throw new Error('access.sessionMinutes must be a positive number');
  const defaultLanguage = langCodes.includes(raw.defaultLanguage) ? raw.defaultLanguage : langCodes[0];
  return {
    slug,
    dir,
    title: raw.title || { [defaultLanguage]: slug },
    subtitle: raw.subtitle || {},
    listed: raw.listed !== false,
    defaultLanguage,
    languages,
    heroImages: (raw.heroImages || []).filter((p: unknown) => typeof p === 'string'),
    theme: raw.theme || {},
    links: Array.isArray(raw.links) ? raw.links : [],
    access,
    stops,
  };
}

// Everything the browser may see. Audio paths are deliberately left out.
export function publicTour(tour: Tour) {
  return {
    slug: tour.slug,
    title: tour.title,
    subtitle: tour.subtitle,
    defaultLanguage: tour.defaultLanguage,
    languages: tour.languages,
    heroImages: tour.heroImages.map((p) => `/t/${tour.slug}/${p.replace(/^\/+/, '')}`),
    theme: tour.theme,
    links: tour.links,
    expiredRedirect: tour.access.expiredRedirect,
    stops: tour.stops.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      transcript: s.transcript,
      lat: s.lat,
      lng: s.lng,
      languages: Object.keys(s.audio),
    })),
  };
}

export function resolveInside(dir: string, rel: unknown, label = 'path'): string {
  if (typeof rel !== 'string' || !rel) throw new Error(`${label} must be a relative path`);
  const full = path.resolve(dir, rel);
  if (full !== dir && !full.startsWith(dir + path.sep)) throw new Error(`${label} points outside the tour folder`);
  return full;
}
