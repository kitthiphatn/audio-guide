// Usage: npm run new-tour -- <slug> [language codes...]
// Example: npm run new-tour -- wat-pho th en zh
// The admin workspace at /admin does the same from the browser.
import { loadConfig } from '../src/config.js';
import { createTour } from '../src/workspace.js';

const [slug, ...langs] = process.argv.slice(2);
const { toursDir } = loadConfig({ ...process.env, AG_SECRET: 'unused' });
try {
  createTour(toursDir, slug, langs);
  console.log(`Created tours/${slug}. Put audio in tours/${slug}/audio/<lang>/ and edit tour.json, or use /admin.`);
} catch (err) {
  console.error(err.message);
  console.error('Usage: npm run new-tour -- <slug> [languages...]');
  process.exit(1);
}
