import { openSansCyrillic } from '@/lib/font-cyrillic';

/** Paginile de direcție /ru/avtobus/…: preîncarcă subsetul chirilic al Open Sans (ION-204), ca `app/ru/layout.tsx`. */
export default function RuRouteLayout({ children }: { children: React.ReactNode }) {
  return <div className={openSansCyrillic.variable} style={{ display: 'contents' }}>{children}</div>;
}
