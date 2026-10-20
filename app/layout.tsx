import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Audio Guide', template: '%s · Audio Guide' },
  description: 'Self-guided audio tours',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Behaves like an app on phones: no pinch or double-tap zoom.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-dvh touch-manipulation antialiased">{children}</body>
    </html>
  );
}
