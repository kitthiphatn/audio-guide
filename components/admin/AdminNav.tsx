'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Map, QrCode, LogOut } from 'lucide-react';
import { api } from './api';

const LINKS = [
  { href: '/admin', label: 'ภาพรวม', icon: LayoutGrid, exact: true },
  { href: '/admin/tours', label: 'ทัวร์ / เทมเพลต', icon: Map },
  { href: '/admin/passes', label: 'บัตรเข้าใช้ (QR)', icon: QrCode },
];

export default function AdminNav() {
  const path = usePathname();
  return (
    <nav className="no-print sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6">
        <span className="mr-4 font-display text-lg font-semibold whitespace-nowrap">Audio Guide</span>
        {LINKS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? path === href : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 whitespace-nowrap transition-colors ${active ? 'bg-bg font-semibold text-ink' : 'text-muted hover:text-ink'}`}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
        <span className="flex-1" />
        <button
          onClick={() => api('POST', 'logout', {}).finally(() => window.location.reload())}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-muted hover:text-ink"
        >
          <LogOut className="size-4" strokeWidth={1.75} />
          <span className="hidden sm:inline">ออกจากระบบ</span>
        </button>
      </div>
    </nav>
  );
}
