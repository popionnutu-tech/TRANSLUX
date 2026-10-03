import { openSansCyrillic } from '@/lib/font-cyrillic';

/** Paginile /ru: preîncarcă subsetul chirilic al Open Sans (ION-204); `display: contents` nu schimbă nimic în așezare. */
export default function RuLayout({ children }: { children: React.ReactNode }) {
  return <div className={openSansCyrillic.variable} style={{ display: 'contents' }}>{children}</div>;
}
