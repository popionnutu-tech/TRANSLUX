'use client';

import { useMemo, useState } from 'react';
import type { GraficRouteRow, RouteStatus } from './incasareActions';

interface Props {
  routes: GraficRouteRow[];
}

const STATUS_META: Record<RouteStatus, { label: string; color: string; icon: string }> = {
  ok:           { label: 'OK',            color: 'var(--success)',     icon: '✓' },
  underpaid:    { label: 'Datorează',     color: 'var(--danger)',      icon: '⚠' },
  overpaid:     { label: 'În plus',       color: 'var(--warning)',     icon: 'ℹ' },
  no_numarare:  { label: 'Fără numărare', color: 'var(--warning)',     icon: '?' },
  no_incasare:  { label: 'Fără încasare', color: 'var(--danger)',      icon: '✗' },
  no_foaie:     { label: 'Fără foaie',    color: 'var(--danger)',      icon: '✗' },
  no_driver:    { label: 'Fără șofer',    color: 'var(--text-muted)',  icon: '·' },
  no_data:      { label: 'Fără date',     color: 'var(--text-muted)',  icon: '—' },
  empty:        { label: '—',             color: 'var(--text-muted)',  icon: '·' },
  cancelled:    { label: 'Anulată',       color: 'var(--text-muted)',  icon: '⊘' },
};

// Convertește "08:00 - 12:40" sau "8:00" la prima oră (pentru sortare)
function parseFirstTime(s: string | null): number {
  if (!s) return 9999;
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 9999;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function lastName(full: string | null): string {
  if (!full) return '—';
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] || full;
}

function num(v: number) {
  if (!v || v <= 0) return <span className="text-muted">—</span>;
  return <strong>{Math.round(v)}</strong>;
}

