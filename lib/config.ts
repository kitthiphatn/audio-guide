import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export interface Config {
  toursDir: string;
  dataDir: string;
  secret: string;
  adminPassword: string;
  maxUploadBytes: number;
  mediaLinkSeconds: number;
  trustProxy: boolean;
}

// Next.js loads .env into process.env. Paths are relative to the project folder.
export function loadConfig(env: NodeJS.ProcessEnv = process.env, root = process.cwd()): Config {
  const dataDir = path.resolve(root, env.AG_DATA_DIR || 'data');
  return {
    toursDir: path.resolve(root, env.AG_TOURS_DIR || 'tours'),
    dataDir,
    secret: env.AG_SECRET || persistedSecret(dataDir),
    adminPassword: env.AG_ADMIN_PASSWORD || '',
    maxUploadBytes: Number(env.AG_MAX_UPLOAD_MB || 300) * 1024 * 1024,
    mediaLinkSeconds: Number(env.AG_MEDIA_LINK_SECONDS || 90),
    trustProxy: env.AG_TRUST_PROXY === '1',
  };
}

// Without AG_SECRET, generate one once and keep it in data/, so restarts don't sign everyone out.
function persistedSecret(dataDir: string): string {
  const file = path.join(dataDir, '.secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    fs.mkdirSync(dataDir, { recursive: true });
    const secret = randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}
