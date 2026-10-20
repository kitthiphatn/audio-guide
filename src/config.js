import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(env = process.env) {
  const secret = env.AG_SECRET || '';
  if (!secret && env.NODE_ENV === 'production') {
    throw new Error('AG_SECRET must be set in production (any long random string).');
  }
  return {
    root,
    port: Number(env.PORT || 3000),
    // Without AG_SECRET every restart invalidates all sessions and links.
    secret: secret || randomBytes(32).toString('hex'),
    toursDir: path.resolve(root, env.AG_TOURS_DIR || 'tours'),
    dataDir: path.resolve(root, env.AG_DATA_DIR || 'data'),
    publicDir: path.join(root, 'public'),
    adminKey: env.AG_ADMIN_KEY || '',
    // How long a signed audio link stays valid. The player asks for a new one per track.
    mediaLinkSeconds: Number(env.AG_MEDIA_LINK_SECONDS || 90),
    trustProxy: env.AG_TRUST_PROXY === '1',
  };
}
