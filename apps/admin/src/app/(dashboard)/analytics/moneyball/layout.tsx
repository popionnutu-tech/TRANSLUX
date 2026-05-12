import Link from 'next/link';
import { MoneyballNav } from '@/components/moneyball/MoneyballNav';

export const dynamic = 'force-dynamic';

export default function MoneyballLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-wide">
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link
            href="/analytics"
            style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}
          >
            ← Analitică
          </Link>
          <h1 style={{ margin: 0 }}>Moneyball</h1>
        </div>
        <MoneyballNav />
      </div>
      {children}
    </div>
  );
}
