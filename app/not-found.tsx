import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="theme-guide grid min-h-dvh place-items-center bg-bg px-6 text-ink">
      <div className="max-w-md">
        <h1 className="font-display text-5xl font-semibold">ไม่พบหน้านี้</h1>
        <p className="mt-4 text-muted">Page not found.</p>
        <Link href="/" className="mt-6 inline-block text-accent underline">
          กลับหน้าแรก
        </Link>
      </div>
    </main>
  );
}
