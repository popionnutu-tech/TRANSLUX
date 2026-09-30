import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Open_Sans } from 'next/font/google';
import './globals.css';
import { SITE_URL } from '@/lib/seo';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

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
    <html lang="ro" className={`${openSans.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
