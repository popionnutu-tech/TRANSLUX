'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/analytics/moneyball/clasament', label: 'Clasament' },
  { href: '/analytics/moneyball/heatmap-rute', label: 'Heatmap rute' },
  { href: '/analytics/moneyball/vorp', label: 'Driver Value' },
];

export function MoneyballNav() {
  const pathname = usePathname();

  return (
    <div className="mode-toggle">
      {items.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            className={active ? 'mode-btn mode-btn-active' : 'mode-btn'}
            style={{ textDecoration: 'none', display: 'inline-block' }}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
