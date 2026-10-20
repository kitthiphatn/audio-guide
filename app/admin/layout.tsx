import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getApp, isAdminToken, ADMIN_COOKIE } from '@/lib/app';
import AdminNav from '@/components/admin/AdminNav';
import LoginForm from '@/components/admin/LoginForm';

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const app = getApp();
  const signedIn = isAdminToken(app, (await cookies()).get(ADMIN_COOKIE)?.value);
  return (
    <div className="theme-admin min-h-dvh bg-bg text-[15px] text-ink">
      {signedIn ? (
        <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
          <AdminNav />
          <main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-28 sm:px-8 lg:pt-14">{children}</main>
        </div>
      ) : (
        <LoginForm configured={Boolean(app.config.adminPassword)} />
      )}
    </div>
  );
}
