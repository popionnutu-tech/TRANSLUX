import { robotoCyrillic } from '@/lib/font-cyrillic';

/** Paginile de direcție /ru/avtobus/…: preîncarcă subsetul chirilic al Roboto (ION-204), ca `app/ru/layout.tsx`. */
export default function RuRouteLayout({ children }: { children: React.ReactNode }) {
  return <div className={robotoCyrillic.variable} style={{ display: 'contents' }}>{children}</div>;
}
