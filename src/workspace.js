import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { normalizeTour, resolveInside } from './tours.js';

// File operations behind the admin workspace: create, edit, copy tours and upload media.
// Every write goes through normalizeTour first, so a saved tour.json is always loadable.

export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UPLOAD_EXT = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.jpg', '.jpeg', '.png', '.webp', '.svg']);
const LABELS = { th: 'ไทย', en: 'English', zh: '中文', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский' };

export class WorkspaceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function starterTour(langs = ['th', 'en']) {
  const text = (value) => Object.fromEntries(langs.map((l) => [l, value]));
  return {
    title: text('New tour'),
    subtitle: text(''),
    defaultLanguage: langs[0],
    languages: Object.fromEntries(langs.map((l) => [l, { label: LABELS[l] || l }])),
    access: { mode: 'code', sessionMinutes: 180, expiredRedirect: '/expired', maxTracksPerMinute: 8 },
    listed: false,
    heroImages: [],
    links: [],
    stops: [{ id: '1', title: text('Stop 1'), transcript: text(''), lat: null, lng: null, audio: {} }],
  };
}

export function createTour(toursDir, slug, langs, from = null) {
  if (!SLUG.test(slug || '')) throw new WorkspaceError(400, 'ชื่อทัวร์ใช้ได้เฉพาะ a-z, 0-9 และ - (เช่น wat-pho)');
  const dir = path.join(toursDir, slug);
  if (fs.existsSync(dir)) throw new WorkspaceError(409, `มีทัวร์ชื่อ ${slug} อยู่แล้ว`);
  let raw;
  if (from) {
    // Copy a tour as a template: settings, text and images. Audio is not copied.
    const srcDir = tourDir(toursDir, from);
    raw = readTourRaw(toursDir, from);
    for (const stop of raw.stops || []) stop.audio = {};
    fs.mkdirSync(dir, { recursive: true });
    const images = path.join(srcDir, 'images');
    if (fs.existsSync(images)) fs.cpSync(images, path.join(dir, 'images'), { recursive: true });
  } else {
    const codes = (langs || []).filter((l) => /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(l));
    raw = starterTour(codes.length ? codes : ['th', 'en']);
  }
  fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
  normalizeTour(slug, dir, raw);
  writeAtomic(path.join(dir, 'tour.json'), JSON.stringify(raw, null, 2) + '\n');
  return raw;
}

export function readTourRaw(toursDir, slug) {
  const file = path.join(tourDir(toursDir, slug), 'tour.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function saveTourRaw(toursDir, slug, raw) {
  const dir = tourDir(toursDir, slug);
  try {
    normalizeTour(slug, dir, raw);
  } catch (err) {
    throw new WorkspaceError(400, err.message);
  }
  const file = path.join(dir, 'tour.json');
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  writeAtomic(file, JSON.stringify(raw, null, 2) + '\n');
}

export function listMedia(toursDir, slug) {
  const dir = tourDir(toursDir, slug);
  const out = [];
  for (const top of ['audio', 'images']) {
    walk(path.join(dir, top), (file, stat) => {
      if (UPLOAD_EXT.has(path.extname(file).toLowerCase())) {
        out.push({ path: path.relative(dir, file).split(path.sep).join('/'), size: stat.size });
      }
    });
  }
  return out;
}

export async function saveUpload(toursDir, slug, rel, stream, maxBytes) {
  const dir = tourDir(toursDir, slug);
  const file = mediaPath(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.uploading`;
  let size = 0;
  try {
    await pipeline(
      stream,
      async function* (source) {
        for await (const chunk of source) {
          size += chunk.length;
          if (size > maxBytes) throw new WorkspaceError(413, 'ไฟล์ใหญ่เกินกำหนด');
          yield chunk;
        }
      },
      fs.createWriteStream(tmp),
    );
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  return { path: path.relative(dir, file).split(path.sep).join('/'), size };
}

export function deleteMedia(toursDir, slug, rel) {
  const file = mediaPath(tourDir(toursDir, slug), rel);
  if (!fs.existsSync(file)) throw new WorkspaceError(404, 'ไม่พบไฟล์');
  fs.rmSync(file);
}

function tourDir(toursDir, slug) {
  const dir = path.join(toursDir, slug || '');
  if (!SLUG.test(slug || '') || !fs.existsSync(path.join(dir, 'tour.json'))) throw new WorkspaceError(404, 'ไม่พบทัวร์');
  return dir;
}

function mediaPath(dir, rel) {
  let file;
  try {
    file = resolveInside(dir, String(rel || ''));
  } catch {
    throw new WorkspaceError(400, 'ที่อยู่ไฟล์ไม่ถูกต้อง');
  }
  const top = path.relative(dir, file).split(path.sep)[0];
  if (!['audio', 'images'].includes(top)) throw new WorkspaceError(400, 'อัปโหลดได้เฉพาะในโฟลเดอร์ audio/ หรือ images/');
  if (!UPLOAD_EXT.has(path.extname(file).toLowerCase())) throw new WorkspaceError(400, 'ชนิดไฟล์นี้อัปโหลดไม่ได้');
  return file;
}

function walk(dir, visit) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, visit);
    else if (e.isFile()) visit(full, fs.statSync(full));
  }
}

function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
