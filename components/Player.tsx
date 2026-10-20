'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Pause, Play, SkipBack, SkipForward, RotateCcw, RotateCw, Languages, Clock, ChevronDown, SunMoon, Search } from 'lucide-react';
import type { PublicTour } from '@/lib/tours';
import { pick } from '@/lib/text';
import { ui, type UiKey } from '@/lib/ui-text';

const TourMap = dynamic(() => import('./TourMap'), { ssr: false });

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export default function Player({ tour, expiresAt: initialExpiry }: { tour: PublicTour; expiresAt: number }) {
  const audio = useRef<HTMLAudioElement>(null);
  const store = useMemo(() => safeStorage(`ag:${tour.slug}`), [tour.slug]);

  const [lang, setLang] = useState(tour.defaultLanguage);
  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [message, setMessage] = useState('');
  const [expiresAt, setExpiresAt] = useState(initialExpiry);
  const [now, setNow] = useState(() => Date.now());
  const [langOpen, setLangOpen] = useState(false);
  const [langQuery, setLangQuery] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  const offset = useRef(0);
  const retried = useRef(false);

  const t = useCallback((key: UiKey, vars?: Record<string, string | number>) => ui(lang, key, vars), [lang]);
  const p = useCallback((text: Parameters<typeof pick>[0]) => pick(text, lang, tour.defaultLanguage), [lang, tour.defaultLanguage]);
  const stop = current >= 0 ? tour.stops[current] : null;

  // Restore remembered choices after hydration.
  useEffect(() => {
    const saved = store.get('lang');
    if (saved && tour.languages[saved]) setLang(saved);
    const s = Number(store.get('speed'));
    if (SPEEDS.includes(s)) setSpeed(s);
    const th = store.get('theme');
    if (th === 'light' || th === 'dark') setTheme(th);
  }, [store, tour.languages]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed, current]);

  // --- session clock -------------------------------------------------------

  const expire = useCallback(
    (to?: string) => {
      audio.current?.pause();
      window.location.replace(to || tour.expiredRedirect || '/expired');
    },
    [tour.expiredRedirect],
  );

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now() + offset.current), 1000);
    const beat = async () => {
      try {
        const res = await fetch(`/api/tours/${tour.slug}/session`, { cache: 'no-store' });
        if (res.status === 401) return expire((await res.json()).redirect);
        if (res.ok) {
          const info = await res.json();
          offset.current = info.now - Date.now();
          setExpiresAt(info.expiresAt); // staff may have extended the pass
        }
      } catch {
        // Offline for a moment; the local countdown keeps running.
      }
    };
    beat();
    const hb = setInterval(beat, 20_000);
    return () => {
      clearInterval(tick);
      clearInterval(hb);
    };
  }, [tour.slug, expire]);

  const remaining = expiresAt - now;
  useEffect(() => {
    if (remaining <= 0) expire();
  }, [remaining, expire]);

  // --- playback --------------------------------------------------------------

  const playStop = useCallback(
    async (i: number, autoplay: boolean, resumeAt: number | null = null, langOverride?: string) => {
      const L = langOverride ?? lang;
      const s = tour.stops[i];
      const el = audio.current;
      if (!s || !el) return;
      if (resumeAt === null) retried.current = false;
      setCurrent(i);
      setMessage('');
      store.set('last', String(i));
      if (!s.languages.includes(L)) {
        el.pause();
        el.removeAttribute('src');
        setTime(0);
        setDuration(0);
        return setMessage(ui(L, 'noAudio'));
      }
      try {
        const res = await fetch(`/api/tours/${tour.slug}/play`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ stop: i, lang: L }),
        });
        if (res.status === 401) return expire((await res.json()).redirect);
        if (res.status === 429) throw new Error(ui(L, 'tooFast'));
        if (res.status === 404) throw new Error(ui(L, 'noAudio'));
        if (!res.ok) throw new Error(ui(L, 'playError'));
        const { url } = await res.json();
        el.src = url;
        el.playbackRate = speed;
        const start = resumeAt ?? Number(store.get(`pos:${L}:${i}`) || 0);
        el.addEventListener(
          'loadedmetadata',
          () => {
            if (start > 0 && start < el.duration - 5) el.currentTime = start;
          },
          { once: true },
        );
        if (autoplay) await el.play().catch(() => {});
        if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({ title: pick(s.title, L), album: pick(tour.title, L) });
        }
      } catch (err) {
        setMessage((err as Error).message || ui(L, 'playError'));
      }
    },
    [tour, lang, speed, store, expire],
  );

  // A signed link is short-lived; when it lapses mid-track, fetch a new one once and carry on.
  const onError = () => {
    const el = audio.current;
    if (!el || current < 0 || !el.getAttribute('src')) return;
    if (retried.current) return setMessage(t('playError'));
    retried.current = true;
    playStop(current, !el.paused || el.currentTime > 0, el.currentTime);
  };

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (current < 0 || !el.getAttribute('src')) return playStop(current < 0 ? Number(store.get('last') || 0) : current, true);
    if (el.paused) el.play().catch(() => setMessage(t('playError')));
    else el.pause();
  };
  const seekBy = (d: number) => {
    const el = audio.current;
    if (el) el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + d));
  };
  const prev = () => {
    const el = audio.current;
    if (el && el.currentTime > 3) el.currentTime = 0;
    else playStop(Math.max(0, current - 1), true);
  };
  const next = () => playStop(Math.min(tour.stops.length - 1, current + 1), true);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('previoustrack', prev);
    ms.setActionHandler('nexttrack', next);
    ms.setActionHandler('seekbackward', () => seekBy(-15));
    ms.setActionHandler('seekforward', () => seekBy(15));
  });

  const chooseLang = (code: string) => {
    const wasPlaying = playing;
    audio.current?.pause();
    setLang(code);
    store.set('lang', code);
    setLangOpen(false);
    setLangQuery('');
    if (current >= 0) playStop(current, wasPlaying, null, code);
  };

  const toggleTheme = () => {
    const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const nextTheme = dark ? 'light' : 'dark';
    setTheme(nextTheme);
    store.set('theme', nextTheme);
  };

  const languages = Object.entries(tour.languages).filter(([code, info]) => {
    const q = langQuery.trim().toLowerCase();
    return !q || code.includes(q) || (info.label || '').toLowerCase().includes(q);
  });
  const hasMap = tour.stops.some((s) => s.lat != null);
  const transcript = stop ? p(stop.transcript) : '';

  return (
    <div
      className="theme-guide min-h-dvh bg-bg pb-56 text-ink"
      data-theme={theme ?? undefined}
      style={tour.theme?.accent ? ({ '--accent': tour.theme.accent } as React.CSSProperties) : undefined}
    >
      <Hero images={tour.heroImages} />

      <header className="mx-auto max-w-2xl px-5 pt-8">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-display text-[clamp(2.2rem,8vw,3.6rem)] leading-[1.04] font-semibold tracking-[-0.025em] text-balance">
            {p(tour.title)}
          </h1>
          <button onClick={toggleTheme} aria-label={t('theme')} className="mt-2 rounded-full p-2 text-muted hover:text-ink">
            <SunMoon className="size-5" strokeWidth={1.75} />
          </button>
        </div>
        {p(tour.subtitle) && <p className="mt-3 max-w-[52ch] text-[17px] leading-relaxed text-muted">{p(tour.subtitle)}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-line py-3 text-sm">
          <span className="inline-flex items-center gap-2 tabular-nums" aria-live="off">
            <Clock className="size-4 text-mark" strokeWidth={1.75} />
            <span className="text-muted">{t('timeLeft')}</span>
            <strong className={remaining < 10 * 60_000 ? 'text-danger' : ''}>{fmtClock(remaining)}</strong>
          </span>
          <div className="relative">
            <button
              onClick={() => setLangOpen((o) => !o)}
              aria-expanded={langOpen}
              className="inline-flex items-center gap-2 font-medium hover:text-accent"
            >
              <Languages className="size-4 text-mark" strokeWidth={1.75} />
              {tour.languages[lang]?.label || lang}
              <ChevronDown className={`size-4 transition-transform ${langOpen ? 'rotate-180' : ''}`} strokeWidth={1.75} />
            </button>
            {langOpen && (
              <div className="absolute top-full left-0 z-30 mt-2 w-72 rounded-lg border border-line bg-surface p-2 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)]">
                {Object.keys(tour.languages).length > 6 && (
                  <label className="mb-2 flex items-center gap-2 rounded-md border border-line px-2">
                    <Search className="size-4 text-muted" strokeWidth={1.75} />
                    <input
                      autoFocus
                      value={langQuery}
                      onChange={(e) => setLangQuery(e.target.value)}
                      placeholder={t('searchLanguage')}
                      className="w-full bg-transparent py-2 text-sm outline-none"
                    />
                  </label>
                )}
                <ul className="max-h-72 overflow-y-auto">
                  {languages.map(([code, info]) => (
                    <li key={code}>
                      <button
                        onClick={() => chooseLang(code)}
                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[15px] hover:bg-bg ${code === lang ? 'font-semibold text-accent' : ''}`}
                      >
                        {info.label || code}
                        <span className="text-xs text-muted uppercase">{code}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5">
        <section aria-labelledby="stops-heading" className="mt-10">
          <h2 id="stops-heading" className="font-display text-2xl font-semibold">
            {t('stops')}
          </h2>
          <ol className="mt-4">
            {tour.stops.map((s, i) => {
              const active = i === current;
              const missing = !s.languages.includes(lang);
              return (
                <li key={s.id} className="border-b border-line last:border-b-0">
                  <button
                    onClick={() => playStop(i, true)}
                    aria-current={active ? 'true' : undefined}
                    className={`group flex w-full items-baseline gap-4 py-4 text-left transition-colors ${missing ? 'opacity-55' : ''}`}
                  >
                    <span className={`w-7 shrink-0 font-display text-xl tabular-nums ${active ? 'text-accent' : 'text-mark'}`}>{i + 1}</span>
                    <span className="flex-1">
                      <span className={`block text-[17px] leading-snug font-medium group-hover:text-accent ${active ? 'text-accent' : ''}`}>
                        {p(s.title) || `#${i + 1}`}
                      </span>
                      {p(s.description) && <span className="mt-1 block text-sm text-muted">{p(s.description)}</span>}
                    </span>
                    {active && playing && <Equalizer />}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        {hasMap && (
          <section aria-labelledby="map-heading" className="mt-12">
            <h2 id="map-heading" className="font-display text-2xl font-semibold">
              {t('map')}
            </h2>
            <TourMap
              stops={tour.stops.map((s, i) => ({ i, lat: s.lat, lng: s.lng, title: p(s.title) }))}
              current={current}
              onSelect={(i) => playStop(i, true)}
              locateLabel={t('locateMe')}
            />
          </section>
        )}

        {tour.links.length > 0 && (
          <section className="mt-12 flex flex-col gap-3">
            {tour.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener" className="btn-primary py-3 text-base">
                {p(l.label)}
              </a>
            ))}
          </section>
        )}
      </main>

      {/* Player dock: always within thumb reach while walking. */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur-sm select-none [-webkit-touch-callout:none]"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="mx-auto max-w-2xl px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate font-display text-lg font-semibold">{stop ? p(stop.title) : t('choose')}</p>
            {stop && <p className="shrink-0 text-xs text-muted tabular-nums">{t('stopOf', { n: current + 1, total: tour.stops.length })}</p>}
          </div>
          {message && (
            <p role="status" className="mt-1 text-sm font-medium text-danger">
              {message}
            </p>
          )}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(time, duration || 0)}
            onChange={(e) => audio.current && (audio.current.currentTime = Number(e.target.value))}
            aria-label="Progress"
            className="mt-2 h-1.5 w-full cursor-pointer accent-[var(--accent)]"
          />
          <div className="flex justify-between text-xs text-muted tabular-nums">
            <span>{fmtTime(time)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <IconButton label={t('previous')} onClick={prev}>
              <SkipBack className="size-5" strokeWidth={1.75} />
            </IconButton>
            <IconButton label={t('back15')} onClick={() => seekBy(-15)}>
              <RotateCcw className="size-5" strokeWidth={1.75} />
            </IconButton>
            <button
              onClick={toggle}
              aria-label={playing ? t('pause') : t('play')}
              className="grid size-16 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_8px_20px_-8px_var(--accent)] transition-transform active:scale-95"
            >
              {playing ? <Pause className="size-7" fill="currentColor" strokeWidth={0} /> : <Play className="ml-1 size-7" fill="currentColor" strokeWidth={0} />}
            </button>
            <IconButton label={t('forward15')} onClick={() => seekBy(15)}>
              <RotateCw className="size-5" strokeWidth={1.75} />
            </IconButton>
            <IconButton label={t('next')} onClick={next}>
              <SkipForward className="size-5" strokeWidth={1.75} />
            </IconButton>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div role="group" aria-label={t('speed')} className="flex rounded-md border border-line p-0.5 text-xs tabular-nums">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSpeed(s);
                    store.set('speed', String(s));
                  }}
                  aria-pressed={s === speed}
                  className={`rounded px-2 py-1 ${s === speed ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
                >
                  {s}×
                </button>
              ))}
            </div>
            {transcript && (
              <details className="group text-sm">
                <summary className="cursor-pointer list-none font-medium text-accent">{t('transcript')}</summary>
                <div className="fixed inset-x-0 bottom-full max-h-[50dvh] overflow-y-auto border-t border-line bg-surface px-5 py-5">
                  <p className="mx-auto max-w-[65ch] text-[17px] leading-[1.75] whitespace-pre-wrap">{transcript}</p>
                </div>
              </details>
            )}
          </div>
        </div>
        <audio
          ref={audio}
          preload="none"
          controlsList="nodownload noplaybackrate"

          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onPlaying={() => (retried.current = false)}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            setTime(el.currentTime);
            if (current >= 0 && Math.floor(el.currentTime) % 5 === 0) store.set(`pos:${lang}:${current}`, String(Math.floor(el.currentTime)));
          }}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => {
            store.set(`pos:${lang}:${current}`, '0');
            if (current < tour.stops.length - 1) playStop(current + 1, true);
          }}
          onError={onError}
        />
      </div>
    </div>
  );
}

function Hero({ images }: { images: string[] }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(() => setK((x) => (x + 1) % images.length), 6000);
    return () => clearInterval(id);
  }, [images.length]);
  if (!images.length) return <div className="h-3 bg-accent" />;
  return (
    <div className="relative aspect-[4/3] max-h-[52dvh] w-full overflow-hidden bg-ink sm:aspect-[16/7]">
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out-expo ${i === k ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid size-11 place-items-center rounded-full text-ink hover:bg-bg active:scale-95">
      {children}
    </button>
  );
}

function Equalizer() {
  return (
    <span aria-hidden className="flex h-4 items-end gap-0.5">
      {[0, 1, 2].map((b) => (
        <span key={b} className="w-0.5 animate-pulse rounded-full bg-accent" style={{ height: `${50 + b * 20}%`, animationDelay: `${b * 160}ms` }} />
      ))}
    </span>
  );
}

function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function fmtClock(ms: number) {
  if (ms <= 0) return '0:00';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function safeStorage(prefix: string) {
  return {
    get(k: string) {
      try {
        return localStorage.getItem(`${prefix}:${k}`);
      } catch {
        return null;
      }
    },
    set(k: string, v: string) {
      try {
        localStorage.setItem(`${prefix}:${k}`, v);
      } catch {
        /* private mode */
      }
    },
  };
}
