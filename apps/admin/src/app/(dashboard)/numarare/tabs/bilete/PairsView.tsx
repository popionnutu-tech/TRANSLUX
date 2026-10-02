'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { getTikiZoneBalti, getTikiOmisi, getTikiPairs } from '../biletAparatActions';
import type { Filters, TikiOmisi, TikiPairRow } from './types';
import { sameRangeLastYear, pctChange, fmtDate, unreliableOverlap } from './periods';
import { SplitBar, SERIES } from './charts';
import { Delta, Kpi, Notice, Th, fmtInt, fmtLei, fmtPct, share, nf2, sortRows, tableWrap } from './ui';
import { GRUP, ZONE, zonaPerechii, pairNorm, sumPairs, type Zona, type ZoneBalti } from './grupare';

type Col = 'pair' | 'tickets' | 'share' | 'lei' | 'avg' | 'tur' | 'yoy' | 'omisi';

// Ion, 01.10: «în tipul bilet și direcții să apară o coloană — oamenii omiși de TIKI dar fixați în numărare».
// Cheia perechii, ca tiki_stop_norm din SQL (migr. 452): fără diacritice, fără «GA», ordonată (grupare.ts).
const NUMARARE_FROM = '2026-03-28';

type Enriched = TikiPairRow & {
  sh: number | null; avg: number | null; turPct: number | null; yoyPct: number | null; isNew: boolean;
  omisi: number | null; omisiTur: number | null; omisiRetur: number | null;
};
// ION-180: un rând al tabelului e o pereche sau un grup (până la Bălți / de la Edineț la Bălți / raionul Briceni / raionul Ocnița / alte raioane) cu localitățile lui.
type Item = { row: Enriched; zona?: Zona; members?: Enriched[] };

