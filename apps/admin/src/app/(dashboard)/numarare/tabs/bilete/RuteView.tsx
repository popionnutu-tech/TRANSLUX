'use client';

// «Rute» (ION-167). Ion, 01.10: «fă un raport cu numărul de rute și media oameni transportați pe fiecare zi și analiza pe
// ce clienți în mare parte se ține ruta»; 02.10: «nu am nevoie pe coridor, am nevoie pe fiecare grafic în parte și tipul de
// clienți pe care se ține exact pe fiecare grafic», «în formă de listă», «adaugă coloniță bilete mici» (drum fără Chișinău
// sau sub 50 lei, într-o coloană). Un rând pe rută: oameni pe zi, TIKI, fără bilet, bilete mici, graficul mic pe 12 luni și
// clienții pe care se ține; clic pe rând: graficul mare și toate perechile.

import { Fragment, useEffect, useMemo, useState } from 'react';
import { getTikiRute, getTikiRuteLunar, getTikiRutaPerechi } from '../biletAparatActions';
import type { TikiRuta, TikiRutaLuna, TikiRutaPerechi } from './types';
import type { DateRange } from './periods';
import { MONTHS_RO } from './periods';
import {
  capatNord, lastFullMonth, monthBounds, monthsDesc, rutaPerechiRanduri, rutaRand, ruteSumar, seriiRuta, PRAG_NUMARATA,
} from './raport';
import { LEG_LABEL } from './analiza';
import { YearLegend, YearLines } from './charts';
import PerioadaPicker, { perioadaLabel } from './PerioadaPicker';
import { Notice, fmtPct, nf1, tableWrap } from './ui';