export default function RoutesTable({ routes }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    return [...routes].sort((a, b) => {
      if (a.ziua !== b.ziua) return a.ziua < b.ziua ? 1 : -1; // recent first
      const ta = parseFirstTime(a.time_nord);
      const tb = parseFirstTime(b.time_nord);
      if (ta !== tb) return ta - tb;
      return (a.route_name || '').localeCompare(b.route_name || '');
    });
  }, [routes]);

  const totals = useMemo(() => {
    const t = { num: 0, inc: 0, lg: 0, dg: 0, vk: 0, dt: 0, rs: 0 };
    for (const r of sorted) {
      t.num += r.numarare_lei;
      t.inc += r.incasare_lei;
      t.lg  += r.ligotniki0_suma;
      t.dg  += r.incasare_diagrama;
      t.vk  += r.ligotniki_vokzal_suma;
      t.dt  += r.dt_suma;
      t.rs  += r.dop_rashodi;
    }
    return t;
  }, [sorted]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Grid: time | route | driver | foaie | num | inc | dg | lg | rs | Δ | status | expand
  const GRID = '70px minmax(160px, 1fr) 130px 80px 70px 70px 65px 55px 50px 75px 110px 22px';

  return (
    <div>
      {/* Totals */}
      <div className="card" style={{ display: 'flex', gap: 18, padding: 10, marginBottom: 10, flexWrap: 'wrap', fontSize: 12 }}>
        <div><span className="text-muted">Numărare:</span> <strong>{Math.round(totals.num)} lei</strong></div>
        <div><span className="text-muted">Încasare:</span> <strong>{Math.round(totals.inc)} lei</strong></div>
        <div><span className="text-muted">Diagrama:</span> <strong>{Math.round(totals.dg)} lei</strong></div>
        <div><span className="text-muted">Lgotnici 0:</span> <strong>{Math.round(totals.lg)} lei</strong></div>
        {totals.vk > 0 && <div><span className="text-muted">Vokzal:</span> <strong>{Math.round(totals.vk)} lei</strong></div>}
        {totals.dt > 0 && <div><span className="text-muted">DT:</span> <strong>{Math.round(totals.dt)} lei</strong></div>}
        {totals.rs > 0 && <div><span className="text-muted">Rashodi:</span> <strong>{Math.round(totals.rs)} lei</strong></div>}
      </div>

      {/* Header */}
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
        <div>Foaie</div>
        <div style={{ textAlign: 'right' }}>Num</div>
        <div style={{ textAlign: 'right' }}>Inc</div>
        <div style={{ textAlign: 'right' }}>Dg</div>
        <div style={{ textAlign: 'right' }}>Lg</div>
        <div style={{ textAlign: 'right' }}>Rs</div>
        <div style={{ textAlign: 'right' }}>Δ</div>
        <div>Status</div>
        <div></div>
      </div>

      {/* Rows */}
      {sorted.map(r => {
        const meta = STATUS_META[r.status];
        const isOpen = expanded.has(r.assignment_id);
        const hasDetails = !!(r.comment || r.fiscal_nrs || r.ligotniki_vokzal_suma > 0 || r.dt_suma > 0 || r.plati > 0);

        return (
          <div key={r.assignment_id} style={{
            borderLeft: `3px solid ${meta.color}`,
            background: r.cancelled ? 'rgba(0,0,0,0.03)' : 'transparent',
            borderRadius: 3,
            marginBottom: 2,
          }}>
            <div
              onClick={() => hasDetails && toggle(r.assignment_id)}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: 8,
                alignItems: 'center',
                padding: '5px 10px',
                fontSize: 12,
                cursor: hasDetails ? 'pointer' : 'default',
                opacity: r.cancelled ? 0.5 : 1,
              }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.time_nord || '—'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.route_name || '—'}
                {r.vehicle_plate && (
                  <span className="text-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginLeft: 6 }}>
                    {r.vehicle_plate}
                  </span>
                )}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.driver_name || <span className="text-muted">—</span>}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {r.foaie_nr ? (
                  <span style={{ color: r.foaie_source === 'implied' ? '#f57c00' : 'inherit' }}
                        title={r.foaie_source === 'implied' ? 'Asociat automat din istoric' : ''}>
                    {r.foaie_nr}
                    {r.foaie_source === 'implied' && (
                      <span style={{ fontSize: 9, marginLeft: 3, opacity: 0.7 }}>auto</span>
                    )}
                  </span>
                ) : <span className="text-muted">—</span>}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{num(r.numarare_lei)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{num(r.incasare_lei)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 11 }}>{num(r.incasare_diagrama)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 11 }}>{num(r.ligotniki0_suma)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 11 }}>{num(r.dop_rashodi)}</span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                textAlign: 'right',
                color: r.diff < 0 ? 'var(--danger)' : r.diff > 0 ? 'var(--warning)' : 'var(--text-muted)',
                fontWeight: 600,
              }}>
                {r.status === 'no_numarare' || r.status === 'no_incasare' || r.status === 'cancelled' || r.status === 'empty' || r.status === 'no_data'
                  ? <span className="text-muted">—</span>
                  : `${r.diff >= 0 ? '+' : ''}${Math.round(r.diff)}`}
              </span>
              <span style={{ color: meta.color, fontSize: 11, fontWeight: 600 }}>
                {meta.icon} {meta.label}
              </span>
              <span className="text-muted" style={{ fontSize: 10, textAlign: 'center' }}>
                {hasDetails ? (isOpen ? '▾' : '▸') : ''}
              </span>
            </div>

            {/* Details — comment, fiscal, vokzal, DT, plăți, retur vehicle */}
            {isOpen && hasDetails && (
              <div style={{
                padding: '4px 10px 6px 28px',
                fontSize: 11,
                color: 'var(--text-muted)',
                display: 'flex',
                gap: 14,
                flexWrap: 'wrap',
              }}>
                {r.plati > 0 && <span><span style={{ opacity: 0.7 }}>plăți</span> <strong>{r.plati}</strong></span>}
                {r.ligotniki_vokzal_suma > 0 && <span><span style={{ opacity: 0.7 }}>vokzal</span> <strong>{Math.round(r.ligotniki_vokzal_suma)} lei</strong></span>}
                {r.dt_suma > 0 && <span><span style={{ opacity: 0.7 }}>DT</span> <strong>{Math.round(r.dt_suma)} lei</strong></span>}
                {r.vehicle_plate_retur && <span><span style={{ opacity: 0.7 }}>retur</span> <span style={{ fontFamily: 'var(--font-mono)' }}>{r.vehicle_plate_retur}</span></span>}
                {r.fiscal_nrs && <span style={{ fontFamily: 'var(--font-mono)' }}>#{r.fiscal_nrs}</span>}
                {r.comment && <span style={{ fontStyle: 'italic' }}>«{r.comment}»</span>}
              </div>
            )}
          </div>
        );
      })}

      {sorted.length === 0 && (
        <p className="text-muted" style={{ textAlign: 'center', padding: 20, fontSize: 13 }}>
          Nu există rute pentru perioada selectată.
        </p>
      )}
    </div>
  );
}
