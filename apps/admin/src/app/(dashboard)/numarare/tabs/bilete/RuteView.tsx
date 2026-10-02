'use client';

// «Rute» (ION-167). Ion, 01.10: «fă un raport cu numărul de rute și media oameni transportați pe fiecare zi și analiza pe
// ce clienți în mare parte se ține ruta»; 02.10: «nu am nevoie pe coridor, am nevoie pe fiecare grafic în parte și tipul de
// clienți pe care se ține exact pe fiecare grafic». Un card pe rută: graficul biletelor TIKI pe lună (anul acesta față de
// anul trecut) și, sub el, clienții pe care se ține ruta în perioada aleasă. Clic pe card: toate perechile.

import { useEffect, useMemo, useState } from 'react';
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
import { Notice, fmtInt, fmtPct, nf1 } from './ui';

const ora = (t: string | null) => (t ? t.split(' - ')[0] : '');
const mLabel = (m: string) => `${MONTHS_RO[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;

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
            <td style={{ textAlign: 'right' }}>{r.tikiZi == null ? '—' : nf1.format(r.tikiZi)}</td>
            <td style={{ textAlign: 'right' }}>{r.oameniZi == null ? '—' : nf1.format(r.oameniZi)}</td>
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

  const carduri = useMemo(() => {
    const list = (rows ?? []).map(rutaRand);
    return list.sort((a, b) => (b.oameniZi ?? -1) - (a.oameniZi ?? -1) || (b.tikiZi ?? 0) - (a.tikiZi ?? 0));
  }, [rows]);
  const s = useMemo(() => ruteSumar(carduri), [carduri]);
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
            Graficul: biletele TIKI pe lună, anul acesta față de anul trecut. Sub grafic: pe ce clienți se ține ruta în {perioadaLabel(per)} —
            oameni pe zi (cu bilet TIKI și fără, din Numărare) pe tip de bilet. Rutele numărate în mai puțin de {PRAG_NUMARATA * 100}% din
            zile arată clienții doar din biletele TIKI. Clic pe card pentru toate perechile.
          </Notice>
          <div style={{ marginBottom: 8 }}><YearLegend /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
            {carduri.map(r => {
              const g = seriiRuta(lunar, r.r.route, lastMonth);
              const deschis = open === r.r.route;
              return (
                <div key={r.r.route} className="card" style={{ padding: '12px 14px', gridColumn: deschis ? '1 / -1' : undefined }}>
                  <div onClick={() => setOpen(o => (o === r.r.route ? null : r.r.route))} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <div>
                        <b style={{ color: '#9B1B30', fontSize: 15 }}>{capatNord(r.r.de_la, r.r.pana_la)}</b>
                        <div style={{ fontSize: 11, color: '#999' }}>{ora(r.r.time_nord)} spre Chișinău · {ora(r.r.time_chisinau)} din Chișinău</div>
                      </div>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{r.oameniZi == null ? (r.tikiZi == null ? '—' : nf1.format(r.tikiZi)) : nf1.format(r.oameniZi)}</div>
                        <div style={{ fontSize: 11, color: '#777' }}>{r.oameniZi == null ? 'bilete TIKI pe zi' : 'oameni pe zi'}</div>
                      </div>
                    </div>
                    <YearLines labels={g.months.map(mLabel)} cur={g.cur} prev={g.prev} height={110}
                      note={i => (g.oameniZi[i] == null ? null : `oameni pe zi (cu și fără bilet): ${nf1.format(g.oameniZi[i]!)}`)} />
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      <div style={{ color: '#777', marginBottom: 2 }}>
                        Se ține pe{r.topDoarTiki ? ' (doar bilete TIKI — ruta e puțin numărată)' : ''}:
                      </div>
                      {r.top.length === 0 ? <span style={{ color: '#999' }}>—</span> : r.top.map((p, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span>{p.nume}</span>
                          <span style={{ color: '#555', whiteSpace: 'nowrap' }}>{nf1.format(p.oameniZi)}/zi · <b>{p.pct.toFixed(0)}%</b></span>
                        </div>
                      ))}
                      <div style={{ color: '#999', marginTop: 4 }}>
                        {fmtInt(r.r.zile_circulate)} zile circulate · {fmtInt(r.r.zile_numarate)} numărate complet
                        {r.faraZi != null && <> · {nf1.format(r.tikiZi!)} cu bilet + {nf1.format(r.faraZi)} fără, pe zi</>}
                      </div>
                    </div>
                  </div>
                  {deschis && <div style={{ marginTop: 10 }}><Perechi p={perechi} /></div>}
                </div>
              );
            })}
          </div>
          {carduri.length === 0 && <div style={{ padding: 20, color: '#999' }}>Nicio rută în perioada aleasă.</div>}
        </>
      )}
    </div>
  );
}
