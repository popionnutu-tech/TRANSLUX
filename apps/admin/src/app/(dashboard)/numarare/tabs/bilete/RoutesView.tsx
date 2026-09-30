'use client';

import { useEffect, useMemo, useState } from 'react';
import { getTikiRoutes } from '../biletAparatActions';
import type { Filters, TikiRouteRow } from './types';
import { previousPeriod, sameRangeLastYear, pctChange, unreliableOverlap, fmtDate } from './periods';
import { Delta, Notice, Th, fmtInt, fmtLei, fmtPct, share, nf1, sortRows, tableWrap } from './ui';

type Col = 'route' | 'trip_days' | 'tickets' | 'per_trip' | 'trend' | 'yoy' | 'lei' | 'dedus';

const key = (r: TikiRouteRow) => `${r.route}|${r.time ?? ''}|${r.direction}`;
const perTrip = (r?: TikiRouteRow) => (r && r.trip_days && !r.anulare ? r.tickets / r.trip_days : null);

export default function RoutesView({ filters, onPickRoute }: { filters: Filters; onPickRoute: (r: string) => void }) {
  const [rows, setRows] = useState<TikiRouteRow[] | null>(null);
  const [prev, setPrev] = useState<Map<string, TikiRouteRow>>(new Map());
  const [yoy, setYoy] = useState<Map<string, TikiRouteRow>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [dir, setDir] = useState<'toate' | 'tur' | 'retur'>('toate');
  const [sort, setSort] = useState<{ col: Col; dir: 'asc' | 'desc' }>({ col: 'tickets', dir: 'desc' });

  const prevRange = useMemo(() => previousPeriod(filters), [filters]);
  const yoyRange = useMemo(() => sameRangeLastYear(filters), [filters]);

  useEffect(() => {
    let alive = true;
    setRows(null); setError(null);
    Promise.all([
      getTikiRoutes(filters.from, filters.to, filters.driver),
      getTikiRoutes(prevRange.from, prevRange.to, filters.driver),
      getTikiRoutes(yoyRange.from, yoyRange.to, filters.driver),
    ]).then(([a, b, c]) => {
      if (!alive) return;
      if (a.error) { setError(a.error); return; }
      setRows(a.data!);
      setPrev(new Map((b.data ?? []).map(r => [key(r), r])));
      setYoy(new Map((c.data ?? []).map(r => [key(r), r])));
    });
    return () => { alive = false; };
  }, [filters, prevRange, yoyRange]);

  const table = useMemo(() => {
    if (!rows) return [];
    const list = rows
      .filter(r => !filters.route || r.route === filters.route)
      .filter(r => dir === 'toate' || r.direction === dir)
      .map(r => ({
        ...r,
        pt: perTrip(r),
        trend: pctChange(perTrip(r), perTrip(prev.get(key(r)))),
        yoyPct: pctChange(perTrip(r), perTrip(yoy.get(key(r)))),
        dedusPct: share(r.dedus, r.tickets),
      }));
    const get = (r: typeof list[number]) => {
      switch (sort.col) {
        case 'route': return `${r.route} ${r.time ?? ''}`;
        case 'trip_days': return r.trip_days;
        case 'tickets': return r.tickets;
        case 'per_trip': return r.pt;
        case 'trend': return r.trend;
        case 'yoy': return r.yoyPct;
        case 'lei': return r.lei;
        case 'dedus': return r.dedusPct;
      }
    };
    return sortRows(list, get, sort.dir);
  }, [rows, prev, yoy, sort, dir, filters.route]);

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!rows) return <div style={{ padding: 20, color: '#999' }}>Se încarcă…</div>;

  const th = (col: Col, label: string, align: 'left' | 'right' = 'right', title?: string) => (
    <Th align={align} title={title} active={sort.col === col} dir={sort.dir}
      onClick={() => setSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))}>{label}</Th>
  );
  const syncNa = unreliableOverlap(filters) ? 'Perioada atinge sincronizarea în bloc' : undefined;
  const prevNa = syncNa ?? (unreliableOverlap(prevRange) ? 'Perioada anterioară atinge sincronizarea în bloc' : undefined);
  const yoyNa = syncNa ?? (unreliableOverlap(yoyRange) ? 'Perioada de anul trecut atinge sincronizarea în bloc' : undefined);

  return (
    <div>
      <Notice tone="info">
        O cursă = rută + oră + direcție. <b>Bilete / cursă</b> arată câți clienți ține cursa într-o zi; tendința îl compară cu
        {' '}{fmtDate(prevRange.from)} – {fmtDate(prevRange.to)}, iar «vs an trecut» cu {fmtDate(yoyRange.from)} – {fmtDate(yoyRange.to)}.
        Cei mai buni șoferi = bilete pe cursă pe această cursă (întâi cei cu cel puțin 3 curse).
      </Notice>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['toate', 'tur', 'retur'] as const).map(d => (
          <button key={d} className="btn" onClick={() => setDir(d)}
            style={{ padding: '4px 10px', fontSize: 12, ...(dir === d ? { background: 'var(--primary-dim)' } : {}) }}>
            {d === 'toate' ? 'Toate' : d === 'tur' ? 'Tur (din Chișinău)' : 'Retur (spre Chișinău)'}
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div style={tableWrap}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                {th('route', 'Cursa', 'left')}
                {th('trip_days', 'Zile')}
                {th('tickets', 'Bilete')}
                {th('per_trip', 'Bilete / cursă')}
                {th('trend', 'Tendință')}
                {th('yoy', 'vs an trecut')}
                {th('lei', 'Încasat')}
                <th style={{ textAlign: 'left' }}>Cei mai buni șoferi (bilete / cursă)</th>
                {th('dedus', 'Tip dedus', 'right', 'Bilete fără stații în export, cu tipul dedus din preț')}
              </tr>
            </thead>
            <tbody>
              {table.map(r => (
                <tr key={key(r)}>
                  <td style={{ textAlign: 'left' }}>
                    <button onClick={() => !r.anulare && onPickRoute(r.route)} title="Filtrează pe această rută"
                      style={{ background: 'none', border: 'none', padding: 0, color: r.anulare ? '#777' : '#9B1B30', cursor: r.anulare ? 'default' : 'pointer', fontWeight: 600, textAlign: 'left' }}>
                      {r.time && <span style={{ color: '#333', marginRight: 6 }}>{r.time}</span>}{r.route}
                    </button>
                    <div style={{ fontSize: 11, color: '#999' }}>
                      {r.anulare ? 'vânzări fără cursă numită' : r.direction === 'tur' ? 'tur · din Chișinău' : 'retur · spre Chișinău'}
                      {r.drivers_n > 0 && ` · ${r.drivers_n} șoferi`}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmtInt(r.trip_days)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtInt(r.tickets)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.pt == null ? '—' : nf1.format(r.pt)}</td>
                  <td style={{ textAlign: 'right' }}><Delta pct={r.trend} na={r.anulare ? undefined : prevNa} /></td>
                  <td style={{ textAlign: 'right' }}><Delta pct={r.yoyPct} na={r.anulare ? undefined : yoyNa} /></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtLei(r.lei)}</td>
                  <td style={{ textAlign: 'left', fontSize: 12, color: '#555' }}>
                    {r.top_drivers.map(d => `${d.driver} ${nf1.format(d.per_trip)} (${d.trips})`).join(' · ') || '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: '#777' }}>{r.dedus ? fmtPct(r.dedusPct, 0) : '—'}</td>
                </tr>
              ))}
              {table.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#999', padding: 20 }}>Nu sunt curse în perioada aleasă.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
