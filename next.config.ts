import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

// Map tiles come from OpenStreetMap; everything else is served by this app.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? ' ws:' : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Tour folders are read at runtime; keep them out of the build trace.
  outputFileTracingExcludes: { '*': ['tours/**', 'data/**'] },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // OSM tile servers refuse requests that carry no referrer.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
