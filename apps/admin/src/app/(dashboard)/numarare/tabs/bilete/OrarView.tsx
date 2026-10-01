'use client';

// «Orar» (ION-159): ce curse tai / adaug / mut. Un rând = o rută din nomenclator cu ambele picioare, grupate pe
// coridor. Ziua = ziua cursei Mobilet. Față de anul trecut = totalul biletelor pe aceleași etichete TIKI, aceeași
// fereastră cu 364 de zile în urmă (fără numitor); bilete pe plecare și «cât de plin» fără comparație (din 04.2026).

import { Fragment, useEffect, useMemo, useState } from 'react';
import { getTikiCalitate, getTikiClienti, getTikiOrar } from '../biletAparatActions';
import type { Filters, OrarLeg, OrarRoute, TikiCalitate } from './types';
import { addDays, fmtDate, pctChange } from './periods';
import {
  LEG_LABEL, legTime, hourOf, perDeparture, weekGrid, othersShare, fmtRangePct, orarSignals, enoughData,
  type OthersShare, type Signal,
} from './analiza';
import { HatchSwatch, StemProfile, WeekSpark, seqCell, OTHERS } from './charts';
import { CertaintyLegend, Delta, Notice, Pill, QualityLine, fmtInt, fmtLei, nf1, tableWrap } from './ui';

const CLIENTI_FROM = '2026-03-28';
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DOW_LONG = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];

