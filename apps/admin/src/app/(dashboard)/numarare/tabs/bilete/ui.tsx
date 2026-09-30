'use client';

// Piese mici comune ale tab-ului «Bilete aparat»: formatare, carduri KPI, variații, insigne.

import type { ReactNode } from 'react';

export const nf0 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
export const nf1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const nf2 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : nf0.format(n));
export const fmtLei = (n: number | null | undefined) => (n == null ? '—' : `${nf0.format(n)} lei`);
export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n == null || !isFinite(n) ? '—' : `${n.toFixed(digits).replace('.', ',')}%`;
export const share = (part: number, total: number) => (total ? (part / total) * 100 : null);

/** Variația cu semn și culoare; «n/a» cu motiv când comparația nu e corectă. */
export function Delta({ pct, na, title }: { pct: number | null; na?: string; title?: string }) {
  if (na) {
    return <span title={na} style={{ fontSize: 12, color: '#999', borderBottom: '1px dotted #bbb', cursor: 'help' }}>n/a</span>;
  }
  if (pct == null) return <span style={{ fontSize: 12, color: '#999' }}>—</span>;
  const up = pct > 0.05, down = pct < -0.05;
  const color = up ? 'var(--success)' : down ? 'var(--danger)' : '#666';
  return (
    <span title={title} style={{ fontSize: 12, fontWeight: 600, color, whiteSpace: 'nowrap' }}>
      {up ? '▲' : down ? '▼' : '■'} {pct > 0 ? '+' : ''}{pct.toFixed(1).replace('.', ',')}%
    </span>
  );
}

export function Kpi({ title, value, sub, children }: { title: string; value: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card" style={{ padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: 12, color: '#777', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#222', margin: '4px 0 2px', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#777' }}>{sub}</div>}
      {children && <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>{children}</div>}
    </div>
  );
}

export function CompareLine({ label, pct, na }: { label: string; pct: number | null; na?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: '#777' }}>
      <span>{label}</span><Delta pct={pct} na={na} />
    </div>
  );
}

export function Notice({ tone = 'warning', children }: { tone?: 'warning' | 'info' | 'danger'; children: ReactNode }) {
  const c = tone === 'danger' ? ['var(--danger-dim)', 'var(--danger)'] : tone === 'info' ? ['rgba(42,120,214,0.07)', '#1d5fae'] : ['var(--warning-dim)', '#8a5a00'];
  return (
    <div style={{ background: c[0], color: c[1], borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>
      {children}
    </div>
  );
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
      border: active ? '1px solid #9B1B30' : '1px solid rgba(0,0,0,0.12)',
      background: active ? '#9B1B30' : '#fff', color: active ? '#fff' : '#444', fontWeight: active ? 600 : 500,
    }}>{children}</button>
  );
}

export function Th({ children, onClick, active, dir, align = 'right', title }: {
  children: ReactNode; onClick?: () => void; active?: boolean; dir?: 'asc' | 'desc'; align?: 'left' | 'right'; title?: string;
}) {
  return (
    <th onClick={onClick} title={title} style={{
      textAlign: align, cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none',
      color: active ? '#9B1B30' : undefined,
    }}>
      {children}{active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );
}

export function sortRows<T>(rows: T[], get: (r: T) => number | string | null, dir: 'asc' | 'desc'): T[] {
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ro');
    return dir === 'asc' ? c : -c;
  });
}

export const tableWrap: React.CSSProperties = { overflowX: 'auto', width: '100%' };
