import type { Metadata, Viewport } from 'next';
import { Open_Sans } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { SITE_URL } from '@/lib/seo';

// Un singur font (ION-204, 03.10): JetBrains Mono (40 KB preîncărcat) era folosit doar pe
// plăcuța mașinii din asistent — acum ui-monospace. Open Sans rămâne fontul VARIABIL (un
// fișier pe subset acoperă 300–800; în CSS se folosesc 400/500/600/700/800 — greutăți fixe
// ar fi însemnat 3–5 fișiere pe subset, mai mult, nu mai puțin). Aici latin + latin-ext
// (româna: ă, ș, ț); subsetul chirilic îl preîncarcă doar paginile /ru (lib/font-cyrillic.ts),
// deci pagina română preîncarcă 2 fișiere, cea rusă 3.
const openSans = Open_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-opensans',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'TRANSLUX — autobuze Chișinău – nordul Moldovei', template: '%s | TRANSLUX' },
  description: 'Autobuze TRANSLUX între Chișinău, Bălți, Edineț, Briceni, Lipcani, Criva, Ocnița și Otaci: orar, prețuri, șoferul și telefonul cursei.',
  applicationName: 'TRANSLUX',
  openGraph: {
    siteName: 'TRANSLUX',
    type: 'website',
    locale: 'ro_MD',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'TRANSLUX' }],
  },
  twitter: { card: 'summary_large_image' },
  other: {
    'format-detection': 'telephone=no',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={openSans.variable}>
      <body>
        {children}
        {/* ION-202 (03.10.2026): Web Vitals reale de la vizitatori (LCP/INP/CLS), fără cookie-uri și fără identificatori. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
