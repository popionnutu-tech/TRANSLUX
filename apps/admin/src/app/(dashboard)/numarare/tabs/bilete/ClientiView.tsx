'use client';

// «Cine merge pe rută» (ION-159): doar interurban, din 28.03.2026, strict TIKI + Numărare. «Pe ce se ține ruta» =
// ponderea TIKI față de ceilalți în drumul făcut (om × km), niciodată în oameni (oamenii numărați sunt un minim).
// Perechile celorlalți nu se afișează — nu se știu; arătăm doar unde urcă / coboară în net.

import { Fragment, useEffect, useMemo, useState } from 'react';
import { getTikiCalitate, getTikiClienti, getTikiOrar } from '../biletAparatActions';
import type { ClientiRoute, Filters, Leg, OrarRoute, TikiCalitate, TikiClienti } from './types';
import { addDays, daysInclusive, fmtDate, median } from './periods';
import {
  LEG_LABEL, legTime, othersShare, fmtRangePct, enoughData, legSegments, netMarks, dayCell, MIN_ELIGIBILE,
} from './analiza';
import {
  DayBars, HatchSwatch, RouteShareBar, SegmentStep, seqCell, OTHERS_RGB, type DayBar, type StepPanel,
} from './charts';
import { CertaintyLegend, Kpi, Notice, Pill, QualityLine, fmtInt, nf1, tableWrap } from './ui';

export const CLIENTI_FROM = '2026-03-28';
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const LEGS: Leg[] = ['nord_chisinau', 'chisinau_nord'];
const isoDow = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
const isCity = (s: string) => !/^(intersec|petrom|vama)/i.test(s.trim());

