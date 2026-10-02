'use client';

// «Rute» (ION-167). Ion, 01.10: «fă un raport cu numărul de rute și media oameni transportați pe fiecare zi și analiza pe
// ce clienți în mare parte se ține ruta». TIKI pe zi pe toate zilele circulate; «fără bilet» pe zilele complet numărate
// (ambele sensuri numărate); «se ține pe» = primele 3 perechi din zilele complet numărate. Clic pe rută: toate perechile.

import { Fragment, useEffect, useMemo, useState } from 'react';
import { getTikiRute, getTikiRutaPerechi } from '../biletAparatActions';
import type { TikiRuta, TikiRutaPerechi } from './types';
import type { DateRange } from './periods';
import { capatNord, lastFullMonth, monthBounds, monthsDesc, rutaPerechiRanduri, rutaRand, ruteSumar, PRAG_NUMARATA } from './raport';
import { LEG_LABEL } from './analiza';
import PerioadaPicker, { perioadaLabel } from './PerioadaPicker';
import { Notice, fmtInt, fmtPct, nf1, tableWrap } from './ui';

const ora = (t: string | null) => (t ? t.split(' - ')[0] : '');

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
          <th style={{ textAlign: 'right' }}>Oameni pe zi (TIKI + fără bilet)</th>
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
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [perechi, setPerechi] = useState<TikiRutaPerechi | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null); setError(null); setOpen(null);
    getTikiRute(per.from, per.to).then(r => {
      if (!alive) return;
      if (r.error) setError(r.error); else setRows(r.data!);
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

  const table = useMemo(() => {
    const list = (rows ?? []).map(rutaRand);
    return list.sort((a, b) => (b.oameniZi ?? -1) - (a.oameniZi ?? -1) || (b.tikiZi ?? 0) - (a.tikiZi ?? 0));
  }, [rows]);
  const s = useMemo(() => ruteSumar(table), [table]);

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
            Bilete TIKI pe zi = pe toate zilele în care ruta a circulat. Fără bilet pe zi = oamenii numărați fără bilet TIKI, pe zilele
            în care ambele sensuri ale rutei au fost numărate. «Se ține pe» = primele 3 tipuri de bilet din oamenii rutei.
            Rutele numărate în mai puțin de {PRAG_NUMARATA * 100}% din zile nu au estimare. Clic pe rută pentru toate perechile.
          </Notice>
          <div className="card" style={{ padding: 0 }}>
            <div style={tableWrap}>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Ruta</th>
                    <th style={{ textAlign: 'right' }}>Zile circulate</th>
                    <th style={{ textAlign: 'right' }}>Zile numărate</th>
                    <th style={{ textAlign: 'right' }}>Oameni pe zi</th>
                    <th style={{ textAlign: 'right' }}>Bilete TIKI pe zi</th>
                    <th style={{ textAlign: 'right' }}>Fără bilet pe zi</th>
                    <th style={{ textAlign: 'left' }}>Se ține pe</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map(r => (
                    <Fragment key={r.r.route}>
                      <tr onClick={() => setOpen(o => (o === r.r.route ? null : r.r.route))} style={{ cursor: 'pointer' }}>
                        <td style={{ textAlign: 'left' }}>
                          <b style={{ color: '#9B1B30' }}>{capatNord(r.r.de_la, r.r.pana_la)}</b>
                          <div style={{ fontSize: 11, color: '#999' }}>{ora(r.r.time_nord)} spre Chișinău · {ora(r.r.time_chisinau)} din Chișinău</div>
                        </td>
                        <td style={{ textAlign: 'right' }}>{fmtInt(r.r.zile_circulate)}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {fmtInt(r.r.zile_numarate)}
                          {!r.numarata && <div style={{ fontSize: 11, color: '#8a5a00' }}>puțin numărată</div>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.oameniZi == null ? '—' : nf1.format(r.oameniZi)}</td>
                        <td style={{ textAlign: 'right' }}>{r.tikiZi == null ? '—' : nf1.format(r.tikiZi)}</td>
                        <td style={{ textAlign: 'right' }}>{r.faraZi == null ? '—' : nf1.format(r.faraZi)}</td>
                        <td style={{ textAlign: 'left', fontSize: 12 }}>
                          {r.top.length === 0 ? <span style={{ color: '#999' }}>—</span> : r.top.map((p, i) => (
                            <div key={i}>{p.nume} <span style={{ color: '#777' }}>{nf1.format(p.oameniZi)}/zi ({p.pct.toFixed(0)}%)</span></div>
                          ))}
                        </td>
                      </tr>
                      {open === r.r.route && (
                        <tr><td colSpan={7} style={{ background: 'rgba(0,0,0,0.02)' }}><Perechi p={perechi} /></td></tr>
                      )}
                    </Fragment>
                  ))}
                  {table.length === 0 && (
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
