import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getApp, readVisitor, visitorCookie } from '@/lib/app';
import { publicTour } from '@/lib/tours';
import { pick } from '@/lib/text';
import { ui, CODE_ERRORS } from '@/lib/ui-text';
import Player from '@/components/Player';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/t/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const tour = getApp().tours.get(slug);
  return { title: tour ? pick(tour.title, tour.defaultLanguage) : 'Not found', robots: { index: false } };
}

export default async function TourPage({ params, searchParams }: PageProps<'/t/[slug]'>) {
  const { slug } = await params;
  const query = await searchParams;
  const app = getApp();
  const tour = app.tours.get(slug);
  if (!tour) notFound();

  // QR codes link here with ?code=…; redeeming sets a cookie, so it happens in a route handler.
  const code = typeof query.code === 'string' ? query.code : '';
  if (code) redirect(`/t/${slug}/enter?code=${encodeURIComponent(code)}`);

  const { session } = readVisitor(app, slug, (await cookies()).get(visitorCookie(slug))?.value);
  if (app.store.isActive(session)) {
    return <Player tour={publicTour(tour)} expiresAt={session.expiresAt} />;
  }
  // A visitor whose time ran out who just tried a code should see why it failed, not be sent away.
  const error = typeof query.error === 'string' ? CODE_ERRORS[query.error] : '';
  if (session && !error) redirect(tour.access.expiredRedirect);
  if (tour.access.mode === 'open') redirect(`/t/${slug}/enter`);

  const lang = tour.defaultLanguage;
  const hero = tour.heroImages[0];
  return (
    <main className="theme-guide relative grid min-h-dvh place-items-center overflow-hidden bg-black px-5 py-16 text-white">
      {hero ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/t/${slug}/${hero}`} alt="" className="absolute inset-0 h-full w-full scale-105 object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(120%_70%_at_15%_0%,color-mix(in_oklab,var(--accent)_70%,black),transparent_65%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-black/90" />
      <section className="animate-rise relative w-full max-w-md text-center">
        <h1 className="text-[clamp(2.4rem,9vw,3.75rem)] leading-[1.03] font-bold tracking-[-0.045em] text-balance">{pick(tour.title, lang)}</h1>
        {pick(tour.subtitle, lang) && <p className="mx-auto mt-3 max-w-[36ch] text-lg leading-snug text-white/75">{pick(tour.subtitle, lang)}</p>}
        <form
          method="get"
          action={`/t/${slug}/enter`}
          className="mt-10 rounded-[28px] bg-white/12 p-6 text-left shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7)] ring-1 ring-white/15 backdrop-blur-2xl backdrop-saturate-150"
        >
          <label htmlFor="code" className="block text-center text-[15px] font-medium text-white/80">
            {ui(lang, 'enterCode')}
          </label>
          <input
            id="code"
            name="code"
            required
            maxLength={16}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXXXXXX"
            className="mt-4 w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-4 text-center font-mono text-2xl font-semibold tracking-[0.3em] text-white uppercase placeholder:text-white/25 focus:border-white/60 focus:outline-none"
          />
          <button
            type="submit"
            className="mt-3 w-full rounded-2xl bg-white py-4 text-[17px] font-semibold text-black transition-transform duration-200 active:scale-[0.98]"
          >
            {ui(lang, 'start')}
          </button>
          {error ? (
            <p role="alert" className="mt-4 text-center text-sm font-medium text-[#ff6961]">
              {error}
            </p>
          ) : (
            <p className="mt-4 text-center text-sm text-white/60">{ui(lang, 'codeHelp')}</p>
          )}
        </form>
      </section>
    </main>
  );
}
