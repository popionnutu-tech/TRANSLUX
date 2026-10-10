import { robotoCyrillic } from '@/lib/font-cyrillic';

/** Paginile /ru: preîncarcă subsetul chirilic al Roboto (ION-204); `display: contents` nu schimbă nimic în așezare. */
export default function RuLayout({ children }: { children: React.ReactNode }) {
  return <div className={robotoCyrillic.variable} style={{ display: 'contents' }}>{children}</div>;
}
