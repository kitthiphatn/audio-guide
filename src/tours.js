import fs from 'node:fs';
import path from 'node:path';

// Each folder in tours/ with a tour.json is one tour page at /t/<folder-name>.
// Audio files live in that folder too, but are never served as static files:
// they are only reachable through signed, session-bound links (see media.js).

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DEFAULTS = {
  sessionMinutes: 180,
  mode: 'open',
  expiredRedirect: '/expired',
  maxTracksPerMinute: 8,
};

export class TourRegistry {
  constructor(toursDir, { ttlMs = 5000 } = {}) {
    this.toursDir = toursDir;
    this.ttlMs = ttlMs;
    this.loadedAt = 0;
    this.tours = new Map();
    this.errors = [];
  }

  get(slug) {
    this.refresh();
    return this.tours.get(slug) || null;
  }

  list() {
    this.refresh();
    return [...this.tours.values()];
  }

  refresh(force = false) {
    if (!force && Date.now() - this.loadedAt < this.ttlMs) return;
    const tours = new Map();
    const errors = [];
    let entries = [];
    try {
      entries = fs.readdirSync(this.toursDir, { withFileTypes: true });
    } catch (err) {
      errors.push(`${this.toursDir}: ${err.message}`);
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !SLUG.test(entry.name)) continue;
      const dir = path.join(this.toursDir, entry.name);
      const file = path.join(dir, 'tour.json');
      if (!fs.existsSync(file)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        tours.set(entry.name, normalizeTour(entry.name, dir, raw));
      } catch (err) {
        errors.push(`${entry.name}/tour.json: ${err.message}`);
      }
    }
    for (const e of errors) if (!this.errors.includes(e)) console.error(`[tours] ${e}`);
    this.tours = tours;
    this.errors = errors;
    this.loadedAt = Date.now();
  }
}

export function normalizeTour(slug, dir, raw) {
  if (!raw || typeof raw !== 'object') throw new Error('tour.json must be an object');
  const languages = raw.languages;
  if (!languages || typeof languages !== 'object' || !Object.keys(languages).length) {
    throw new Error('"languages" must list at least one language, e.g. {"th": {"label": "ไทย"}}');
  }
  const langCodes = Object.keys(languages);
  if (!Array.isArray(raw.stops) || raw.stops.length === 0) {
    throw new Error('"stops" must be a non-empty array');
  }
  const stops = raw.stops.map((stop, i) => {
    const where = `stops[${i}]`;
    if (!stop.audio || typeof stop.audio !== 'object') throw new Error(`${where}.audio is required`);
    const audio = {};
    for (const [lang, rel] of Object.entries(stop.audio)) {
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
  const access = { ...DEFAULTS, ...(raw.access || {}) };
  if (!['open', 'code'].includes(access.mode)) throw new Error('access.mode must be "open" or "code"');
  const defaultLanguage = langCodes.includes(raw.defaultLanguage) ? raw.defaultLanguage : langCodes[0];
  return {
    slug,
    dir,
    title: raw.title || { [defaultLanguage]: slug },
    subtitle: raw.subtitle || {},
    listed: raw.listed !== false,
    defaultLanguage,
    languages,
    heroImages: (raw.heroImages || []).filter((p) => typeof p === 'string'),
    theme: raw.theme || {},
    links: raw.links || [],
    access,
    stops,
  };
}

// Everything the browser is allowed to see. Audio paths are deliberately left out.
export function publicTour(tour) {
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

export function resolveInside(dir, rel, label = 'path') {
  if (typeof rel !== 'string' || !rel) throw new Error(`${label} must be a relative path`);
  const full = path.resolve(dir, rel);
  if (full !== dir && !full.startsWith(dir + path.sep)) throw new Error(`${label} points outside the tour folder`);
  return full;
}
