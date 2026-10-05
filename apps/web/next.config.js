/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@translux/db'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https://*.supabase.co https://central-hub-md.vercel.app; frame-ancestors 'none'",
          },
        ],
      },
      {
        // Pagina biletului (ION-197): codul din cale e secretul — fără cache, fără referrer, fără index.
        source: '/:locale(ro|ru)/bilet/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        // Mini app-ul clientului din Telegram (ION-249). Vine DUPĂ regula generală: la aceeași cheie câștigă ultima.
        // CSP-ul de aici = cel general, cu O SINGURĂ relaxare: încadrarea în Telegram Web (web.telegram.org deschide
        // mini app-urile într-un iframe; aplicațiile mobile și desktop folosesc un webview și nu au nevoie). Fără
        // scripturi străine: telegram-web-app.js nu se încarcă (ecranul complet = EcranCompletTelegram, ION-248).
        // frame-ancestors are întâietate față de X-Frame-Options în browserele de azi.
        source: '/:locale(ro|ru)/telegram',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https://*.supabase.co https://central-hub-md.vercel.app; frame-ancestors 'self' https://web.telegram.org",
          },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/:path*.png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
