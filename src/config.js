import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Settings come from environment variables, or from a .env file in the project folder.
export function loadConfig(env = { ...readDotEnv(path.join(root, '.env')), ...process.env }) {
  const secret = env.AG_SECRET || '';
  if (!secret && env.NODE_ENV === 'production') {
    throw new Error('AG_SECRET must be set in production (any long random string).');
  }
  return {
    root,
    port: Number(env.PORT || 3000),
    // Without AG_SECRET every restart signs people out and invalidates links.
    secret: secret || randomBytes(32).toString('hex'),
    toursDir: path.resolve(root, env.AG_TOURS_DIR || 'tours'),
    dataDir: path.resolve(root, env.AG_DATA_DIR || 'data'),
    publicDir: path.join(root, 'public'),
    adminPassword: env.AG_ADMIN_PASSWORD || '',
    maxUploadBytes: Number(env.AG_MAX_UPLOAD_MB || 300) * 1024 * 1024,
    // How long a signed audio link stays valid. The player asks for a new one per track.
    mediaLinkSeconds: Number(env.AG_MEDIA_LINK_SECONDS || 90),
    trustProxy: env.AG_TRUST_PROXY === '1',
  };
}

function readDotEnv(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}
