'use client';

import { useEffect, useMemo, useState } from 'react';
import { getTikiPairs } from '../biletAparatActions';
import type { Filters, TikiPairRow } from './types';
import { sameRangeLastYear, pctChange, fmtDate, unreliableOverlap } from './periods';
import { SplitBar, SERIES } from './charts';
import { Delta, Kpi, Notice, Th, fmtInt, fmtLei, fmtPct, share, nf2, sortRows, tableWrap } from './ui';

type Col = 'pair' | 'tickets' | 'share' | 'lei' | 'avg' | 'tur' | 'yoy';

export default function PairsView({ filters }: { filters: Filters }) {
  const [rows, setRows] = useState<TikiPairRow[] | null>(null);
  const [yoy, setYoy] = useState<Map<string, TikiPairRow>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(40);
  const [sort, setSort] = useState<{ col: Col; dir: 'asc' | 'desc' }>({ col: 'tickets', dir: 'desc' });
  const yoyRange = useMemo(() => sameRangeLastYear(filters), [filters]);

  useEffect(() => {
    let alive = true;
    setRows(null); setError(null);
    Promise.all([
      getTikiPairs(filters.from, filters.to, filters.route, filters.driver),
      getTikiPairs(yoyRange.from, yoyRange.to, filters.route, filters.driver),
    ]).then(([a, b]) => {
      if (!alive) return;
      if (a.error) { setError(a.error); return; }
      setRows(a.data!);
      setYoy(new Map((b.data ?? []).map(r => [r.pair, r])));
    });
    return () => { alive = false; };
  }, [filters, yoyRange]);

  const total = useMemo(() => (rows ?? []).reduce((s, r) => s + r.tickets, 0), [rows]);
  const table = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    const list = rows
      .filter(r => !needle || r.pair.toLowerCase().includes(needle))
      .map(r => ({
        ...r,
        sh: share(r.tickets, total),
        avg: r.tickets ? r.lei / r.tickets : null,
        turPct: share(r.tur, r.tur + r.retur),
        yoyPct: yoy.size ? pctChange(r.tickets, yoy.get(r.pair)?.tickets ?? null) : null,
        isNew: yoy.size > 0 && !yoy.has(r.pair),
      }));
    const get = (r: typeof list[number]) => {
      switch (sort.col) {
        case 'pair': return r.pair;
        case 'tickets': return r.tickets;
        case 'share': return r.sh;
        case 'lei': return r.lei;
        case 'avg': return r.avg;
        case 'tur': return r.turPct;
        case 'yoy': return r.yoyPct;
      }
    };
    return sortRows(list, get, sort.dir);
  }, [rows, yoy, q, sort, total]);

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!rows) return <div style={{ padding: 20, color: '#999' }}>Se încarcă…</div>;

  const syncNa = unreliableOverlap(filters) || unreliableOverlap(yoyRange)
    ? 'Una dintre perioade atinge sincronizarea în bloc (dec. 2025 – 17 ian. 2026)' : undefined;
  const tur = rows.reduce((s, r) => s + r.tur, 0);
  const retur = rows.reduce((s, r) => s + r.retur, 0);
  const dedus = rows.reduce((s, r) => s + r.dedus, 0);
  const top3 = rows.slice(0, 3).reduce((s, r) => s + r.tickets, 0);
  const th = (col: Col, label: string, align: 'left' | 'right' = 'right', title?: string) => (
    <Th align={align} title={title} active={sort.col === col} dir={sort.dir}
      onClick={() => setSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))}>{label}</Th>
  );

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 12 }}>
        <Kpi title="Tipuri de bilet" value={fmtInt(rows.length)} sub="perechi de stații distincte" />
        <Kpi title="Primele 3 tipuri" value={fmtPct(share(top3, total))} sub={rows.slice(0, 3).map(r => r.pair).join(', ')} />
        <Kpi title="Tur / retur" value={`${fmtPct(share(tur, tur + retur), 0)} / ${fmtPct(share(retur, tur + retur), 0)}`}
          sub="din Chișinău / spre Chișinău" />
        <Kpi title="Tip dedus din preț" value={fmtPct(share(dedus, total))} sub="bilete fără stații în export" />
      </div>
      <Notice tone="info">
        Tipul biletului = perechea de stații, fără sens (Chișinău – Bălți cuprinde ambele sensuri; sensul e în coloana Tur/Retur).
        «vs an trecut» compară cu {fmtDate(yoyRange.from)} – {fmtDate(yoyRange.to)}. Pentru biletele de dinainte de feb. 2026
        stațiile lipsesc din export: tipul e dedus din preț (98,6% potriviri verificate).
      </Notice>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input placeholder="Caută stația…" value={q} onChange={e => setQ(e.target.value)}
          style={{ padding: '6px 8px', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, fontSize: 13, width: 220, flex: '0 0 auto' }} />
        <span style={{ fontSize: 12, color: '#777' }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: SERIES[0], margin: '0 4px 0 8px' }} />tur
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: SERIES[1], margin: '0 4px 0 8px' }} />retur
        </span>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div style={tableWrap}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'right', width: 36 }}>#</th>
                {th('pair', 'Tip bilet', 'left')}
                {th('tickets', 'Bilete')}
                {th('share', 'Pondere')}
                {th('yoy', 'vs an trecut')}
                {th('lei', 'Încasat')}
                {th('avg', 'Preț mediu')}
                {th('tur', 'Tur / retur', 'left')}
                <th style={{ textAlign: 'right' }}>Sursa</th>
              </tr>
            </thead>
            <tbody>
              {table.slice(0, limit).map((r, i) => (
                <tr key={r.pair}>
                  <td style={{ textAlign: 'right', color: '#999' }}>{i + 1}</td>
                  <td style={{ textAlign: 'left', fontWeight: 600 }}>{r.pair}</td>
                  <td style={{ textAlign: 'right' }}>{fmtInt(r.tickets)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtPct(r.sh)}</td>
                  <td style={{ textAlign: 'right' }}>{r.isNew && !syncNa ? <span style={{ fontSize: 12, color: '#777' }}>nou</span> : <Delta pct={r.yoyPct} na={syncNa} />}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtLei(r.lei)}</td>
                  <td style={{ textAlign: 'right' }}>{r.avg == null ? '—' : nf2.format(r.avg)}</td>
                  <td style={{ textAlign: 'left', whiteSpace: 'nowrap', fontSize: 12 }}>
                    <SplitBar width={90} parts={[
                      { value: r.tur, color: SERIES[0], label: 'Tur' },
                      { value: r.retur, color: SERIES[1], label: 'Retur' },
                    ]} />
                    <span style={{ marginLeft: 6, color: '#555' }}>{fmtInt(r.tur)} / {fmtInt(r.retur)}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: '#777', whiteSpace: 'nowrap' }}>
                    {r.dedus === 0 ? 'stații' : r.statii === 0 ? 'dedus din preț' : `${fmtPct(share(r.dedus, r.tickets), 0)} dedus`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {table.length > limit && (
        <button className="btn" style={{ marginTop: 8 }} onClick={() => setLimit(l => l + 100)}>
          Arată mai multe ({table.length - limit} rămase)
        </button>
      )}
    </div>
  );
}
