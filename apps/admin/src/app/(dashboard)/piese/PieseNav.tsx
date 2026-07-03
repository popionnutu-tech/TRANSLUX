'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminRole } from '@translux/db';
import { pieseHrefsForRole } from '@/lib/piese-nav';

const TABS = [
  { href: '/piese', label: 'Tablou' },
  { href: '/piese/stoc', label: 'Stoc' },
  { href: '/piese/cautare', label: 'Căutare' },
  { href: '/piese/catalog', label: 'Catalog' },
  { href: '/piese/nomenclator', label: 'Nomenclator' },
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

export default function PieseNav({ role }: { role: AdminRole }) {
  const path = usePathname();
  const allowed = pieseHrefsForRole(role); // null = ADMIN (toate taburile)
  const tabs = allowed ? TABS.filter((t) => allowed.has(t.href)) : TABS;
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
