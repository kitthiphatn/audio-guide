import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="theme-guide grid min-h-dvh place-items-center bg-bg px-6 text-center text-ink">
      <div className="animate-rise max-w-md">
        <h1 className="text-5xl font-bold tracking-[-0.045em]">ไม่พบหน้านี้</h1>
        <p className="mt-3 text-lg text-muted">Page not found.</p>
        <Link href="/" className="btn-primary mt-8 px-6 py-3 text-[15px]">
          กลับหน้าแรก
        </Link>
      </div>
    </main>
  );
}
