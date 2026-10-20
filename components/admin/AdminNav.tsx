'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AudioLines, LayoutGrid, LogOut, Map, QrCode } from 'lucide-react';
import { api } from './api';

const LINKS = [
  { href: '/admin', label: 'ภาพรวม', short: 'ภาพรวม', icon: LayoutGrid, exact: true },
  { href: '/admin/tours', label: 'ทัวร์ / เทมเพลต', short: 'ทัวร์', icon: Map },
  { href: '/admin/passes', label: 'บัตรเข้าใช้ (QR)', short: 'QR', icon: QrCode },
];

// A sidebar on wide screens, a frosted top bar on phones.
export default function AdminNav() {
  const path = usePathname();
  const logout = () => api('POST', 'logout', {}).finally(() => window.location.reload());
  return (
    <nav className="glass no-print sticky top-0 z-20 border-b border-line lg:h-dvh lg:border-r lg:border-b-0">
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-2 lg:h-full lg:flex-col lg:items-stretch lg:gap-0.5 lg:px-4 lg:py-6">
        <span className="mr-1 flex items-center gap-2.5 px-2 text-[17px] font-bold tracking-[-0.03em] whitespace-nowrap lg:mr-0 lg:mb-8">
          <span className="grid size-8 place-items-center rounded-[10px] bg-ink text-bg">
            <AudioLines className="size-[18px]" strokeWidth={2.25} />
          </span>
          <span className="hidden sm:inline">Audio Guide</span>
        </span>
        {LINKS.map(({ href, label, short, icon: Icon, exact }) => {
          const active = exact ? path === href : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-[15px] whitespace-nowrap transition-colors sm:gap-3 sm:px-3 ${active ? 'bg-ink/[0.07] font-semibold text-ink' : 'text-muted hover:bg-ink/[0.04] hover:text-ink'}`}
            >
              <Icon className={`size-[18px] ${active ? 'text-accent' : ''}`} strokeWidth={2} />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
        <span className="flex-1" />
        <button
          onClick={logout}
          aria-label="ออกจากระบบ"
          className="inline-flex items-center gap-3 rounded-xl px-2.5 py-2 text-[15px] whitespace-nowrap text-muted sm:px-3 transition-colors hover:bg-ink/[0.04] hover:text-ink"
        >
          <LogOut className="size-[18px]" strokeWidth={2} />
          <span className="hidden sm:inline">ออกจากระบบ</span>
        </button>
      </div>
    </nav>
  );
}
