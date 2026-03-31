import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono, Raleway, Playfair_Display, Open_Sans, Montserrat } from 'next/font/google';
import './globals.css';
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const montserrat = Montserrat({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-montserrat',
  display: 'swap',
});

const raleway = Raleway({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-raleway',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-playfair',
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
    <html lang="ro" className={cn(inter.variable, spaceGrotesk.variable, jetbrainsMono.variable, raleway.variable, playfair.variable, openSans.variable, montserrat.variable)}>
      <body>{children}</body>
    </html>
  );
}
