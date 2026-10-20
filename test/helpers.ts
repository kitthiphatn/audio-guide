import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setApp, type AppContext } from '@/lib/app';
import { TourRegistry } from '@/lib/tours';
import { Store } from '@/lib/store';

export const BASE = 'http://localhost';

export function writeTour(toursDir: string, slug: string, access: object) {
  const dir = path.join(toursDir, slug);
  fs.mkdirSync(path.join(dir, 'audio', 'th'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'audio', 'th', '01.mp3'), Buffer.alloc(1000, 7));
  fs.writeFileSync(path.join(dir, 'audio', 'th', '02.mp3'), Buffer.alloc(500, 9));
  fs.writeFileSync(path.join(dir, 'images', 'hero.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(
    path.join(dir, 'tour.json'),
    JSON.stringify({
      title: { th: slug },
      languages: { th: { label: 'ไทย' } },
      heroImages: ['images/hero.png'],
      access,
      stops: [
        { title: { th: 'A' }, lat: 13.75, lng: 100.49, audio: { th: 'audio/th/01.mp3' } },
        { title: { th: 'B' }, audio: { th: 'audio/th/02.mp3' } },
      ],
    }),
  );
}

/** A fresh app in a temporary folder, with one open and one code tour. */
export function freshApp(): AppContext & { tmp: string } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-'));
  const toursDir = path.join(tmp, 'tours');
  writeTour(toursDir, 'open-tour', { mode: 'open', sessionMinutes: 60, expiredRedirect: '/bye', maxTracksPerMinute: 2 });
  writeTour(toursDir, 'code-tour', { mode: 'code', sessionMinutes: 60 });
  const config = {
    toursDir,
    dataDir: path.join(tmp, 'data'),
    secret: 'test-secret',
    adminPassword: 'pw',
    maxUploadBytes: 1024 * 1024,
    mediaLinkSeconds: 60,
    trustProxy: false,
  };
  const app = { config, tours: new TourRegistry(toursDir), store: new Store(config.dataDir), tmp };
  setApp(app);
  return app;
}

export const ctx = <P>(params: P) => ({ params: Promise.resolve(params) });
export const cookieOf = (res: Response) => res.headers.get('set-cookie')?.split(';')[0] ?? '';

export function cleanup(app: ReturnType<typeof freshApp>) {
  app.store.saveNow();
  setApp(undefined);
  fs.rmSync(app.tmp, { recursive: true, force: true, maxRetries: 5 });
}
