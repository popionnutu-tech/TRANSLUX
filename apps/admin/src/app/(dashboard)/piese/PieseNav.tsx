'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminRole } from '@translux/db';

const TABS = [
  { href: '/piese', label: 'Tablou' },
  { href: '/piese/stoc', label: 'Stoc' },
  { href: '/piese/catalog', label: 'Catalog' },
  { href: '/piese/prihod', label: 'Prihod' },
  { href: '/piese/rashod', label: 'Rashod' },
  { href: '/piese/mutari', label: 'Mutări' },
  { href: '/piese/inventar', label: 'Inventar' },
  { href: '/piese/harta', label: 'Hartă' },
  { href: '/piese/magazin', label: 'Magazin' },
  { href: '/piese/fiscal', label: 'e-Factura' },
  { href: '/piese/integrare-1c', label: '1C' },
  { href: '/piese/rapoarte', label: 'Rapoarte' },
];

// CONTABIL (contabil-șef) vede modulul doar pe citire + fiscal/1C; operațiunile de depozit rămân ADMIN.
const CONTABIL_TABS = new Set(['/piese', '/piese/stoc', '/piese/catalog', '/piese/harta', '/piese/rapoarte', '/piese/fiscal', '/piese/integrare-1c']);

export default function PieseNav({ role }: { role: AdminRole }) {
  const path = usePathname();
  const tabs = role === 'ADMIN' ? TABS : TABS.filter((t) => CONTABIL_TABS.has(t.href));
  return (
    <div className="pill-row" style={{ marginBottom: 22, borderBottom: '1px solid var(--pline)', paddingBottom: 14 }}>
      {tabs.map((t) => {
        const active = t.href === '/piese' ? path === '/piese' : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={`btn${active ? ' btn-primary' : ''}`} style={{ padding: '8px 14px' }}>{t.label}</Link>
        );
      })}
    </div>
  );
}
