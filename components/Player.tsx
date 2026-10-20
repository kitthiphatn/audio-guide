'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AudioLines, Captions, Check, ChevronDown, ChevronRight, Globe, Pause, Play, RotateCcw, RotateCw, Search, SkipBack, SkipForward, SunMoon, Timer, X } from 'lucide-react';
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
  const [showTranscript, setShowTranscript] = useState(false);
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
  const pct = duration ? (Math.min(time, duration) / duration) * 100 : 0;
  const low = remaining < 10 * 60_000;
  const cycleSpeed = () => {
    const nextSpeed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(nextSpeed);
    store.set('speed', String(nextSpeed));
  };

  return (
    <div
      className="theme-guide min-h-dvh bg-bg pb-64 text-ink"
      data-theme={theme ?? undefined}
      style={tour.theme?.accent ? ({ '--accent': tour.theme.accent } as React.CSSProperties) : undefined}
    >
      <Hero images={tour.heroImages}>
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] text-white sm:px-6">
          <span
            className={`inline-flex items-center gap-2 rounded-full bg-black/35 px-3.5 py-2 text-sm font-medium tabular-nums backdrop-blur-xl ${low ? 'text-[#ff6961]' : ''}`}
            aria-live="off"
          >
            <Timer className="size-4" strokeWidth={2} />
            <span className="text-white/70">{t('timeLeft')}</span>
            {fmtClock(remaining)}
          </span>
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setLangOpen((o) => !o)}
              aria-expanded={langOpen}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3.5 py-2 text-sm font-medium backdrop-blur-xl transition-colors hover:bg-black/50"
            >
              <Globe className="size-4" strokeWidth={2} />
              {tour.languages[lang]?.label || lang}
              <ChevronDown className={`size-3.5 transition-transform duration-300 ${langOpen ? 'rotate-180' : ''}`} strokeWidth={2.5} />
            </button>
            <button
              onClick={toggleTheme}
              aria-label={t('theme')}
              className="grid size-9 place-items-center rounded-full bg-black/35 backdrop-blur-xl transition-colors hover:bg-black/50"
            >
              <SunMoon className="size-4" strokeWidth={2} />
            </button>
            {langOpen && (
              <div className="glass animate-rise absolute top-full right-0 z-30 mt-2 w-72 rounded-2xl p-1.5 text-ink shadow-[var(--shadow-float)]">
                {Object.keys(tour.languages).length > 6 && (
                  <label className="mb-1.5 flex items-center gap-2 rounded-xl bg-ink/[0.06] px-3">
                    <Search className="size-4 text-muted" strokeWidth={2} />
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
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors hover:bg-ink/[0.06] ${code === lang ? 'font-semibold text-accent' : ''}`}
                      >
                        {info.label || code}
                        {code === lang ? <Check className="size-4" strokeWidth={2.5} /> : <span className="text-xs text-muted uppercase">{code}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="animate-rise absolute inset-x-0 bottom-0 z-10 mx-auto max-w-2xl px-5 pb-10 text-white sm:pb-14">
          <p className="text-sm font-medium text-white/70 tabular-nums">
            {t('stopsCount', { n: tour.stops.length })}
          </p>
          <h1 className="mt-2 text-[clamp(2.6rem,11vw,4.75rem)] leading-[1.02] font-bold tracking-[-0.045em] text-balance">{p(tour.title)}</h1>
          {p(tour.subtitle) && <p className="mt-3 max-w-[40ch] text-lg leading-snug text-white/75 sm:text-xl">{p(tour.subtitle)}</p>}
          <button
            onClick={toggle}
            className="mt-7 inline-flex items-center gap-2.5 rounded-full bg-white px-6 py-3.5 text-[17px] font-semibold text-black shadow-[0_10px_30px_-10px_rgb(0_0_0/0.6)] transition-transform duration-200 active:scale-[0.97]"
          >
            {playing ? <Pause className="size-5" fill="currentColor" strokeWidth={0} /> : <Play className="size-5" fill="currentColor" strokeWidth={0} />}
            {playing ? t('pause') : current >= 0 ? t('play') : t('startListening')}
          </button>
        </div>
      </Hero>

      <main className="mx-auto max-w-2xl px-4 sm:px-5">
        <section aria-labelledby="stops-heading" className="mt-10">
          <h2 id="stops-heading" className="px-1 text-[28px] font-bold tracking-[-0.035em]">
            {t('stops')}
          </h2>
          <ol className="card mt-4 overflow-hidden">
            {tour.stops.map((s, i) => {
              const active = i === current;
              const missing = !s.languages.includes(lang);
              return (
                <li key={s.id} className="group/row">
                  <button
                    onClick={() => playStop(i, true)}
                    aria-current={active ? 'true' : undefined}
                    className={`flex w-full items-center gap-4 pl-4 text-left transition-colors hover:bg-ink/[0.03] active:bg-ink/[0.06] ${missing ? 'opacity-45' : ''}`}
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors ${active ? 'bg-accent text-accent-ink' : 'bg-ink/[0.06] text-ink'}`}
                    >
                      {i + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-3 border-b border-line py-4 pr-4 group-last/row:border-0">
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[17px] leading-snug font-medium ${active ? 'text-accent' : ''}`}>{p(s.title) || `#${i + 1}`}</span>
                        {p(s.description) && <span className="mt-0.5 line-clamp-2 block text-[15px] text-muted">{p(s.description)}</span>}
                      </span>
                      {active && playing ? <Equalizer /> : <ChevronRight className="size-4 shrink-0 text-muted/60" strokeWidth={2.5} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        {hasMap && (
          <section aria-labelledby="map-heading" className="mt-12">
            <h2 id="map-heading" className="px-1 text-[28px] font-bold tracking-[-0.035em]">
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
              <a key={l.url} href={l.url} target="_blank" rel="noopener" className="btn-primary py-3.5 text-base">
                {p(l.label)}
              </a>
            ))}
          </section>
        )}
      </main>

      {showTranscript && transcript && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setShowTranscript(false)}>
          <div
            role="dialog"
            aria-label={t('transcript')}
            onClick={(e) => e.stopPropagation()}
            className="glass animate-rise absolute inset-x-0 bottom-0 mx-auto max-h-[75dvh] max-w-2xl overflow-y-auto rounded-t-[28px] px-6 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)]"
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ink/20" />
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-bold tracking-[-0.03em]">{stop ? p(stop.title) : ''}</h2>
              <button onClick={() => setShowTranscript(false)} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full bg-ink/[0.08]">
                <X className="size-4" strokeWidth={2.5} />
              </button>
            </div>
            <p className="mt-4 text-[18px] leading-[1.7] whitespace-pre-wrap text-ink/90">{transcript}</p>
          </div>
        </div>
      )}

      {/* Player dock: a floating glass bar within thumb reach while walking. */}
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[transform,opacity] duration-500 ease-spring ${current < 0 ? 'translate-y-[120%] opacity-0' : ''}`}
        aria-hidden={current < 0 ? true : undefined}
      >
        <div
          className="glass pointer-events-auto mx-auto max-w-xl rounded-[28px] px-5 pt-4 pb-3 shadow-[var(--shadow-float)] select-none [-webkit-touch-callout:none]"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-3">
            <Artwork src={tour.heroImages[0]} n={current + 1} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{stop ? p(stop.title) : t('choose')}</p>
              <p className="truncate text-[13px] text-muted tabular-nums">
                {stop ? t('stopOf', { n: current + 1, total: tour.stops.length }) : p(tour.title)}
              </p>
            </div>
            {transcript && (
              <button
                onClick={() => setShowTranscript(true)}
                aria-label={t('transcript')}
                title={t('transcript')}
                className="grid size-9 place-items-center rounded-full bg-ink/[0.06] transition-colors hover:bg-ink/[0.1]"
              >
                <Captions className="size-[18px]" strokeWidth={2} />
              </button>
            )}
            <button
              onClick={cycleSpeed}
              aria-label={`${t('speed')} ${speed}×`}
              className="h-9 min-w-12 rounded-full bg-ink/[0.06] px-2.5 text-[13px] font-semibold tabular-nums transition-colors hover:bg-ink/[0.1]"
            >
              {speed}×
            </button>
          </div>
          {message && (
            <p role="status" className="mt-2 text-[13px] font-medium text-danger">
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
            className="scrubber mt-3"
            style={{ '--pct': `${pct}%` } as React.CSSProperties}
          />
          <div className="-mt-0.5 flex justify-between text-[11px] font-medium text-muted tabular-nums">
            <span>{fmtTime(time)}</span>
            <span>-{fmtTime(Math.max(0, duration - time))}</span>
          </div>
          <div className="mt-1 flex items-center justify-center gap-3 sm:gap-6">
            <IconButton label={t('previous')} onClick={prev}>
              <SkipBack className="size-6" fill="currentColor" strokeWidth={0} />
            </IconButton>
            <IconButton label={t('back15')} onClick={() => seekBy(-15)}>
              <RotateCcw className="size-[22px]" strokeWidth={2} />
            </IconButton>
            <button
              onClick={toggle}
              aria-label={playing ? t('pause') : t('play')}
              className="grid size-14 place-items-center rounded-full bg-ink text-bg transition-transform duration-200 active:scale-90"
            >
              {playing ? <Pause className="size-6" fill="currentColor" strokeWidth={0} /> : <Play className="ml-0.5 size-6" fill="currentColor" strokeWidth={0} />}
            </button>
            <IconButton label={t('forward15')} onClick={() => seekBy(15)}>
              <RotateCw className="size-[22px]" strokeWidth={2} />
            </IconButton>
            <IconButton label={t('next')} onClick={next}>
              <SkipForward className="size-6" fill="currentColor" strokeWidth={0} />
            </IconButton>
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

function Hero({ images, children }: { images: string[]; children: React.ReactNode }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(() => setK((x) => (x + 1) % images.length), 7000);
    return () => clearInterval(id);
  }, [images.length]);
  return (
    <div className="relative h-[86svh] max-h-[860px] min-h-[540px] w-full overflow-hidden bg-black">
      {images.length ? (
        images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[2400ms] ease-out-expo ${i === k ? 'scale-100 opacity-100' : 'scale-110 opacity-0'}`}
          />
        ))
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(120%_70%_at_15%_0%,color-mix(in_oklab,var(--accent)_70%,black),transparent_65%),radial-gradient(90%_60%_at_100%_100%,color-mix(in_oklab,var(--accent)_35%,black),#000_70%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/0 via-35% to-black/85" />
      {children}
    </div>
  );
}

function Artwork({ src, n }: { src?: string; n: number }) {
  return (
    <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-accent text-sm font-bold text-accent-ink tabular-nums">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <AudioLines className="size-5" strokeWidth={2} />
      )}
      {src && n > 0 && <span className="relative rounded-md bg-black/45 px-1.5 text-white backdrop-blur-sm">{n}</span>}
    </span>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-11 place-items-center rounded-full text-ink transition-[background,transform] duration-200 hover:bg-ink/[0.06] active:scale-90"
    >
      {children}
    </button>
  );
}

function Equalizer() {
  return (
    <span aria-hidden className="flex h-4 shrink-0 items-end gap-[3px]">
      {[0, 1, 2, 3].map((b) => (
        <span key={b} className="animate-bar h-full w-[3px] rounded-full bg-accent" style={{ animationDelay: `${b * -230}ms` }} />
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
