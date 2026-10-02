'use client';

// «Șoferi» (ION-167, refăcut). Ion, 01.10: «șoferi raport nu înțeleg până la capăt». Fiecare cursă a șoferului (plecarea
// din grafic, cu mașina lui) e comparată cu colegii de pe aceeași rută și sens, FĂRĂ el, ținând cont de ziua săptămânii;
// rezultatul e în bilete reale: cât a vândut în plus sau în minus față de colegi. Doar bilete TIKI (furtul — alte instrumente).

import { useEffect, useMemo, useState } from 'react';
import { getTikiSoferi } from '../biletAparatActions';
import type { TikiSoferi } from './types';
import type { DateRange } from './periods';
import { capatNord, lastFullMonth, monthBounds, monthsDesc, soferRand, type SoferRand } from './raport';
import PerioadaPicker, { perioadaLabel } from './PerioadaPicker';
import { Notice, Th, fmtInt, fmtLei, nf1, sortRows, tableWrap } from './ui';

type Col = 'sofer' | 'zile' | 'curse' | 'peCursa' | 'colegi' | 'difPeCursa' | 'dif' | 'leiZi';

const semn = (n: number | null, f: (x: number) => string) =>
  n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${f(Math.abs(n))}`;

export default function DriversView({ dateMin, dateMax }: { dateMin: string; dateMax: string }) {
  const months = useMemo(() => monthsDesc(dateMin, dateMax), [dateMin, dateMax]);
  const [per, setPer] = useState<DateRange>(monthBounds(lastFullMonth(dateMax)));
  const [data, setData] = useState<TikiSoferi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: Col; dir: 'asc' | 'desc' }>({ col: 'dif', dir: 'asc' });

  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    getTikiSoferi(per.from, per.to).then(r => {
      if (!alive) return;
      if (r.error) setError(r.error); else setData(r.data!);
    });
    return () => { alive = false; };
  }, [per]);

  const table = useMemo(() => {
    const list = (data?.soferi ?? []).map(soferRand);
    const get = (r: SoferRand) => {
      switch (sort.col) {
        case 'sofer': return r.s.sofer;
        case 'zile': return r.s.zile;
        case 'curse': return r.s.curse;
        case 'peCursa': return r.peCursa;
        case 'colegi': return r.colegiPeCursa;
        case 'difPeCursa': return r.difPeCursa;
        case 'dif': return r.dif;
        case 'leiZi': return r.leiZi;
      }
    };
    return sortRows(list, get, sort.dir);
  }, [data, sort]);

  const th = (col: Col, label: string, align: 'left' | 'right' = 'right') => (
    <Th align={align} active={sort.col === col} dir={sort.dir}
      onClick={() => setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }))}>{label}</Th>
  );

  return (
    <div>
      <div className="card" style={{ padding: '10px 12px', marginBottom: 12 }}>
        <PerioadaPicker months={months} value={per} onChange={setPer} dateMin={dateMin} dateMax={dateMax} />
      </div>
      <Notice tone="info">
        <b>Cum se citește</b> ({perioadaLabel(per)}):
        <div>• <b>Curse</b> — plecările șoferului după grafic (un sens într-o zi), cu mașina lui; biletele unei curse sunt ale mașinii ei.</div>
        <div>• <b>Colegii pe aceleași curse</b> — câte bilete vând în medie ceilalți șoferi pe aceeași rută și sens, fără el, ajustat la ziua săptămânii (vinerea și duminica se vinde mai mult).</div>
        <div>• <b>Bilete în plus / în minus</b> — cât a vândut el peste sau sub colegi, adunat pe toate cursele lui care au cu cine fi comparate (cel puțin 5 curse ale colegilor pe aceeași rută și sens).</div>
      </Notice>
      {error && <Notice tone="danger">{error}</Notice>}
      {!data && !error && <div style={{ padding: 20, color: '#999' }}>Se încarcă…</div>}
      {data && (
        <>
          <div className="card" style={{ padding: 0 }}>
            <div style={tableWrap}>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    {th('sofer', 'Șofer', 'left')}
                    {th('zile', 'Zile')}
                    {th('curse', 'Curse')}
                    {th('peCursa', 'Bilete pe cursă')}
                    {th('colegi', 'Colegii pe aceleași curse')}
                    {th('difPeCursa', 'Diferența pe cursă')}
                    {th('dif', 'Bilete în plus / în minus')}
                    {th('leiZi', 'Încasat pe zi')}
                    <th style={{ textAlign: 'left' }}>Ruta principală</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map(r => {
                    const color = r.dif == null ? '#999' : r.dif < 0 ? 'var(--danger)' : r.dif > 0 ? 'var(--success)' : '#555';
                    return (
                      <tr key={r.s.sofer}>
                        <td style={{ textAlign: 'left', fontWeight: 600 }}>{r.s.sofer}</td>
                        <td style={{ textAlign: 'right' }}>{fmtInt(r.s.zile)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtInt(r.s.curse)}</td>
                        <td style={{ textAlign: 'right' }}>{r.peCursa == null ? '—' : nf1.format(r.peCursa)}</td>
                        <td style={{ textAlign: 'right' }}>{r.colegiPeCursa == null ? '—' : nf1.format(r.colegiPeCursa)}</td>
                        <td style={{ textAlign: 'right', color }}>{semn(r.difPeCursa, x => nf1.format(x))}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r.dif == null
                            ? <span style={{ fontSize: 12, color: '#999' }}>nu are cu cine fi comparat</span>
                            : <span style={{ fontWeight: 700, color }}>{semn(Math.round(r.dif), x => fmtInt(x))}</span>}
                          <div style={{ fontSize: 11, color: '#999' }}>{fmtInt(r.s.curse_comp)} din {fmtInt(r.s.curse)} curse comparate</div>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtLei(r.leiZi)}</td>
                        <td style={{ textAlign: 'left', fontSize: 12, color: '#555' }}>
                          {r.s.ruta_de_la ? `${capatNord(r.s.ruta_de_la, null)} ${r.s.ruta_ora ? r.s.ruta_ora.split(' - ')[0] : ''}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {table.length === 0 && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', color: '#999', padding: 20 }}>Nu sunt curse cu șofer în perioada aleasă.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
            Din {fmtInt(data.bilete_total)} bilete TIKI în perioadă: {fmtInt(data.bilete_fara_sofer)} fără șofer sigur (mașina lor n-are
            plecare în grafic pe acea rută și zi) și {fmtInt(data.bilete_fara_ruta)} nelegate de nicio rută — nu intră la șoferi.
          </div>
        </>
      )}
    </div>
  );
}
