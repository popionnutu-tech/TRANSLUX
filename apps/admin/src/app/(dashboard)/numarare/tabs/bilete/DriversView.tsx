'use client';

import { useEffect, useMemo, useState } from 'react';
import { getTikiDrivers } from '../biletAparatActions';
import type { Filters, TikiDriverRow } from './types';
import { previousPeriod, pctChange, retentionIndex, retentionLabel, unreliableOverlap, fmtDate } from './periods';
import { Delta, Notice, Th, fmtInt, fmtLei, fmtPct, share, nf1, nf2, sortRows, tableWrap } from './ui';

type Col = 'driver' | 'trip_days' | 'tickets' | 'per_trip' | 'idx' | 'lei' | 'card' | 'trend';

const MIN_TRIPS = 5;

export default function DriversView({ filters, onPickDriver }: { filters: Filters; onPickDriver: (d: string) => void }) {
  const [rows, setRows] = useState<TikiDriverRow[] | null>(null);
  const [prev, setPrev] = useState<Map<string, TikiDriverRow>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: Col; dir: 'asc' | 'desc' }>({ col: 'idx', dir: 'desc' });
  const [showFew, setShowFew] = useState(false);

  const prevRange = useMemo(() => previousPeriod(filters), [filters]);

  useEffect(() => {
    let alive = true;
    setRows(null); setError(null);
    Promise.all([
      getTikiDrivers(filters.from, filters.to, filters.route),
      getTikiDrivers(prevRange.from, prevRange.to, filters.route),
    ]).then(([a, b]) => {
      if (!alive) return;
      if (a.error) { setError(a.error); return; }
      setRows(a.data!);
      setPrev(new Map((b.data ?? []).map(r => [r.driver, r])));
    });
    return () => { alive = false; };
  }, [filters, prevRange]);

  const table = useMemo(() => {
    if (!rows) return [];
    const list = rows
      .filter(r => !filters.driver || r.driver === filters.driver)
      .map(r => {
        const p = prev.get(r.driver);
        const perTrip = r.trip_days ? r.tickets / r.trip_days : null;
        const prevPerTrip = p && p.trip_days ? p.tickets / p.trip_days : null;
        return {
          ...r,
          perTrip,
          idx: r.trip_days >= MIN_TRIPS ? retentionIndex(r.tickets, r.expected) : null,
          trend: p && p.trip_days >= MIN_TRIPS && r.trip_days >= MIN_TRIPS ? pctChange(perTrip, prevPerTrip) : null,
          cardPct: share(r.card, r.tickets),
        };
      })
      .filter(r => showFew || r.trip_days >= MIN_TRIPS);
    const get = (r: typeof list[number]) => {
      switch (sort.col) {
        case 'driver': return r.driver;
        case 'trip_days': return r.trip_days;
        case 'tickets': return r.tickets;
        case 'per_trip': return r.perTrip;
        case 'idx': return r.idx;
        case 'lei': return r.lei;
        case 'card': return r.cardPct;
        case 'trend': return r.trend;
      }
    };
    return sortRows(list, get, sort.dir);
  }, [rows, prev, sort, showFew, filters.driver]);

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!rows) return <div style={{ padding: 20, color: '#999' }}>Se încarcă…</div>;

  const hidden = rows.filter(r => r.trip_days < MIN_TRIPS).length;
  const th = (col: Col, label: string, align: 'left' | 'right' = 'right', title?: string) => (
    <Th align={align} title={title} active={sort.col === col} dir={sort.dir}
      onClick={() => setSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))}>{label}</Th>
  );
  const syncNote = unreliableOverlap(filters) || unreliableOverlap(prevRange);

  return (
    <div>
      <Notice tone="info">
        <b>Indicele «ține clienții»</b> compară biletele șoferului cu cât vinde în medie <i>orice</i> șofer pe aceleași curse
        (aceeași rută, oră și direcție) în aceeași perioadă: <b>1,00</b> = media, peste <b>1,10</b> = vinde vizibil mai mult decât colegii
        pe aceleași curse. Așa nu contează dacă lucrează pe o rută mare sau pe una mică. Se calculează de la {MIN_TRIPS} curse în sus.
        Tendința = bilete pe cursă față de {fmtDate(prevRange.from)} – {fmtDate(prevRange.to)}.
      </Notice>
      {syncNote && <Notice>⚠ Perioada atinge sincronizarea în bloc (dec. 2025 – 17 ian. 2026): numărul de curse și biletele pe cursă din acest interval nu sunt corecte.</Notice>}
      <div className="card" style={{ padding: 0 }}>
        <div style={tableWrap}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                {th('driver', 'Șofer', 'left')}
                {th('trip_days', 'Curse')}
                {th('tickets', 'Bilete')}
                {th('per_trip', 'Bilete / cursă')}
                {th('idx', 'Ține clienții', 'right', 'Bilete reale / bilete așteptate pe aceleași curse')}
                {th('trend', 'Tendință')}
                {th('lei', 'Încasat')}
                {th('card', 'Card')}
                <th style={{ textAlign: 'left' }}>Cursele principale</th>
              </tr>
            </thead>
            <tbody>
              {table.map(r => {
                const lbl = retentionLabel(r.idx);
                const color = lbl.tone === 'good' ? 'var(--success)' : lbl.tone === 'bad' ? 'var(--danger)' : '#555';
                return (
                  <tr key={r.driver}>
                    <td style={{ textAlign: 'left' }}>
                      <button onClick={() => onPickDriver(r.driver)} title="Filtrează pe acest șofer"
                        style={{ background: 'none', border: 'none', padding: 0, color: '#9B1B30', cursor: 'pointer', fontWeight: 600, textAlign: 'left' }}>
                        {r.driver}
                      </button>
                      {r.vehicles > 1 && <div style={{ fontSize: 11, color: '#999' }}>{r.vehicles} mașini</div>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmtInt(r.trip_days)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtInt(r.tickets)}</td>
                    <td style={{ textAlign: 'right' }}>{r.perTrip == null ? '—' : nf1.format(r.perTrip)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 700, color }}>{r.idx == null ? '—' : nf2.format(r.idx)}</span>
                      <div style={{ fontSize: 11, color }}>{r.idx == null ? 'puține curse' : lbl.text}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}><Delta pct={r.trend} /></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtLei(r.lei)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtPct(r.cardPct, 0)}</td>
                    <td style={{ textAlign: 'left', fontSize: 12, color: '#555' }}>
                      {(r.routes ?? []).map(x => `${x.route} (${fmtInt(x.tickets)})`).join(' · ')}
                      {r.routes_n > 3 && <span style={{ color: '#999' }}> +{r.routes_n - 3}</span>}
                    </td>
                  </tr>
                );
              })}
              {table.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#999', padding: 20 }}>Nu sunt șoferi în perioada aleasă.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {hidden > 0 && (
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#777', marginTop: 8 }}>
          <input type="checkbox" style={{ width: "auto", padding: 0 }} checked={showFew} onChange={e => setShowFew(e.target.checked)} />
          Arată și șoferii cu mai puțin de {MIN_TRIPS} curse ({hidden})
        </label>
      )}
    </div>
  );
}
