import type { Metadata } from 'next';
import { Oswald, Courier_Prime } from 'next/font/google';
import './globals.css';

const oswald = Oswald({
  subsets: ['latin'],
  variable: '--font-oswald',
  display: 'swap',
});

const courierPrime = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-courier',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TRANSLUX',
  description: 'Sistem de monitorizare transport',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={`${oswald.variable} ${courierPrime.variable}`}>
      <body>{children}</body>
    </html>
  );
}
