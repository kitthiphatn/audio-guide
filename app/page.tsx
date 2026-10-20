import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getApp } from '@/lib/app';
import { pick } from '@/lib/text';

export const dynamic = 'force-dynamic';

export default function Home() {
  const tours = getApp().tours.list().filter((t) => t.listed);
  return (
    <main className="theme-guide min-h-dvh bg-bg px-4 py-20 text-ink sm:px-8 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <h1 className="animate-rise text-[clamp(3rem,9vw,6rem)] leading-[0.95] font-bold tracking-[-0.055em]">Audio Guides</h1>
        <p className="mt-4 max-w-[44ch] text-xl text-muted">ทัวร์เสียงนำเที่ยว ฟังได้ทุกภาษา บนมือถือของคุณ</p>
        {tours.length ? (
          <ul className="mt-14 grid gap-4 sm:grid-cols-2">
            {tours.map((t, i) => {
              const hero = t.heroImages[0];
              return (
                <li key={t.slug} className="animate-rise" style={{ animationDelay: `${80 + i * 60}ms` }}>
                  <Link
                    href={`/t/${t.slug}`}
                    className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-[28px] bg-black p-6 text-white sm:aspect-[4/4.4]"
                  >
                    {hero ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/t/${t.slug}/${hero.replace(/^\/+/, '')}`}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out-expo group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_10%_0%,color-mix(in_oklab,var(--accent)_70%,black),#000_70%)]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/10 to-black/80" />
                    <span className="relative text-sm font-medium text-white/70 tabular-nums">{t.stops.length} จุด</span>
                    <span className="relative mt-1 text-[28px] leading-tight font-bold tracking-[-0.035em] text-balance">{pick(t.title, t.defaultLanguage)}</span>
                    <span className="absolute top-5 right-5 grid size-10 place-items-center rounded-full bg-white/15 backdrop-blur-xl transition-transform duration-300 group-hover:rotate-45">
                      <ArrowUpRight className="size-5" strokeWidth={2} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-10 text-muted">ยังไม่มีทัวร์ที่เปิดแสดง</p>
        )}
      </div>
    </main>
  );
}