export default function ClientiView({ filters, routeId, onRouteChange }: {
  filters: Filters; routeId: number | null; onRouteChange: (id: number | null) => void;
}) {
  const from = filters.from < CLIENTI_FROM ? CLIENTI_FROM : filters.from;
  const to = filters.to;
  const [list, setList] = useState<ClientiRoute[] | null>(null);
  const [times, setTimes] = useState<Map<number, OrarRoute>>(new Map());
  const [q, setQ] = useState<TikiCalitate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coridor, setCoridor] = useState('');

  useEffect(() => {
    if (from > to) return;
    let alive = true;
    setList(null); setError(null);
    Promise.all([getTikiClienti(from, to), getTikiOrar(from, to), getTikiCalitate(from, to)]).then(([c, o, k]) => {
      if (!alive) return;
      if (c.error) { setError(c.error); return; }
      setList(c.data!.rute);
      setTimes(new Map((o.data ?? []).map(r => [r.route_id, r])));
      setQ(k.data ?? null);
    });
    return () => { alive = false; };
  }, [from, to]);

  const rows = useMemo(() => (list ?? []).map(r => {
    const share = enoughData(r) ? othersShare(r) : null;
    const e = r.picioare_eligibile || 1;
    return {
      ...r, share,
      perDep: (r.om_km_numarat ?? 0) / e,
      tikiMinDep: (r.om_km_tiki_min ?? 0) / e,
      tikiMaxDep: (r.om_km_tiki_max ?? 0) / e,
      tikiPeople: (r.oameni_tiki ?? 0) / e,
      othersPeople: Math.max(0, (r.oameni_numarati ?? 0) - (r.oameni_tiki ?? 0)) / e,
    };
  }), [list]);

  const corridors = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) m.set(r.coridor, [...(m.get(r.coridor) ?? []), r]);
    return [...m.entries()].map(([name, rs]) => ({
      name,
      routes: [...rs].sort((a, b) => {
        if (!!a.share !== !!b.share) return a.share ? -1 : 1;     // «puține date» la sfârșit
        return (b.share?.max ?? 0) - (a.share?.max ?? 0);
      }),
      omKm: rs.reduce((s, r) => s + (r.om_km_numarat ?? 0), 0),
    })).sort((a, b) => b.omKm - a.omKm);
  }, [rows]);

  const barMax = useMemo(() => Math.max(1, ...rows.filter(r => r.share).map(r => r.perDep)), [rows]);

  const net = useMemo(() => {
    const ok = rows.filter(r => enoughData(r));
    const tot = ok.reduce((s, r) => s + (r.om_km_numarat ?? 0), 0);
    return {
      tiki: rows.reduce((s, r) => s + (r.oameni_tiki ?? 0), 0),
      others: rows.reduce((s, r) => s + Math.max(0, (r.oameni_numarati ?? 0) - (r.oameni_tiki ?? 0)), 0),
      share: othersShare({
        om_km_numarat: tot,
        om_km_tiki_min: ok.reduce((s, r) => s + (r.om_km_tiki_min ?? 0), 0),
        om_km_tiki_max: ok.reduce((s, r) => s + (r.om_km_tiki_max ?? 0), 0),
      }),
      eligibile: rows.reduce((s, r) => s + r.picioare_eligibile, 0),
      numarate: rows.reduce((s, r) => s + r.picioare_numarate, 0),
      plecari: rows.reduce((s, r) => s + r.plecari, 0),
      neconc: rows.reduce((s, r) => s + r.neconcordante, 0),
    };
  }, [rows]);

  const routeTimes = (id: number) => {
    const o = times.get(id);
    if (!o) return '';
    return [legTime(o, 'nord_chisinau'), legTime(o, 'chisinau_nord')].filter(Boolean).join(' / ');
  };

  const shown = coridor ? corridors.filter(c => c.name === coridor) : corridors;

  return (
    <div>
      <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>
        Drum făcut = oameni × km parcurși; un om dus 100 km cântărește cât 10 oameni duși 10 km.
      </div>
      <QualityLine q={q} />
      <CertaintyLegend hatch={<HatchSwatch />} />

      {from > to && <Notice tone="info">Numărarea pe rute începe la {fmtDate(CLIENTI_FROM)}. Alege o perioadă de după această zi.</Notice>}
      {filters.from < CLIENTI_FROM && from <= to && (
        <div style={{ fontSize: 12, color: '#8a5a00', marginBottom: 6 }}>Numărarea începe la {fmtDate(CLIENTI_FROM)}: perioada se ia de acolo.</div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {from <= to && !list && !error && <div style={{ padding: 20, color: '#999' }}>Se încarcă…</div>}

      {list && (
        <>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
            Numărate {fmtInt(net.eligibile)} din {fmtInt(net.numarate)} plecări cu numărare
            {' '}(în grafic: {fmtInt(net.plecari)}) · celelalte nu intră în cifre
            {net.neconc > 0 && <> · <b>!</b> {fmtInt(net.neconc)} plecări cu mai multe bilete TIKI decât oameni numărați</>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Kpi title="Oameni cu bilet TIKI" value={fmtInt(net.tiki)} sub="pe plecările numărate" />
            <Kpi title="Ceilalți, cel puțin" value={fmtInt(net.others)} sub="cine urcă și coboară la aceeași stație nu se vede" />
            <Kpi title="Ceilalți din drumul făcut" value={fmtRangePct(net.share)} sub={`rutele cu cel puțin ${MIN_ELIGIBILE} plecări numărate`} />
          </div>

          {corridors.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <Pill active={!coridor} onClick={() => setCoridor('')}>Toate coridoarele</Pill>
              {corridors.map(c => <Pill key={c.name} active={coridor === c.name} onClick={() => setCoridor(c.name)}>{c.name}</Pill>)}
            </div>
          )}

          <div className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Pe ce se ține ruta</div>
            <div style={{ fontSize: 12, color: '#777', marginBottom: 8 }}>
              Bara = drum făcut pe o plecare, aceeași scară pe toate rutele. Rutele cu mai mulți ceilalți sus. Clic pe rută pentru detalii.
            </div>
            <div style={tableWrap}>
              <table style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Rută</th>
                    <th style={{ textAlign: 'left' }}>Drum făcut pe plecare</th>
                    <th style={{ textAlign: 'right' }}>Ceilalți din drum</th>
                    <th style={{ textAlign: 'right' }} title="Oameni pe plecare">TIKI pe plecare</th>
                    <th style={{ textAlign: 'right' }} title="Oameni pe plecare; cine urcă și coboară la aceeași stație nu se vede în numărare">Ceilalți pe plecare (cel puțin)</th>
                    <th style={{ textAlign: 'right' }}>Numărată</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(c => (
                    <Fragment key={c.name}>
                      <tr><td colSpan={6} style={{ textAlign: 'left', fontWeight: 700, background: 'rgba(0,0,0,0.025)' }}>{c.name}</td></tr>
                      {c.routes.map(r => {
                        const open = routeId === r.route_id;
                        return (
                          <Fragment key={r.route_id}>
                            <tr onClick={() => onRouteChange(open ? null : r.route_id)}
                              style={{ cursor: 'pointer', background: open ? 'rgba(42,120,214,0.06)' : undefined }}>
                              <td style={{ textAlign: 'left' }}>
                                <span style={{ color: '#999', marginRight: 4 }}>{open ? '▾' : '▸'}</span>
                                <b>{r.nume}</b> <span style={{ color: '#777' }}>{routeTimes(r.route_id)}</span>
                              </td>
                              <td style={{ textAlign: 'left' }}>
                                {r.share
                                  ? <RouteShareBar total={r.perDep} tikiMin={r.tikiMinDep} tikiMax={r.tikiMaxDep} max={barMax}
                                      title={`Drum făcut pe plecare: ${fmtInt(r.perDep)} om × km; TIKI ${fmtRange(r.tikiMinDep, r.tikiMaxDep)}; ceilalți ${fmtRange(r.perDep - r.tikiMaxDep, r.perDep - r.tikiMinDep)}`} />
                                  : <span style={{ fontSize: 12, color: '#999' }}>puține date</span>}
                              </td>
                              <td style={{ textAlign: 'right' }}>{r.share ? fmtRangePct(r.share) : '—'}</td>
                              <td style={{ textAlign: 'right' }}>{r.picioare_eligibile ? nf1.format(r.tikiPeople) : '—'}</td>
                              <td style={{ textAlign: 'right' }}>{r.picioare_eligibile ? nf1.format(r.othersPeople) : '—'}</td>
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                                title={`Plecări în grafic: ${fmtInt(r.plecari)}${r.neconcordante ? `; ${r.neconcordante} cu mai multe bilete TIKI decât oameni numărați` : ''}`}>
                                {r.picioare_eligibile} din {r.picioare_numarate}
                                {r.neconcordante > 0 && <b style={{ color: '#555' }}> !{r.neconcordante}</b>}
                              </td>
                            </tr>
                            {open && (
                              <tr><td colSpan={6} style={{ textAlign: 'left', padding: '10px 6px 16px' }}>
                                <RouteDetail routeId={r.route_id} route={r} times={times.get(r.route_id) ?? null} from={from} to={to} />
                              </td></tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  ))}
                  {!rows.length && <tr><td colSpan={6} className="text-center text-muted">Nu există numărare în perioada aleasă.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const fmtRange = (a: number, b: number) => {
  const x = Math.round(Math.max(0, a)), y = Math.round(Math.max(0, b));
  return x === y ? fmtInt(x) : `${fmtInt(Math.min(x, y))}–${fmtInt(Math.max(x, y))}`;
};

type LegPick = 'ambele' | Leg;

function RouteDetail({ routeId, route, times, from, to }: {
  routeId: number; route: ClientiRoute; times: OrarRoute | null; from: string; to: string;
}) {
  const [data, setData] = useState<TikiClienti | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<LegPick>('ambele');

  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    getTikiClienti(from, to, routeId).then(r => {
      if (!alive) return;
      if (r.error) setError(r.error); else setData(r.data!);
    });
    return () => { alive = false; };
  }, [routeId, from, to]);

  const steps = useMemo(() => {
    const tr = data?.tronsoane ?? [];
    const segs = LEGS.map(l => legSegments(tr, l));
    const length = Math.max(1, ...segs.flat().map(s => s.km1));
    const maxY = Math.max(1, ...segs.flat().map(s => Math.max(s.numarat, s.tikiMax)));
    const panels: StepPanel[] = LEGS.map((leg, li) => {
      const ss = segs[li];
      if (!ss.length) return null;
      const L = Math.max(...ss.map(s => s.km1));
      // nordul la stânga în ambele picioare: Chișinău → Nord se oglindește
      const gx = (km: number) => (leg === 'nord_chisinau' ? km : L - km) + (length - L) * (leg === 'nord_chisinau' ? 0 : 1);
      const stops = [...ss.map(s => ({ name: s.from, km: s.km0 })), { name: ss[ss.length - 1].to, km: ss[ss.length - 1].km1 }];
      const zile = Math.max(...ss.map(s => s.zile));
      const t = times ? legTime(times, leg) : null;
      return {
        title: `${LEG_LABEL[leg]}${t ? ` · ${t}` : ''} — media pe plecare, din ${zile} zile`,
        segs: ss.map(s => {
          const lo = Math.max(0, s.numarat - s.tikiMax), hi = Math.max(0, s.numarat - s.tikiMin);
          return {
            x0: Math.min(gx(s.km0), gx(s.km1)), x1: Math.max(gx(s.km0), gx(s.km1)),
            numarat: s.numarat, tikiMin: s.tikiMin, tikiMax: s.tikiMax,
            lines: [
              `${s.from} → ${s.to} (${nf1.format(s.km1 - s.km0)} km)`,
              `numărați la bord: ${nf1.format(s.numarat)}`,
              `TIKI: ${s.tikiMin === s.tikiMax ? nf1.format(s.tikiMin) : `${nf1.format(s.tikiMin)}–${nf1.format(s.tikiMax)}`}`,
              Math.max(s.tikiMin, s.tikiMax) > s.numarat
                ? '! mai mulți TIKI decât numărați'
                : `ceilalți: ${lo === hi ? nf1.format(lo) : `${nf1.format(lo)}–${nf1.format(hi)}`}`,
            ],
          };
        }),
        ticks: stops.filter((s, i) => i === 0 || i === stops.length - 1 || isCity(s.name)).map(s => ({ x: gx(s.km), label: s.name })),
        marks: netMarks(ss).map(m => ({ x: gx(m.km), up: m.delta > 0, value: m.delta })),
      };
    }).filter((p): p is StepPanel => !!p);
    return { panels, length, maxY };
  }, [data, times]);

  const days = useMemo(() => {
    const zile = data?.zile ?? [];
    const legs = pick === 'ambele' ? LEGS : [pick];
    const n = daysInclusive({ from, to });
    const out: (DayBar & { numarati: number | null })[] = [];
    for (let i = 0; i < n; i++) {
      const d = addDays(from, i);
      const rs = zile.filter(z => z.zi === d && legs.includes(z.leg));
      const c = dayCell(rs);
      const label = `${d.slice(8, 10)}.${d.slice(5, 7)}`;
      out.push({
        key: d, label, tiki: c.tiki, others: c.others, state: c.state, numarati: c.numarati,
        lines: [
          `${fmtDate(d)} · ${DOW[isoDow(d)]}`,
          c.state === 'fara' ? 'fără date în această zi' : `TIKI: ${fmtInt(c.tiki)} oameni`,
          ...(c.state === 'ok' ? [`ceilalți: cel puțin ${fmtInt(c.others)}`] : []),
          ...(c.state === 'necunoscut' ? ['? zi fără numărare completă — ceilalți nu se știu'] : []),
          ...(c.state === 'neconcordanta' ? [`! mai mulți TIKI decât oameni numărați (${fmtInt(c.numarati)})`, `ceilalți: cel puțin ${fmtInt(c.others)}`] : []),
        ],
      });
    }
    return out;
  }, [data, pick, from, to]);

  // ceilalți pe plecare, pe zilele săptămânii (mediana pe picioarele numărate)
  const dowOthers = useMemo(() => {
    const legs = pick === 'ambele' ? LEGS : [pick];
    const by: number[][] = [[], [], [], [], [], [], []];
    for (const z of data?.zile ?? []) {
      if (!z.eligibil || !legs.includes(z.leg)) continue;
      by[isoDow(z.zi)].push(Math.max(0, z.oameni_numarati - z.oameni_tiki));
    }
    return by.map(v => (v.length ? median(v) : null));
  }, [data, pick]);
  const dowMax = Math.max(1, ...dowOthers.filter((v): v is number => v != null));

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <div style={{ padding: 12, color: '#999' }}>Se încarcă ruta…</div>;

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>Unde urcă și coboară ceilalți (în net — nu știm cine unde merge)</div>
      <div style={{ fontSize: 12, color: '#777', marginBottom: 6 }}>
        Albastru = oameni cu bilet TIKI la bord, portocaliu = ceilalți, linia = toți cei numărați. ▲ aici urcă ceilalți, ▼ aici coboară.
        Nordul la stânga, Chișinăul la dreapta, în ambele sensuri.
      </div>
      {steps.panels.length
        ? <SegmentStep panels={steps.panels} length={steps.length} maxY={steps.maxY} />
        : <div style={{ fontSize: 13, color: '#999', marginBottom: 10 }}>Nu sunt tronsoane numărate pe această rută în perioadă.</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '12px 0 4px' }}>
        <div style={{ fontWeight: 600 }}>Oameni pe zi</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['ambele', ...LEGS] as LegPick[]).map(p => (
            <button key={p} className="btn" onClick={() => setPick(p)}
              style={{ padding: '3px 9px', fontSize: 12, ...(pick === p ? { background: 'var(--primary-dim)' } : {}) }}>
              {p === 'ambele' ? 'Ambele sensuri' : LEG_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      <DayBars data={days} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: '#555', margin: '6px 0 10px' }}>
        <span>Ceilalți pe plecare, după ziua săptămânii (mediana, cel puțin):</span>
        <span style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(7, 30px)', gap: 2 }}>
          {DOW.map((d, i) => (
            <span key={i} title={dowOthers[i] == null ? 'fără zile numărate' : `${nf1.format(dowOthers[i]!)} oameni pe plecare`}
              style={{ ...seqCell(dowOthers[i], dowMax, OTHERS_RGB), textAlign: 'center', borderRadius: 3, lineHeight: '18px', fontSize: 11 }}>
              {d} {dowOthers[i] == null ? '—' : Math.round(dowOthers[i]!)}
            </span>
          ))}
        </span>
      </div>

      <details>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: '#555' }}>Tabelul zilelor</summary>
        <div style={tableWrap}>
          <table style={{ width: '100%', fontSize: 12, marginTop: 6 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Zi</th>
                <th style={{ textAlign: 'left' }}>Sens</th>
                <th style={{ textAlign: 'right' }}>TIKI</th>
                <th style={{ textAlign: 'right' }}>Numărați (cel puțin)</th>
                <th style={{ textAlign: 'right' }}>Ceilalți (cel puțin)</th>
                <th style={{ textAlign: 'right' }}>Drum făcut (om × km)</th>
                <th style={{ textAlign: 'right' }}>TIKI din drum</th>
              </tr>
            </thead>
            <tbody>
              {(data.zile ?? []).map(z => (
                <tr key={`${z.zi}-${z.leg}`}>
                  <td style={{ textAlign: 'left' }}>{fmtDate(z.zi)} {DOW[isoDow(z.zi)]}</td>
                  <td style={{ textAlign: 'left' }}>{LEG_LABEL[z.leg]}</td>
                  <td style={{ textAlign: 'right' }}>{fmtInt(z.oameni_tiki)}</td>
                  {z.eligibil ? (
                    <>
                      <td style={{ textAlign: 'right' }}>{fmtInt(z.oameni_numarati)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {z.oameni_tiki > z.oameni_numarati ? <span title="Mai mulți TIKI decât oameni numărați">0 <b>!</b></span> : fmtInt(z.oameni_numarati - z.oameni_tiki)}
                      </td>
                      <td style={{ textAlign: 'right' }}>{fmtInt(z.om_km)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {z.om_km > 0
                          ? fmtRangePct({ min: (z.om_km_tiki_min / z.om_km) * 100, max: (z.om_km_tiki_max / z.om_km) * 100 })
                          : '—'}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} style={{ textAlign: 'center', color: '#999' }} title="Piciorul nu e numărat complet sau cu altă mașină">? fără numărare</td>
                  )}
                </tr>
              ))}
              {!(data.zile ?? []).length && <tr><td colSpan={7} className="text-center text-muted">Nu există date.</td></tr>}
            </tbody>
          </table>
        </div>
      </details>
      {route.picioare_eligibile < MIN_ELIGIBILE && (
        <div style={{ fontSize: 12, color: '#8a5a00', marginTop: 6 }}>Puține date: doar {route.picioare_eligibile} plecări numărate complet.</div>
      )}
    </div>
  );
}
