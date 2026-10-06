/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@translux/db', '@translux/routing'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Mini app-ul șoferului (ION-271): route.ts citește la rulare manifestul bundle-ului și stil.css — trebuie incluse în funcție.
  outputFileTracingIncludes: {
    '/mini-app/bilete': ['./public/mini-app/bilete/dist/**', './public/mini-app/bilete/stil.css'],
  },
  async headers() {
    return [
      {
        // Bundle-ul și logo-ul mini app-ului șoferului au hash de conținut în nume (ION-271): cache nemuritor; HTML-ul e no-store.
        source: '/mini-app/bilete/dist/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
          // Запрет индексации поисковиками — админка не должна попадать в Google
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https://*.supabase.co https://api.anthropic.com; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