export default function PairsView({ filters }: { filters: Filters }) {
  const [rows, setRows] = useState<TikiPairRow[] | null>(null);
  const [yoy, setYoy] = useState<Map<string, TikiPairRow>>(new Map());
  const [omisi, setOmisi] = useState<TikiOmisi | null>(null);
  const [zone, setZone] = useState<ZoneBalti>({ intre: new Set(), edinet: new Set(), briceni: new Set(), ocnita: new Set(), nord: new Set() });
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(40);
  const [open, setOpen] = useState<Set<Zona>>(new Set());
  const [sort, setSort] = useState<{ col: Col; dir: 'asc' | 'desc' }>({ col: 'tickets', dir: 'desc' });
  const yoyRange = useMemo(() => sameRangeLastYear(filters), [filters]);

  useEffect(() => {
    let alive = true;
    getTikiZoneBalti().then(r => {
      if (!alive || !r.data) return;
      const d = r.data;
      setZone({ intre: new Set(d.intre), edinet: new Set(d.edinet), briceni: new Set(d.briceni), ocnita: new Set(d.ocnita), nord: new Set(d.nord) });
    });
    return () => { alive = false; };
  }, []);

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
  const needle = q.trim().toLowerCase();
  const table = useMemo<Item[]>(() => {
    if (!rows) return [];
    // perechile pe care le au doar ceilalți (nicio vânzare TIKI) apar și ele, cu 0 bilete
    const tikiKeys = new Set(rows.map(r => pairNorm(r.pair)));
    const onlyCounted: TikiPairRow[] = (omisi?.perechi ?? [])
      .filter(p => !tikiKeys.has(p.cheie))
      .map(p => ({ pair: `${p.de_la} - ${p.pana_la}`, tickets: 0, lei: 0, tur: 0, retur: 0, fara_sens: 0, statii: 0, dedus: 0 }));
    const all = [...rows, ...onlyCounted];
    const enrich = (r: TikiPairRow, yoyTickets: number | null, isNew: boolean, om: { oameni: number; tur: number | null; retur: number | null } | null): Enriched => ({
      ...r,
      sh: share(r.tickets, total),
      avg: r.tickets ? r.lei / r.tickets : null,
      turPct: share(r.tur, r.tur + r.retur),
      yoyPct: yoy.size ? pctChange(r.tickets, yoyTickets) : null,
      isNew,
      omisi: omisi ? (om?.oameni ?? 0) : null,
      omisiTur: omisi ? (om?.tur ?? 0) : null,
      omisiRetur: omisi ? (om?.retur ?? 0) : null,
    });
    const one = (r: TikiPairRow): Enriched => {
      const om = omisiMap.get(pairNorm(r.pair)) ?? null;
      return enrich(r, yoy.get(r.pair)?.tickets ?? null, yoy.size > 0 && !yoy.has(r.pair), om);
    };
    const matches = (pair: string) => !needle || pair.toLowerCase().includes(needle);
    const items: Item[] = [];
    for (const zona of ZONE) {
      const inGroup = all.filter(r => zonaPerechii(r.pair, zone) === zona);
      const shown = matches(GRUP[zona]) ? inGroup : inGroup.filter(r => matches(r.pair));
      if (!shown.length) continue;
      // la căutare grupul se însumează doar din localitățile rămase pe ecran, ca Totalul «(căutarea)» să bată
      const yoyMembers = shown.filter(r => yoy.has(r.pair));
      const yoyTickets = yoyMembers.reduce((s, r) => s + (yoy.get(r.pair)?.tickets ?? 0), 0);
      const oms = shown.map(r => omisiMap.get(pairNorm(r.pair))).filter((p): p is NonNullable<typeof p> => !!p);
      const om = oms.length
        ? { oameni: oms.reduce((s, p) => s + p.oameni, 0), tur: oms.reduce((s, p) => s + (p.tur ?? 0), 0), retur: oms.reduce((s, p) => s + (p.retur ?? 0), 0) }
        : null;
      const row = enrich(sumPairs(shown, GRUP[zona]), yoyMembers.length ? yoyTickets : null, yoy.size > 0 && !yoyMembers.length, om);
      items.push({ row, zona, members: shown.map(one) });
    }
    for (const r of all) if (zonaPerechii(r.pair, zone) === null && matches(r.pair)) items.push({ row: one(r) });
    const get = (r: Enriched) => {
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
    return sortRows(items, it => get(it.row), sort.dir)
      .map(it => (it.members ? { ...it, members: sortRows(it.members, get, sort.dir) } : it));
  }, [rows, yoy, needle, sort, total, omisi, omisiMap, zone]);

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
  const cells = (r: Enriched) => (
    <>
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
    </>
  );
  const sum = (f: (r: Enriched) => number | null | undefined) => table.reduce((a, it) => a + (f(it.row) ?? 0), 0);

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
        Grupurile: «{GRUP.intre}» = stațiile dintre Chișinău și Bălți (Orhei, Sîngerei, Prepelița…); «{GRUP.edinet}» = de la Edineț
        (inclusiv) până la Bălți (exclusiv: Cupcini, Rîșcani, Recea, Corlăteni…); dincolo de Edineț, pe raioane: «{GRUP.briceni}»
        (Briceni, Lipcani, Criva, Corjeuți…), «{GRUP.ocnita}» (Ocnița, Otaci, Bîrlădeni…), «{GRUP.nord}» = satele din raioanele Edineț și Rîșcani
        de pe ramura Lipcani – Rîșcani (Bădragii, Brînzeni, Văratic, Corpaci…). Click pe rând deschide localitățile. «vs an trecut» compară cu {fmtDate(yoyRange.from)} – {fmtDate(yoyRange.to)}. Pentru biletele de dinainte de feb. 2026
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
              {table.slice(0, limit).map((it, i) => {
                const expanded = !!it.zona && (open.has(it.zona) || !!needle);
                const toggle = () => it.zona && setOpen(o => { const n = new Set(o); if (n.has(it.zona!)) n.delete(it.zona!); else n.add(it.zona!); return n; });
                return it.members ? (
                <Fragment key={it.row.pair}>
                  <tr onClick={toggle} style={{ cursor: 'pointer', background: 'rgba(155,27,48,0.04)' }}
                    title={expanded ? 'Închide localitățile' : 'Deschide localitățile'}>
                    <td style={{ textAlign: 'right', color: '#999' }}>{i + 1}</td>
                    <td style={{ textAlign: 'left', fontWeight: 600 }}>
                      <span style={{ display: 'inline-block', width: 14, color: '#9B1B30' }}>{expanded ? '▾' : '▸'}</span>
                      {it.row.pair}
                      <div style={{ fontSize: 12, color: '#777', fontWeight: 400, marginLeft: 14 }}>
                        {it.members.length} {it.members.length === 1 ? 'localitate' : 'localități'}
                      </div>
                    </td>
                    {cells(it.row)}
                  </tr>
                  {expanded && it.members.map(m => (
                    <tr key={m.pair} style={{ background: 'rgba(0,0,0,0.015)' }}>
                      <td />
                      <td style={{ textAlign: 'left', paddingLeft: 28, fontSize: 13 }}>{m.pair}</td>
                      {cells(m)}
                    </tr>
                  ))}
                </Fragment>
              ) : (
                <tr key={it.row.pair}>
                  <td style={{ textAlign: 'right', color: '#999' }}>{i + 1}</td>
                  <td style={{ textAlign: 'left', fontWeight: 600 }}>{it.row.pair}</td>
                  {cells(it.row)}
                </tr>
              ); })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 600, borderTop: '2px solid rgba(0,0,0,0.15)' }}>
                <td />
                <td style={{ textAlign: 'left' }}>Total{needle ? ' (căutarea)' : ''}</td>
                <td style={{ textAlign: 'right' }}>{fmtInt(sum(r => r.tickets))}</td>
                <td />
                <td />
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtLei(sum(r => r.lei))}</td>
                <td />
                <td style={{ textAlign: 'left', whiteSpace: 'nowrap', fontSize: 12 }}>
                  {fmtInt(sum(r => r.tur))} / {fmtInt(sum(r => r.retur))}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: '#eb6834' }}>
                  {omisi ? <>
                    {fmtInt(Math.round(sum(r => r.omisi)))}
                    <div style={{ fontSize: 12, color: '#555', fontWeight: 400 }}>
                      {fmtInt(Math.round(sum(r => r.omisiTur)))} / {fmtInt(Math.round(sum(r => r.omisiRetur)))}
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
