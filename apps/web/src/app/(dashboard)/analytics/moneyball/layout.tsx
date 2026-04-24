import Link from 'next/link';

export const dynamic = 'force-dynamic';

const navItems = [
  { href: '/analytics/moneyball/clasament', label: 'Clasament' },
  { href: '/analytics/moneyball/heatmap-rute', label: 'Heatmap rute' },
  { href: '/analytics/moneyball/vorp', label: 'Driver Value' },
];

export default function MoneyballLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/analytics" className="text-sm text-slate-500 hover:text-slate-900">
              ← Analitică
            </Link>
            <span className="font-semibold text-slate-900">
              Moneyball <span className="text-slate-400">·</span> TRANSLUX
            </span>
            <nav className="flex gap-6">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-slate-600 hover:text-slate-900 transition"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
