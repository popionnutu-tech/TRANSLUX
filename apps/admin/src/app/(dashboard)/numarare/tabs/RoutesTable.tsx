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

// Data foii (ISO YYYY-MM-DD) → DD.MM.YYYY, fără a trece prin Date (evită deriva de fus).
function formatData(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

function num(v: number) {
  if (!v || v <= 0) return <span className="text-muted">—</span>;
  return <strong>{Math.round(v)}</strong>;
}

type SortKey = 'default' | 'Data' | 'Ruta' | 'Sofer';
type SortDir = 'asc' | 'desc';

export default function RoutesTable({ routes }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterRuta, setFilterRuta] = useState('');
  const [filterSofer, setFilterSofer] = useState('');

  // Ordinea implicită: ziua descrescător (recent sus), apoi ora cursei, apoi ruta.
  const defaultCompare = (a: GraficRouteRow, b: GraficRouteRow) => {
    if (a.ziua !== b.ziua) return a.ziua < b.ziua ? 1 : -1;
    const ta = parseFirstTime(a.time_nord);
    const tb = parseFirstTime(b.time_nord);
    if (ta !== tb) return ta - tb;
    return (a.route_name || '').localeCompare(b.route_name || '');
  };

  const routeOptions = useMemo(
    () => Array.from(new Set(routes.map(r => r.route_name).filter(Boolean))).sort((a, b) => (a || '').localeCompare(b || '', 'ro')),
    [routes],
  );
  const soferOptions = useMemo(
    () => Array.from(new Set(routes.map(r => r.driver_name).filter(Boolean))).sort((a, b) => (a || '').localeCompare(b || '', 'ro')),
    [routes],
  );

  // Filtrare + sortare — afectează doar afișarea.
  const processed = useMemo(() => {
    let list = routes;
    if (filterRuta) list = list.filter(r => r.route_name === filterRuta);
    if (filterSofer) list = list.filter(r => r.driver_name === filterSofer);
    const arr = [...list];
    if (sortKey === 'default') {
      arr.sort(defaultCompare);
    } else {
      arr.sort((a, b) => {
        let c = 0;
        if (sortKey === 'Data') c = (a.ziua || '').localeCompare(b.ziua || '');
        else if (sortKey === 'Ruta') c = (a.route_name || '').localeCompare(b.route_name || '', 'ro');
        else if (sortKey === 'Sofer') c = (a.driver_name || '').localeCompare(b.driver_name || '', 'ro');
        if (c !== 0) return sortDir === 'asc' ? c : -c;
        return defaultCompare(a, b);
      });
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, filterRuta, filterSofer, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t = { num: 0, inc: 0, lg: 0, dg: 0, vk: 0, dt: 0, rs: 0, extra2t: 0 };
    for (const r of processed) {
      t.num += r.numarare_lei;
      t.inc += r.incasare_lei;
      t.lg  += r.ligotniki0_suma;
      t.dg  += r.incasare_diagrama;
      t.vk  += r.ligotniki_vokzal_suma;
      t.dt  += r.dt_suma;
      t.rs  += r.dop_rashodi;
      if (r.extra_2tarife_lei != null) t.extra2t += r.extra_2tarife_lei;
    }
    return t;
  }, [processed]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSort = (key: Exclude<SortKey, 'default'>) => {
    if (sortKey === key) {
      // al doilea click inversează; al treilea revine la ordinea implicită
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey('default'); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  const arrow = (key: Exclude<SortKey, 'default'>) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const isFiltered = filterRuta !== '' || filterSofer !== '';

  // Grid: Data | Oră | Rută | Șofer | Foaie | Num | +2T | Inc | Dg | Lg | Rs | Δ | Status | expand
  const GRID = '76px 92px minmax(150px, 1fr) 118px 62px 58px 50px 58px 54px 46px 44px 62px 92px 18px';
  const selStyle: React.CSSProperties = {
    width: '100%', fontSize: 10, marginTop: 2, border: '1px solid var(--border)',
    borderRadius: 3, padding: '0 1px', background: '#fff',
  };

  return (
    <div>
      {/* Totals */}
      <div className="card" style={{ display: 'flex', gap: 18, padding: 10, marginBottom: 10, flexWrap: 'wrap', fontSize: 12 }}>
        <div><span className="text-muted">Numărare:</span> <strong>{Math.round(totals.num)} lei</strong></div>
        {totals.extra2t > 0 && (
          <div><span className="text-muted">+2T:</span> <strong style={{ color: 'var(--success)' }}>{Math.round(totals.extra2t)} lei</strong></div>
        )}
        <div><span className="text-muted">Încasare:</span> <strong>{Math.round(totals.inc)} lei</strong></div>
        <div><span className="text-muted">Diagrama:</span> <strong>{Math.round(totals.dg)} lei</strong></div>
        <div><span className="text-muted">Lgotnici 0:</span> <strong>{Math.round(totals.lg)} lei</strong></div>
        {totals.vk > 0 && <div><span className="text-muted">Vokzal:</span> <strong>{Math.round(totals.vk)} lei</strong></div>}
        {totals.dt > 0 && <div><span className="text-muted">DT:</span> <strong>{Math.round(totals.dt)} lei</strong></div>}
        {totals.rs > 0 && <div><span className="text-muted">Rashodi:</span> <strong>{Math.round(totals.rs)} lei</strong></div>}
        {isFiltered && <div style={{ marginLeft: 'auto' }}><span className="text-muted">filtrat:</span> <strong>{processed.length}</strong></div>}
      </div>

      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: 6,
        padding: '4px 10px',
        borderBottom: '1px solid var(--border)',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        color: 'var(--text-muted)',
        marginBottom: 4,
        alignItems: 'start',
      }}>
        <div onClick={() => toggleSort('Data')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Sortează după data foii">Data{arrow('Data')}</div>
        <div>Oră</div>
        <div>
          <div onClick={() => toggleSort('Ruta')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Sortează alfabetic după rută">Rută{arrow('Ruta')}</div>
          <select value={filterRuta} onChange={e => setFilterRuta(e.target.value)} title="Filtrează după rută"
            style={{ ...selStyle, background: filterRuta ? '#fff3cd' : '#fff', fontWeight: filterRuta ? 600 : 400 }}>
            <option value="">toate rutele</option>
            {routeOptions.map(o => <option key={o} value={o!}>{o}</option>)}
          </select>
        </div>
        <div>
          <div onClick={() => toggleSort('Sofer')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Sortează alfabetic după șofer">Șofer{arrow('Sofer')}</div>
          <select value={filterSofer} onChange={e => setFilterSofer(e.target.value)} title="Filtrează după șofer"
            style={{ ...selStyle, background: filterSofer ? '#fff3cd' : '#fff', fontWeight: filterSofer ? 600 : 400 }}>
            <option value="">toți șoferii</option>
            {soferOptions.map(o => <option key={o} value={o!}>{o}</option>)}
          </select>
        </div>
        <div>Foaie</div>
        <div style={{ textAlign: 'right' }}>Num</div>
        <div style={{ textAlign: 'right' }}>+2T</div>
        <div style={{ textAlign: 'right' }}>Inc</div>
        <div style={{ textAlign: 'right' }}>Dg</div>
        <div style={{ textAlign: 'right' }}>Lg</div>
        <div style={{ textAlign: 'right' }}>Rs</div>
        <div style={{ textAlign: 'right' }}>Δ</div>
        <div>Status</div>
        <div></div>
      </div>

      {/* Rows */}
      {processed.map((r, idx) => {
        const meta = STATUS_META[r.status];
        const isOpen = expanded.has(r.row_key);
        const hasDetails = !!(r.comment || r.fiscal_nrs || r.ligotniki_vokzal_suma > 0 || r.dt_suma > 0 || r.plati > 0);
        // Dungi alternante: alb / vișiniu deschis. Rândurile anulate rămân gri, distinct.
        const stripe = r.cancelled ? 'rgba(0,0,0,0.04)' : (idx % 2 === 1 ? 'rgba(155,27,48,0.055)' : '#ffffff');

        return (
          <div key={r.row_key} style={{
            borderLeft: `3px solid ${meta.color}`,
            background: stripe,
          }}>
            <div
              onClick={() => hasDetails && toggle(r.row_key)}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: 6,
                alignItems: 'center',
                padding: '2px 10px',
                fontSize: 12,
                cursor: hasDetails ? 'pointer' : 'default',
                opacity: r.cancelled ? 0.5 : 1,
              }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap' }}>{formatData(r.ziua)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap' }}>{r.time_nord || '—'}</span>
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
              <span style={{
                fontFamily: 'var(--font-mono)',
                textAlign: 'right',
                fontSize: 11,
                color: r.extra_2tarife_lei != null && r.extra_2tarife_lei > 0 ? 'var(--success)' : 'var(--text-muted)',
              }}>
                {r.extra_2tarife_lei == null
                  ? <span className="text-muted">—</span>
                  : r.extra_2tarife_lei > 0 ? <strong>+{Math.round(r.extra_2tarife_lei)}</strong> : <span className="text-muted">0</span>}
              </span>
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

      {processed.length === 0 && (
        <p className="text-muted" style={{ textAlign: 'center', padding: 20, fontSize: 13 }}>
          {isFiltered ? 'Niciun rezultat pentru filtrul ales.' : 'Nu există rute pentru perioada selectată.'}
        </p>
      )}
    </div>
  );
}
