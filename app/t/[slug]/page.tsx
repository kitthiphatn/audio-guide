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
    <main className="theme-guide grid min-h-dvh bg-bg text-ink md:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink md:block">
        {hero && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/t/${slug}/${hero}`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
        )}
      </div>
      <section className="flex flex-col justify-center px-6 py-16 sm:px-12">
        <h1 className="font-display text-[clamp(2.4rem,6vw,4rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">
          {pick(tour.title, lang)}
        </h1>
        {pick(tour.subtitle, lang) && <p className="mt-4 max-w-[48ch] text-lg text-muted">{pick(tour.subtitle, lang)}</p>}
        <form method="get" action={`/t/${slug}/enter`} className="mt-12 max-w-sm">
          <label htmlFor="code" className="label">
            {ui(lang, 'enterCode')}
          </label>
          <div className="flex gap-2">
            <input
              id="code"
              name="code"
              required
              maxLength={16}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="field font-mono text-lg tracking-[0.18em] uppercase"
            />
            <button type="submit" className="btn-primary shrink-0 px-5">
              {ui(lang, 'start')}
            </button>
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              {error}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted">{ui(lang, 'codeHelp')}</p>
          )}
        </form>
      </section>
    </main>
  );
}
