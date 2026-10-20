import Link from 'next/link';
import { getApp } from '@/lib/app';
import { pick } from '@/lib/text';

export const dynamic = 'force-dynamic';

export default function Home() {
  const tours = getApp().tours.list().filter((t) => t.listed);
  return (
    <main className="theme-guide min-h-dvh bg-bg px-6 py-20 text-ink sm:px-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-[clamp(2.6rem,7vw,4.5rem)] leading-none font-semibold tracking-[-0.03em]">Audio Guides</h1>
        {tours.length ? (
          <ul className="mt-12 border-t border-line">
            {tours.map((t) => (
              <li key={t.slug} className="border-b border-line">
                <Link href={`/t/${t.slug}`} className="flex items-baseline justify-between gap-6 py-5 hover:text-accent">
                  <span className="font-display text-2xl">{pick(t.title, t.defaultLanguage)}</span>
                  <span className="text-sm text-muted tabular-nums">{t.stops.length} จุด</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-8 text-muted">ยังไม่มีทัวร์ที่เปิดแสดง</p>
        )}
      </div>
    </main>
  );
}
