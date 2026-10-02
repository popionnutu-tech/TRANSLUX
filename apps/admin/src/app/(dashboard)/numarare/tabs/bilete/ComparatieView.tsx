'use client';

// «Comparație perioade» (ION-167, înlocuiește «Față de anul trecut»). Ion, 01.10: «transformă față de anul trecut în raport
// comparație între perioade la număr de pasageri total pe tipuri de bilete». Implicit luna ultimă față de luna dinainte;
// față de anul trecut se compară doar biletele TIKI (atunci nu exista Numărarea).

import { useEffect, useMemo, useState } from 'react';
import { getTikiComparatie } from '../biletAparatActions';
import type { TikiComparatie } from './types';
import type { DateRange } from './periods';
import { comparatie, lastFullMonth, monthBounds, monthsDesc, shiftMonthKey, type ComparatieRand } from './raport';
import PerioadaPicker, { perioadaLabel } from './PerioadaPicker';
import { Notice, fmtInt, nf1, tableWrap } from './ui';

const perZi = (n: number | null, zile: number) => (n == null ? '—' : nf1.format(n / zile));

function Dif({ a, b, za, zb }: { a: number | null; b: number | null; za: number; zb: number }) {
  if (a == null || b == null) return <span style={{ color: '#999' }}>—</span>;
  const d = a / za - b / zb;
  const pct = b > 0 ? (d / (b / zb)) * 100 : null;
  const color = d > 0.05 ? 'var(--success)' : d < -0.05 ? 'var(--danger)' : '#666';
  return (
    <span style={{ color, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {d > 0 ? '+' : ''}{nf1.format(d)} / zi
      {pct != null && <span style={{ fontSize: 11, fontWeight: 500 }}> ({pct > 0 ? '+' : ''}{pct.toFixed(0)}%)</span>}
    </span>
  );
}

export default function ComparatieView({ dateMin, dateMax }: { dateMin: string; dateMax: string }) {
  const luna = lastFullMonth(dateMax);
  const months = useMemo(() => monthsDesc(dateMin, dateMax), [dateMin, dateMax]);
  const [a, setA] = useState<DateRange>(monthBounds(luna));
  const [b, setB] = useState<DateRange>(monthBounds(shiftMonthKey(luna, -1)));
  const [data, setData] = useState<TikiComparatie | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    getTikiComparatie(a.from, a.to, b.from, b.to).then(r => {
      if (!alive) return;
      if (r.error) setError(r.error); else setData(r.data!);
    });
    return () => { alive = false; };
  }, [a, b]);

  const c = useMemo(() => (data ? comparatie(data) : null), [data]);
  const la = perioadaLabel(a), lb = perioadaLabel(b);
  const aMonth = a.from.slice(0, 7);

  return (
    <div>
      <div className="card" style={{ padding: '10px 12px', marginBottom: 12, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <PerioadaPicker label="Perioada" months={months} value={a} onChange={setA} dateMin={dateMin} dateMax={dateMax} />
        <PerioadaPicker label="față de" months={months} value={b} onChange={setB} dateMin={dateMin} dateMax={dateMax} />
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setB(monthBounds(shiftMonthKey(aMonth, -1)))}>Luna dinainte</button>
          <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setB(monthBounds(shiftMonthKey(aMonth, -12)))}>Aceeași lună anul trecut</button>
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {!data && !error && <div style={{ padding: 20, color: '#999' }}>Se încarcă…</div>}

      {data && c && (
        <>
          <div style={{ fontSize: 16, margin: '4px 0 10px' }}>
            {c.cuFara ? (
              <>
                <b>{la}</b>: <b>{fmtInt(c.total.oameniA)}</b> de oameni transportați ({nf1.format(c.total.oameniA! / data.zile_a)} pe zi),{' '}
                cu <b style={{ color: c.total.difZi < 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {nf1.format(Math.abs(c.total.difZi))} {c.total.difZi < 0 ? 'mai puțini' : 'mai mulți'}</b> pe zi decât în <b>{lb}</b>.
              </>
            ) : (
              <>
                <b>{la}</b>: <b>{fmtInt(c.total.tikiA)}</b> bilete TIKI ({nf1.format(c.total.tikiA / data.zile_a)} pe zi),{' '}
                <b style={{ color: c.total.difZi < 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {nf1.format(Math.abs(c.total.difZi))} {c.total.difZi < 0 ? 'mai puține' : 'mai multe'}</b> pe zi decât în <b>{lb}</b>.
              </>
            )}
          </div>
          {c.cuFara ? (
            <Notice tone="info">
              «Fără bilet TIKI (numărați)» = oamenii numărați la Numărare care n-au bilet TIKI, estimat pe fiecare rută din zilele
              numărate complet. Se compară pe aceleași <b>{data.rute_incluse}</b> din {data.rute_circulate} rute în ambele perioade
              {data.rute_excluse.length > 0 && <> (lipsesc, puțin numărate: {data.rute_excluse.map(r => `${r.de_la} (${r.acop_a ?? 0}% / ${r.acop_b ?? 0}%)`).join(', ')})</>}.
              Biletele TIKI sunt pe toate rutele.
            </Notice>
          ) : (
            <Notice tone="info">
              {!data.numarare_b || !data.numarare_a
                ? <>În {!data.numarare_b ? lb : la} nu exista Numărarea (începe la 28.03.2026), deci se compară doar <b>biletele TIKI</b>.</>
                : <>Nicio rută nu e numărată destul în ambele perioade, deci se compară doar <b>biletele TIKI</b>.</>}
            </Notice>
          )}

          <div className="card" style={{ padding: 0 }}>
            <div style={tableWrap}>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Tip bilet (de unde – până unde)</th>
                    <th style={{ textAlign: 'right' }}>Bilete TIKI<br /><span style={{ fontWeight: 400, fontSize: 11 }}>{la} · {lb}</span></th>
                    {c.cuFara && <th style={{ textAlign: 'right' }}>Fără bilet TIKI (numărați)<br /><span style={{ fontWeight: 400, fontSize: 11 }}>{la} · {lb}</span></th>}
                    {c.cuFara && <th style={{ textAlign: 'right' }}>Oameni transportați<br /><span style={{ fontWeight: 400, fontSize: 11 }}>{la} · {lb}</span></th>}
                    <th style={{ textAlign: 'right' }}>Diferența pe zi</th>
                  </tr>
                </thead>
                <tbody>
                  {[...c.randuri, c.total].map((r: ComparatieRand, i) => {
                    const total = i === c.randuri.length;
                    const cell = (x: number | null, y: number | null) => (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fmtInt(x)} · {fmtInt(y)}
                        <div style={{ fontSize: 11, color: '#999' }}>{perZi(x, data.zile_a)} · {perZi(y, data.zile_b)} pe zi</div>
                      </td>
                    );
                    return (
                      <tr key={r.nume} style={total ? { fontWeight: 700, borderTop: '2px solid rgba(0,0,0,0.15)' } : undefined}>
                        <td style={{ textAlign: 'left' }}>{r.nume}</td>
                        {cell(r.tikiA, r.tikiB)}
                        {c.cuFara && cell(r.faraA != null ? Math.round(r.faraA) : null, r.faraB != null ? Math.round(r.faraB) : null)}
                        {c.cuFara && cell(r.oameniA != null ? Math.round(r.oameniA) : null, r.oameniB != null ? Math.round(r.oameniB) : null)}
                        <td style={{ textAlign: 'right' }}>
                          {c.cuFara
                            ? <Dif a={r.oameniA} b={r.oameniB} za={data.zile_a} zb={data.zile_b} />
                            : <Dif a={r.tikiA} b={r.tikiB} za={data.zile_a} zb={data.zile_b} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
            Ziua = ziua cursei. Primele 15 tipuri de bilet după volum, ordonate de la cea mai mare scădere; restul în «Altele».
            Perioade de lungimi diferite se compară pe zi ({data.zile_a} față de {data.zile_b} zile).
          </div>
        </>
      )}
    </div>
  );
}
