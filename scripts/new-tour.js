// Usage: npm run new-tour -- <slug> [language codes...]
// Example: npm run new-tour -- wat-pho th en zh
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config.js';

const [slug, ...langArgs] = process.argv.slice(2);
if (!slug || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
  console.error('Usage: npm run new-tour -- <slug> [languages...]   (slug: lowercase letters, digits, dashes)');
  process.exit(1);
}
const langs = langArgs.length ? langArgs : ['th', 'en'];
const LABELS = { th: 'ไทย', en: 'English', zh: '中文', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский' };

const { toursDir } = loadConfig({ ...process.env, AG_SECRET: 'unused' });
const dir = path.join(toursDir, slug);
if (fs.existsSync(dir)) {
  console.error(`tours/${slug} already exists`);
  process.exit(1);
}

const text = (value) => Object.fromEntries(langs.map((l) => [l, value]));
const tour = {
  title: text('New tour'),
  subtitle: text(''),
  defaultLanguage: langs[0],
  languages: Object.fromEntries(langs.map((l) => [l, { label: LABELS[l] || l }])),
  access: { mode: 'open', sessionMinutes: 180, expiredRedirect: '/expired', maxTracksPerMinute: 8 },
  heroImages: [],
  links: [],
  stops: [1, 2].map((n) => ({
    id: String(n),
    title: text(`Stop ${n}`),
    transcript: text(''),
    lat: null,
    lng: null,
    audio: Object.fromEntries(langs.map((l) => [l, `audio/${l}/${String(n).padStart(2, '0')}.mp3`])),
  })),
};

for (const l of langs) fs.mkdirSync(path.join(dir, 'audio', l), { recursive: true });
fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
fs.writeFileSync(path.join(dir, 'tour.json'), JSON.stringify(tour, null, 2) + '\n');
console.log(`Created tours/${slug}. Put audio files in tours/${slug}/audio/<lang>/ and edit tour.json.`);
console.log(`Page: http://localhost:3000/t/${slug}`);
