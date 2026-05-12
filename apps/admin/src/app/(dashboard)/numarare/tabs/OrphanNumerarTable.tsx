'use client';

import type { OrphanNumerar, OrphanReason } from './incasareActions';

interface Props {
  rows: OrphanNumerar[];
}

const REASON_META: Record<OrphanReason, { label: string; color: string }> = {
  no_grafic: { label: 'lipsă /grafic', color: 'var(--danger)' },
  no_driver: { label: 'fără șofer',    color: 'var(--warning)' },
};

export default function OrphanNumerarTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: 20, textAlign: 'center', fontSize: 13 }}>
        <p className="text-muted" style={{ margin: 0 }}>
          ✓ Nu există numerar nepus. Toate sesiunile de numărare sunt legate de o rută din /grafic și de un șofer.
        </p>
      </div>
    );
  }

  const GRID = '70px minmax(160px, 1fr) 130px 80px 90px 110px';

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <span><strong style={{ color: 'var(--danger)' }}>LIPSĂ /GRAFIC</strong> — există numărare pentru această rută/zi, dar dispecerul n-a făcut atribuire</span>
        <span><strong style={{ color: 'var(--warning)' }}>FĂRĂ ȘOFER</strong> — sesiunea de numărare nu are șofer atribuit</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: 8,
        padding: '4px 10px',
        borderBottom: '1px solid var(--border)',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        color: 'var(--text-muted)',
        marginBottom: 4,
      }}>
        <div>Oră</div>
        <div>Rută</div>
        <div>Șofer</div>
        <div>Data</div>
        <div style={{ textAlign: 'right' }}>Suma</div>
        <div>Motivul</div>
      </div>

      {rows.map(r => {
        const meta = REASON_META[r.reason];
        return (
          <div key={r.session_id} style={{
            display: 'grid',
            gridTemplateColumns: GRID,
            gap: 8,
            alignItems: 'center',
            padding: '5px 10px',
            borderLeft: `3px solid ${meta.color}`,
            background: r.reason === 'no_grafic' ? 'var(--danger-dim)' : 'var(--warning-dim)',
            borderRadius: 3,
            marginBottom: 2,
            fontSize: 12,
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.time_nord || '—'}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.route_name || `(rută #${r.crm_route_id})`}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.driver_name || <span className="text-muted">—</span>}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.ziua.slice(5)}</span>
            <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
              <strong>{Math.round(r.total_lei)}</strong> lei
            </span>
            <span style={{ color: meta.color, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {meta.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
