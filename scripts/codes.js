// Usage: npm run codes -- <slug> <count> [devicesPerCode]
// Prints new access codes for a tour whose access.mode is "code".
// Stop the server first, or it may overwrite data/codes.json with its own copy.
import { loadConfig } from '../src/config.js';
import { Store } from '../src/store.js';

const [slug, countArg, devicesArg] = process.argv.slice(2);
const count = Number(countArg);
if (!slug || !Number.isInteger(count) || count < 1) {
  console.error('Usage: npm run codes -- <slug> <count> [devicesPerCode]');
  process.exit(1);
}
const { dataDir } = loadConfig({ ...process.env, AG_SECRET: 'unused' });
const store = new Store(dataDir);
const codes = store.createCodes(slug, count, { devices: Number(devicesArg) || 2 });
for (const code of codes) console.log(`${code}\t/t/${slug}?code=${code}`);
