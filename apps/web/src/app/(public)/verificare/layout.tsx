import type { Metadata } from 'next';

// Zona de verificare (login, fișe) nu are ce căuta în Google (ION-153).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function VerificareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
