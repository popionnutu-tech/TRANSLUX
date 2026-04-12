import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Open_Sans } from 'next/font/google';
import './globals.css';

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
  title: 'TRANSLUX',
  description: 'Sistem de monitorizare transport',
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
