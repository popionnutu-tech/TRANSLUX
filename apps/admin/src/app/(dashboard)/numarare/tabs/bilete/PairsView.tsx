'use client';

import { useEffect, useMemo, useState } from 'react';
import { getTikiOmisi, getTikiPairs } from '../biletAparatActions';
import type { Filters, TikiOmisi, TikiPairRow } from './types';
import { sameRangeLastYear, pctChange, fmtDate, unreliableOverlap } from './periods';
import { SplitBar, SERIES } from './charts';
import { Delta, Kpi, Notice, Th, fmtInt, fmtLei, fmtPct, share, nf2, sortRows, tableWrap } from './ui';

type Col = 'pair' | 'tickets' | 'share' | 'lei' | 'avg' | 'tur' | 'yoy' | 'omisi';

// Ion, 01.10: «în tipul bilet și direcții să apară o coloană — oamenii omiși de TIKI dar fixați în numărare».
// Cheia perechii, ca tiki_stop_norm din SQL (migr. 452): fără diacritice, fără «GA», ordonată.
const NUMARARE_FROM = '2026-03-28';
function stopNorm(x: string): string {
  return x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(ga|gara|autogara)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function pairNorm(pair: string): string {
  const [a = '', b = ''] = pair.split(' - ');
  return [stopNorm(a), stopNorm(b)].sort().join('|');
}

export default function PairsView({ filters }: { filters: Filters }) {
  const [rows, setRows] = useState<TikiPairRow[] | null>(null);
  const [yoy, setYoy] = useState<Map<string, TikiPairRow>>(new Map());
  const [omisi, setOmisi] = useState<TikiOmisi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(40);
  const [sort, setSort] = useState<{ col: Col; dir: 'asc' | 'desc' }>({ col: 'tickets', dir: 'desc' });
  const yoyRange = useMemo(() => sameRangeLastYear(filters), [filters]);

  useEffect(() => {
    let alive = true;
    setRows(null); setError(null); setOmisi(null);
    const withCount = filters.to >= NUMARARE_FROM && !filters.route && !filters.driver;
    Promise.all([
      getTikiPairs(filters.from, filters.to, filters.route, filters.driver),
      getTikiPairs(yoyRange.from, yoyRange.to, filters.route, filters.driver),
      withCount ? getTikiOmisi(filters.from < NUMARARE_FROM ? NUMARARE_FROM : filters.from, filters.to) : Promise.resolve(null),
    ]).then(([a, b, c]) => {
      if (!alive) return;
      if (a.error) { setError(a.error); return; }
      setRows(a.data!);
      setYoy(new Map((b.data ?? []).map(r => [r.pair, r])));
      setOmisi(c?.data ?? null);
    });
    return () => { alive = false; };
  }, [filters, yoyRange]);

  const total = useMemo(() => (rows ?? []).reduce((s, r) => s + r.tickets, 0), [rows]);
  const omisiMap = useMemo(() => new Map((omisi?.perechi ?? []).map(p => [p.cheie, p])), [omisi]);
  const omisiTotal = useMemo(() => (omisi?.perechi ?? []).reduce((s, p) => s + p.oameni, 0), [omisi]);
  const omisiTur = useMemo(() => (omisi?.perechi ?? []).reduce((s, p) => s + (p.tur ?? 0), 0), [omisi]);
  const omisiRetur = useMemo(() => (omisi?.perechi ?? []).reduce((s, p) => s + (p.retur ?? 0), 0), [omisi]);
  const table = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    // perechile pe care le au doar ceilalți (nicio vânzare TIKI) apar și ele, cu 0 bilete
    const tikiKeys = new Set(rows.map(r => pairNorm(r.pair)));
    const onlyCounted: TikiPairRow[] = (omisi?.perechi ?? [])
      .filter(p => !tikiKeys.has(p.cheie))
      .map(p => ({ pair: `${p.de_la} - ${p.pana_la}`, tickets: 0, lei: 0, tur: 0, retur: 0, fara_sens: 0, statii: 0, dedus: 0 }));
    const list = [...rows, ...onlyCounted]
      .filter(r => !needle || r.pair.toLowerCase().includes(needle))
      .map(r => ({
        ...r,
        sh: share(r.tickets, total),
        avg: r.tickets ? r.lei / r.tickets : null,
        turPct: share(r.tur, r.tur + r.retur),
        yoyPct: yoy.size ? pctChange(r.tickets, yoy.get(r.pair)?.tickets ?? null) : null,
        isNew: yoy.size > 0 && !yoy.has(r.pair),
        omisi: omisi ? (omisiMap.get(pairNorm(r.pair))?.oameni ?? 0) : null,
        omisiTur: omisi ? (omisiMap.get(pairNorm(r.pair))?.tur ?? 0) : null,
        omisiRetur: omisi ? (omisiMap.get(pairNorm(r.pair))?.retur ?? 0) : null,
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
        case 'omisi': return r.omisi;
      }
    };
    return sortRows(list, get, sort.dir);
  }, [rows, yoy, q, sort, total, omisi, omisiMap]);

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
        <Kpi title="Omiși de TIKI (în Numărare)" value={omisi ? fmtInt(Math.round(omisiTotal)) : '—'}
          sub={omisi
            ? `tur ${fmtInt(Math.round(omisiTur))} / retur ${fmtInt(Math.round(omisiRetur))} · oameni numărați fără bilet TIKI · ${omisi.zile} zile numărate`
            : 'Numărarea există din 28.03.2026, fără filtru pe cursă/șofer'} />
      </div>
      <Notice tone="info">
        Tipul biletului = perechea de stații, fără sens (Chișinău – Bălți cuprinde ambele sensuri; sensul e în coloana Tur/Retur).
        «vs an trecut» compară cu {fmtDate(yoyRange.from)} – {fmtDate(yoyRange.to)}. Pentru biletele de dinainte de feb. 2026
        stațiile lipsesc din export: tipul e dedus din preț (98,6% potriviri verificate). «Omiși de TIKI» = oameni numărați
        în Numărare pe pereche, fără bilet TIKI: pe fiecare porțiune de drum numărat − TIKI; unde diferența crește au urcat,
        unde scade au coborât. Doar din {fmtDate(NUMARARE_FROM)} și doar zilele numărate.
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
                {th('omisi', 'Omiși de TIKI (tur / retur)', 'right', 'Oameni numărați în Numărare pe această pereche, fără bilet TIKI (calculat: numărat − TIKI pe porțiuni de drum)')}
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
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.omisi == null ? '—' : (
                      <>
                        <div style={{ fontWeight: 600, color: '#eb6834' }}>{fmtInt(r.omisi)}</div>
                        {r.omisi > 0 && (
                          <div style={{ fontSize: 12 }}>
                            <SplitBar width={70} parts={[
                              { value: r.omisiTur ?? 0, color: SERIES[0], label: 'Tur' },
                              { value: r.omisiRetur ?? 0, color: SERIES[1], label: 'Retur' },
                            ]} />
                            <span style={{ marginLeft: 6, color: '#555' }}>{fmtInt(r.omisiTur)} / {fmtInt(r.omisiRetur)}</span>
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: '#777', whiteSpace: 'nowrap' }}>
                    {r.tickets === 0 ? 'doar în Numărare' : r.dedus === 0 ? 'stații' : r.statii === 0 ? 'dedus din preț' : `${fmtPct(share(r.dedus, r.tickets), 0)} dedus`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 600, borderTop: '2px solid rgba(0,0,0,0.15)' }}>
                <td />
                <td style={{ textAlign: 'left' }}>Total{q.trim() ? ' (căutarea)' : ''}</td>
                <td style={{ textAlign: 'right' }}>{fmtInt(table.reduce((a, r) => a + r.tickets, 0))}</td>
                <td />
                <td />
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtLei(table.reduce((a, r) => a + r.lei, 0))}</td>
                <td />
                <td style={{ textAlign: 'left', whiteSpace: 'nowrap', fontSize: 12 }}>
                  {fmtInt(table.reduce((a, r) => a + r.tur, 0))} / {fmtInt(table.reduce((a, r) => a + r.retur, 0))}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: '#eb6834' }}>
                  {omisi ? <>
                    {fmtInt(Math.round(table.reduce((a, r) => a + (r.omisi ?? 0), 0)))}
                    <div style={{ fontSize: 12, color: '#555', fontWeight: 400 }}>
                      {fmtInt(Math.round(table.reduce((a, r) => a + (r.omisiTur ?? 0), 0)))} / {fmtInt(Math.round(table.reduce((a, r) => a + (r.omisiRetur ?? 0), 0)))}
                    </div>
                  </> : '—'}
                </td>
                <td />
              </tr>
            </tfoot>
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
