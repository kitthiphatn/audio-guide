import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getApp } from '@/lib/app';
import { resolveInside } from '@/lib/tours';

// Only images may be served from a tour folder; audio stays behind signed /media links.
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export async function GET(_req: Request, ctx: RouteContext<'/t/[slug]/[...asset]'>) {
  const { slug, asset } = await ctx.params;
  const tour = getApp().tours.get(slug);
  if (!tour) return new Response('Not found', { status: 404 });
  let file: string;
  try {
    file = resolveInside(tour.dir, asset.join('/'));
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
  if (!type || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('Not found', { status: 404 });
  const headers: Record<string, string> = { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' };
  if (type === 'image/svg+xml') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers });
}