export default function OrarView({ filters, onOpenRoute }: { filters: Filters; onOpenRoute: (routeId: number) => void }) {
  const [rows, setRows] = useState<OrarRoute[] | null>(null);
  const [q, setQ] = useState<TikiCalitate | null>(null);
  const [others, setOthers] = useState<Map<number, OthersShare | null>>(new Map());
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [signalNote, setSignalNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coridor, setCoridor] = useState('');

  useEffect(() => {
    let alive = true;
    setRows(null); setError(null); setSignals(null); setSignalNote(null);
    const cFrom = filters.from < CLIENTI_FROM ? CLIENTI_FROM : filters.from;
    Promise.all([
      getTikiOrar(filters.from, filters.to),
      getTikiCalitate(filters.from, filters.to),
      cFrom <= filters.to ? getTikiClienti(cFrom, filters.to) : Promise.resolve({ data: undefined }),
    ]).then(async ([o, c, cl]) => {
      if (!alive) return;
      if (o.error) { setError(o.error); return; }
      setRows(o.data!);
      setQ(c.data ?? null);
      const oth = new Map<number, OthersShare | null>();
      for (const r of cl.data?.rute ?? []) oth.set(r.route_id, enoughData(r) ? othersShare(r) : null);
      setOthers(oth);
      // Semnalele se dau doar pe zilele deja sincronizate: fără ultimele 14 zile dinaintea ultimei zile.
      const last = c.data?.ultima_zi;
      const safeTo = last ? addDays(last, -14) : filters.to;
      if (safeTo < filters.from) {
        setSignals([]);
        setSignalNote('Toată perioada e în ultimele 14 zile — biletele încă se sincronizează, semnalele așteaptă.');
        return;
      }
      if (safeTo >= filters.to) { setSignals(orarSignals(o.data!, oth)); return; }
      const s = await getTikiOrar(filters.from, safeTo);
      if (!alive) return;
      setSignals(s.data ? orarSignals(s.data, oth) : []);
      setSignalNote(`Semnalele nu iau în calcul zilele după ${fmtDate(safeTo)} — biletele încă se sincronizează.`);
    });
    return () => { alive = false; };
  }, [filters.from, filters.to]);

  const corridors = useMemo(() => {
    const m = new Map<string, { name: string; routes: OrarRoute[]; bilete: number; lei: number }>();
    for (const r of rows ?? []) {
      const g = m.get(r.coridor) ?? { name: r.coridor, routes: [], bilete: 0, lei: 0 };
      g.routes.push(r);
      for (const l of r.picioare) { g.bilete += l.bilete; g.lei += l.lei; }
      m.set(r.coridor, g);
    }
    const list = [...m.values()].sort((a, b) => b.bilete - a.bilete);
    list.forEach(g => g.routes.sort((a, b) => (legTime(a, 'nord_chisinau') ?? '99').localeCompare(legTime(b, 'nord_chisinau') ?? '99')));
    return list;
  }, [rows]);

  // aceeași scară pe toată pagina: harta L–D și tijele
  const dowMax = useMemo(() => Math.max(1, ...(rows ?? []).flatMap(r => r.picioare.flatMap(l => Object.values(l.zile_sapt ?? {})))), [rows]);
  const stemMax = useMemo(() => Math.max(1, ...(rows ?? []).flatMap(r => r.picioare.map(l => perDeparture(l) ?? 0))), [rows]);
  const routeName = useMemo(() => new Map((rows ?? []).map(r => [r.route_id, r])), [rows]);

  const historyPending = (q?.coada ?? 0) > 0;
  const shown = coridor ? corridors.filter(c => c.name === coridor) : corridors;

  return (
    <div>
      <QualityLine q={q} />
      <CertaintyLegend types={false} hatch={<HatchSwatch />} />
      {error && <Notice tone="danger">{error}</Notice>}
      {!rows && !error && <div style={{ padding: 20, color: '#999' }}>Se încarcă…</div>}

      {rows && (
        <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>De decis</div>
          {signalNote && <div style={{ fontSize: 12, color: '#8a5a00', marginBottom: 6 }}>{signalNote}</div>}
          {!signals && <div style={{ fontSize: 13, color: '#999' }}>Se calculează…</div>}
          {signals && signals.length === 0 && (
            <div style={{ fontSize: 13, color: '#777' }}>Nimic ieșit din comun în perioada aleasă (etichetele comune nu dau semnal).</div>
          )}
          {signals && signals.length > 0 && (
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.5 }}>
              {signals.map(s => (
                <li key={`${s.route_id}-${s.leg}-${s.kind}`} style={{ marginBottom: 4 }}>
                  {s.text}{' '}
                  {s.others
                    ? <>Ceilalți: <b>{fmtRangePct(s.others)}</b> din drumul făcut{s.others.max >= 25 ? ' — înainte de tăiere ' : ' — '}</>
                    : <>Ceilalți: nu știm — </>}
                  <button className="btn" onClick={() => onOpenRoute(s.route_id)}
                    style={{ padding: '1px 8px', fontSize: 12 }}>vezi cine merge pe rută</button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {rows && corridors.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <Pill active={!coridor} onClick={() => setCoridor('')}>Toate coridoarele</Pill>
          {corridors.map(c => <Pill key={c.name} active={coridor === c.name} onClick={() => setCoridor(c.name)}>{c.name}</Pill>)}
        </div>
      )}

      {rows && rows.length === 0 && <Notice tone="info">Nu există rute interurbane active.</Notice>}

      {shown.map(c => (
        <div key={c.name} className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: '#777' }}>{c.routes.length} rute · {fmtInt(c.bilete)} bilete · {fmtLei(c.lei)}</div>
          </div>
          <div style={{ fontSize: 11, color: '#999', margin: '4px 0 0' }}>Ziua coridorului: o tijă pe plecare, la ora ei; înălțimea = bilete pe plecare.</div>
          <StemProfile max={stemMax} items={c.routes.flatMap(r => r.picioare.map(l => {
            const t = legTime(r, l.leg);
            const h = hourOf(t);
            if (h == null) return null;
            const pd = perDeparture(l);
            return {
              hour: h, up: l.leg === 'nord_chisinau', value: pd,
              lines: [`${r.nume} ${t}`, LEG_LABEL[l.leg], pd == null ? 'fără plecări' : `${nf1.format(pd)} bilete pe plecare`, `${fmtInt(l.plecari)} plecări`],
            };
          }).filter((x): x is NonNullable<typeof x> => !!x))} />

          <div style={tableWrap}>
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Rută</th>
                  <th style={{ textAlign: 'left' }}>Sens · pleacă</th>
                  <th style={{ textAlign: 'right' }}>Bilete</th>
                  <th style={{ textAlign: 'right' }}>Plecări</th>
                  <th style={{ textAlign: 'right' }} title="Biletele împărțite la plecări">Bilete pe plecare</th>
                  <th style={{ textAlign: 'right' }} title="Drumul făcut de pasagerii TIKI față de locuri × km. Ceilalți pasageri nu intră — e un minim.">Cât de plin (doar TIKI)</th>
                  <th style={{ textAlign: 'center' }} title="Mediana biletelor pe plecare, pe zilele săptămânii; aceeași scară pe toată pagina">L M M J V S D</th>
                  <th style={{ textAlign: 'center' }} title="Bilete pe săptămână, ultimele 52; gri = anul trecut">Ultimul an</th>
                  <th style={{ textAlign: 'right' }} title="Totalul biletelor pe aceleași etichete TIKI, aceeași perioadă acum 364 de zile">Față de anul trecut</th>
                  <th style={{ textAlign: 'right' }}>Lei pe plecare</th>
                </tr>
              </thead>
              <tbody>
                {c.routes.map(r => (
                  <Fragment key={r.route_id}>
                    {r.picioare.map((l, li) => (
                      <LegRow key={l.leg} r={r} l={l} first={li === 0} span={r.picioare.length}
                        dowMax={dowMax} to={filters.to} historyPending={historyPending}
                        others={others.get(r.route_id)} onOpenRoute={onOpenRoute} />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {rows && routeName.size > 0 && (
        <div style={{ fontSize: 12, color: '#999' }}>
          Plecările: din grafic (din 04.2026); înainte — doar zilele cu bilete. «Etichetă comună» = aceeași cursă TIKI vândută
          de mașinile a două rute: nu dă semnal pe o singură rută, comparați coridorul în «Față de anul trecut».
        </div>
      )}
    </div>
  );
}

function LegRow({ r, l, first, span, dowMax, to, historyPending, others, onOpenRoute }: {
  r: OrarRoute; l: OrarLeg; first: boolean; span: number; dowMax: number; to: string; historyPending: boolean;
  others: OthersShare | null | undefined; onOpenRoute: (id: number) => void;
}) {
  const pd = perDeparture(l);
  const grid = useMemo(() => weekGrid(l.saptamani, to), [l.saptamani, to]);
  const yoy = l.bilete_an_trecut ? pctChange(l.bilete, l.bilete_an_trecut) : null;
  const yoyNa = l.bilete_an_trecut
    ? undefined
    : historyPending
      ? 'Istoria anului trecut încă se pregătește'
      : l.bilete > 0 ? undefined : 'Fără bilete în ambele perioade';
  const isNew = !l.bilete_an_trecut && !historyPending && l.bilete > 0;
  const border = first ? { borderTop: '1px solid rgba(0,0,0,0.08)' } : {};
  return (
    <tr style={border}>
      {first && (
        <td rowSpan={span} style={{ textAlign: 'left', verticalAlign: 'top', minWidth: 150 }}>
          <div style={{ fontWeight: 600 }}>{r.nume}</div>
          {others !== undefined && (
            <button onClick={() => onOpenRoute(r.route_id)} title="Ceilalți pasageri (fără bilet TIKI) din drumul făcut — vezi «Cine merge pe rută»"
              style={{
                marginTop: 3, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#444', cursor: 'pointer',
                background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 999, padding: '1px 7px',
              }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: OTHERS }} />
              {others ? `+ceilalți ${fmtRangePct(others)}` : 'ceilalți: puține date'}
            </button>
          )}
        </td>
      )}
      <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
        <span style={{ color: '#777' }}>{LEG_LABEL[l.leg]}</span> <b>{legTime(r, l.leg) ?? '—'}</b>
        {l.eticheta_comuna && (
          <div style={{ fontSize: 11, color: '#999' }} title="Eticheta TIKI e vândută și de mașinile altei rute; fără semnal pe o singură rută">etichetă comună</div>
        )}
      </td>
      <td style={{ textAlign: 'right' }}>{fmtInt(l.bilete)}</td>
      <td style={{ textAlign: 'right' }} title={l.din_grafic ? 'Plecările din grafic' : 'Doar zilele cu bilete (fără grafic)'}>
        {fmtInt(l.plecari)}
        {l.plecari_fara_bilete > 0 && <div style={{ fontSize: 11, color: '#999' }}>{l.plecari_fara_bilete} fără bilete</div>}
        {!l.din_grafic && l.plecari > 0 && <div style={{ fontSize: 11, color: '#999' }}>zile cu bilete</div>}
      </td>
      <td style={{ textAlign: 'right' }} title={pd == null ? undefined : `Medie din ${fmtInt(l.plecari)} plecări`}>
        {pd == null ? '—' : nf1.format(pd)}
      </td>
      <td style={{ textAlign: 'right' }}
        title={l.plin_tiki == null ? 'Locurile mașinii nu se știu' : l.plin_tiki > 100 ? 'Peste 100 %: verifică locurile mașinii sau km piciorului' : 'Doar pasagerii TIKI — ceilalți nu intră'}>
        {l.plin_tiki == null ? <span style={{ color: '#bbb' }}>—</span> : <>{nf1.format(l.plin_tiki)} %{l.plin_tiki > 100 && <b style={{ color: '#555' }}> !</b>}</>}
      </td>
      <td style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(7, 26px)', gap: 2 }}>
          {DOW.map((d, i) => {
            const v = l.zile_sapt?.[String(i + 1)];
            return (
              <span key={i} title={v == null ? `${DOW_LONG[i]}: nu circulă` : `${DOW_LONG[i]}: ${nf1.format(v)} bilete pe plecare (mediana)`}
                style={{ ...seqCell(v, dowMax), fontSize: 11, lineHeight: '18px', borderRadius: 3, textAlign: 'center' }}>
                {v == null ? '—' : Math.round(v)}
              </span>
            );
          })}
        </div>
      </td>
      <td style={{ textAlign: 'center' }}>
        <WeekSpark weeks={grid.weeks} cur={grid.cur} prev={grid.prev} />
      </td>
      <td style={{ textAlign: 'right' }}>
        {isNew
          ? <span style={{ fontSize: 12, color: '#555' }} title="Eticheta nu avea bilete anul trecut în aceeași perioadă">nouă</span>
          : <Delta pct={yoy} na={yoyNa}
              title={l.bilete_an_trecut ? `Anul trecut: ${fmtInt(l.bilete_an_trecut)} bilete pe aceleași etichete` : undefined} />}
      </td>
      <td style={{ textAlign: 'right' }}>{l.plecari ? fmtLei(l.lei / l.plecari) : '—'}</td>
    </tr>
  );
}
