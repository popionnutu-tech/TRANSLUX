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
export function Delta({ pct, na, title, size = 12 }: { pct: number | null; na?: string; title?: string; size?: number }) {
  if (na) {
    return <span title={na} style={{ fontSize: size, color: '#999', borderBottom: '1px dotted #bbb', cursor: 'help' }}>n/a</span>;
  }
  if (pct == null) return <span style={{ fontSize: size, color: '#999' }}>—</span>;
  const up = pct > 0.05, down = pct < -0.05;
  const color = up ? 'var(--success)' : down ? 'var(--danger)' : '#666';
  return (
    <span title={title} style={{ fontSize: size, fontWeight: 600, color, whiteSpace: 'nowrap' }}>
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

// ─── ION-159: legenda siguranței cifrei și linia de calitate (sus în fiecare vedere nouă) ───

const legendItem: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' };

/** O singură linie: culoarea = tipul de client, forma = cât de sigură e cifra. */
export function CertaintyLegend({ types = true, hatch }: { types?: boolean; hatch: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#555', margin: '0 0 10px' }}>
      {types && (
        <>
          <span style={legendItem}><span style={{ width: 12, height: 10, borderRadius: 2, background: '#2a78d6' }} />TIKI</span>
          <span style={legendItem}><span style={{ width: 12, height: 10, borderRadius: 2, background: '#eb6834' }} />ceilalți</span>
          <span style={{ color: '#ccc' }}>|</span>
        </>
      )}
      <span style={legendItem}><b>30</b> = sigur</span>
      <span style={legendItem}>
        <svg width="16" height="10" aria-hidden><rect width="13" height="10" rx="2" fill="#eb6834" /><line x1="14.5" x2="14.5" y1="0" y2="10" stroke="#333" strokeWidth="1.5" /></svg>
        «cel puțin» = pot fi mai mulți, nu mai puțini
      </span>
      <span style={legendItem}>
        <svg width="22" height="10" aria-hidden><rect width="10" height="10" rx="2" fill="#2a78d6" /><rect x="11" width="11" height="10" rx="2" fill="#2a78d6" opacity="0.35" /></svg>
        <b>30–38</b> = undeva între
      </span>
      <span style={legendItem}>{hatch}<b>?</b> = nu știm</span>
      <span style={legendItem}>{hatch}<b>!</b> = nu se potrivește</span>
    </div>
  );
}

/** «Legate pe mașină X % · pe etichetă Y % · nelegate N bilete …» — sus în fiecare vedere. */
export function QualityLine({ q }: { q: import('./types').TikiCalitate | null }) {
  if (!q) return null;
  const s = q.surse ?? {};
  const total = Object.values(s).reduce((a, b) => a + (b || 0), 0);
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)} %` : '—');
  const masina = s.masina ?? 0;
  const eticheta = (s.eticheta_luna ?? 0) + (s.eticheta_2026 ?? 0);
  const manual = s.override ?? 0;
  const nelegat = s.nelegat ?? 0;
  const anulare = s.anulare ?? 0;
  return (
    <div style={{ fontSize: 12, color: '#666', margin: '0 0 6px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <span title="Cum s-a aflat ruta fiecărui bilet: după mașina din grafic sau, unde nu se știe mașina, după eticheta cursei">
        Bilete legate de rută: pe mașină <b>{pct(masina)}</b> · pe etichetă <b>{pct(eticheta)}</b>
        {manual > 0 && <> · corectate de mână <b>{fmtInt(manual)}</b></>}
        {' · '}nelegate <b>{fmtInt(nelegat)}</b> bilete
      </span>
      {anulare > 0 && <span>· «Anulare» <b>{fmtInt(anulare)}</b></span>}
      {q.zi_vanzare > 0 && <span title="Cursa avea o dată greșită; s-a luat ziua vânzării">· pe ziua vânzării <b>{fmtInt(q.zi_vanzare)}</b></span>}
      {q.coada > 0 && <span style={{ color: '#8a5a00' }}>· se pregătește istoria: {q.coada} {q.coada === 1 ? 'lună' : 'luni'}</span>}
    </div>
  );
}