const ora = (t: string | null) => (t ? t.split(' - ')[0] : '');
const mLabel = (m: string) => `${MONTHS_RO[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;
const zi = (n: number | null) => (n == null ? '—' : nf1.format(n));

function Perechi({ p }: { p: TikiRutaPerechi | null }) {
  if (!p) return <div style={{ padding: 10, color: '#999' }}>Se încarcă…</div>;
  const rows = rutaPerechiRanduri(p);
  return (
    <table style={{ width: '100%', fontSize: 12 }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>Pereche</th>
          <th style={{ textAlign: 'left' }}>Sens</th>
          <th style={{ textAlign: 'right' }}>Bilete TIKI pe zi</th>
          <th style={{ textAlign: 'right' }}>Oameni pe zi</th>
          <th style={{ textAlign: 'right' }}>Din oamenii rutei</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ textAlign: 'left' }}>{r.nume}</td>
            <td style={{ textAlign: 'left', color: '#777' }}>{r.leg === '?' ? '—' : LEG_LABEL[r.leg as keyof typeof LEG_LABEL]}</td>
            <td style={{ textAlign: 'right' }}>{zi(r.tikiZi)}</td>
            <td style={{ textAlign: 'right' }}>{zi(r.oameniZi)}</td>
            <td style={{ textAlign: 'right' }}>{fmtPct(r.pct, 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RuteView({ dateMin, dateMax }: { dateMin: string; dateMax: string }) {
  const months = useMemo(() => monthsDesc(dateMin, dateMax), [dateMin, dateMax]);
  const [per, setPer] = useState<DateRange>(monthBounds(lastFullMonth(dateMax)));
  const [rows, setRows] = useState<TikiRuta[] | null>(null);
  const [lunar, setLunar] = useState<TikiRutaLuna[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [perechi, setPerechi] = useState<TikiRutaPerechi | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null); setError(null); setOpen(null);
    Promise.all([getTikiRute(per.from, per.to), getTikiRuteLunar(per.to)]).then(([a, b]) => {
      if (!alive) return;
      if (a.error) { setError(a.error); return; }
      setRows(a.data!);
      setLunar(b.data ?? []);
    });
    return () => { alive = false; };
  }, [per]);

  useEffect(() => {
    if (open == null) return;
    let alive = true;
    setPerechi(null);
    getTikiRutaPerechi(per.from, per.to, open).then(r => { if (alive && r.data) setPerechi(r.data); });
    return () => { alive = false; };
  }, [open, per]);

  const lista = useMemo(() => {
    const list = (rows ?? []).map(rutaRand);
    return list.sort((a, b) => (b.oameniZi ?? -1) - (a.oameniZi ?? -1) || (b.tikiZi ?? 0) - (a.tikiZi ?? 0));
  }, [rows]);
  const s = useMemo(() => ruteSumar(lista), [lista]);
  const lastMonth = per.to.slice(0, 7);

  return (
    <div>
      <div className="card" style={{ padding: '10px 12px', marginBottom: 12 }}>
        <PerioadaPicker months={months} value={per} onChange={setPer} dateMin={dateMin} dateMax={dateMax} />
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {!rows && !error && <div style={{ padding: 20, color: '#999' }}>Se încarcă…</div>}
      {rows && (
        <>
          <div style={{ fontSize: 16, margin: '4px 0 10px' }}>
            În <b>{perioadaLabel(per)}</b> au circulat <b>{s.circulate}</b> rute.
            {s.oameniZi != null && <> Pe cele <b>{s.estimate}</b> numărate destul: în medie <b>{nf1.format(s.oameniZi)}</b> oameni pe zi pe rută
              ({nf1.format(s.tikiZi!)} cu bilet TIKI, {nf1.format(s.faraZi!)} fără).</>}
          </div>
          <Notice tone="info">
            <b>Oameni pe zi</b> = cu bilet TIKI + numărați fără bilet. <b>Bilete mici</b> = drum scurt fără Chișinău sau bilet sub 50 lei.
            Graficul: biletele TIKI pe lună, ultimele 12 luni (gri = anul trecut). <b>Se ține pe</b> = primele 3 tipuri de clienți.
            Rutele numărate în mai puțin de {PRAG_NUMARATA * 100}% din zile («puțin numărată») arată doar biletele TIKI.
            Clic pe rând: graficul mare și toate perechile.
          </Notice>
          <div className="card" style={{ padding: 0 }}>
            <div style={tableWrap}>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Ruta / ore</th>
                    <th style={{ textAlign: 'right' }}>Oameni pe zi</th>
                    <th style={{ textAlign: 'right' }}>TIKI pe zi</th>
                    <th style={{ textAlign: 'right' }}>Fără bilet pe zi</th>
                    <th style={{ textAlign: 'right' }}>Bilete mici pe zi</th>
                    <th style={{ textAlign: 'left', minWidth: 190 }}>Bilete pe lună</th>
                    <th style={{ textAlign: 'left' }}>Se ține pe (oameni pe zi · %)</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(r => {
                    const g = seriiRuta(lunar, r.r.route, lastMonth);
                    const deschis = open === r.r.route;
                    return (
                      <Fragment key={r.r.route}>
                        <tr onClick={() => setOpen(o => (o === r.r.route ? null : r.r.route))}
                          style={{ cursor: 'pointer', background: deschis ? 'rgba(155,27,48,0.04)' : undefined }}>
                          <td style={{ textAlign: 'left', verticalAlign: 'top' }}>
                            <b style={{ color: '#9B1B30' }}>{capatNord(r.r.de_la, r.r.pana_la)}</b>
                            <div style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap' }}>{ora(r.r.time_nord)} ↓ · {ora(r.r.time_chisinau)} ↑</div>
                            {!r.numarata && <div style={{ fontSize: 11, color: '#8a5a00' }}>⚠ puțin numărată</div>}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, verticalAlign: 'top' }}>{zi(r.oameniZi)}</td>
                          <td style={{ textAlign: 'right', verticalAlign: 'top' }}>{zi(r.tikiZi)}</td>
                          <td style={{ textAlign: 'right', verticalAlign: 'top' }}>{zi(r.faraZi)}</td>
                          <td style={{ textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            {zi(r.miciZi)}
                            {r.miciPct != null && <div style={{ fontSize: 11, color: '#777' }}>{r.miciPct.toFixed(0)}% din rută</div>}
                          </td>
                          <td style={{ verticalAlign: 'top', width: 200 }}>
                            <YearLines labels={g.months.map(mLabel)} cur={g.cur} prev={g.prev} height={56} />
                          </td>
                          <td style={{ textAlign: 'left', fontSize: 12, verticalAlign: 'top' }}>
                            {r.topDoarTiki && r.top.length > 0 && <div style={{ color: '#999' }}>doar bilete TIKI</div>}
                            {r.top.length === 0 ? <span style={{ color: '#999' }}>—</span> : r.top.map((p, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                                <span>{p.nume}</span>
                                <span style={{ color: '#555', whiteSpace: 'nowrap' }}>{nf1.format(p.oameniZi)}/zi · <b>{p.pct.toFixed(0)}%</b></span>
                              </div>
                            ))}
                          </td>
                        </tr>
                        {deschis && (
                          <tr>
                            <td colSpan={7} style={{ background: 'rgba(0,0,0,0.02)' }}>
                              <div style={{ margin: '4px 0 8px' }}><YearLegend /></div>
                              <YearLines labels={g.months.map(mLabel)} cur={g.cur} prev={g.prev} height={150}
                                note={i => (g.oameniZi[i] == null ? null : `oameni pe zi (cu și fără bilet): ${nf1.format(g.oameniZi[i]!)}`)} />
                              <div style={{ marginTop: 10 }}><Perechi p={perechi} /></div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {lista.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 20 }}>Nicio rută în perioada aleasă.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
