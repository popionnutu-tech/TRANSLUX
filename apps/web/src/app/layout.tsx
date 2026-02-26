import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TRANSLUX — Admin Dashboard',
  description: 'Sistem de monitorizare transport',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
