'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CamioaneTab } from '@/lib/lde/camioane-nav';

export default function CamioaneNav({ tabs }: { tabs: CamioaneTab[] }) {
  const pathname = usePathname();
  // Fila activă = cea mai lungă potrivire: /lde/camioane prefixează toate celelalte.
  const activ = tabs
    .filter((t) => pathname === t.href || pathname.startsWith(t.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="flex gap-2" style={{ padding: '16px 24px 0', flexWrap: 'wrap' }}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={`btn ${activ === t.href ? 'btn-primary' : ''}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
