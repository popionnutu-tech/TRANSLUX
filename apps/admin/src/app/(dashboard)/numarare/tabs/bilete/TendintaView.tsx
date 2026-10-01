'use client';

// «Față de anul trecut» (ION-159): pe coridoare (din eticheta TIKI, fără atribuire), în bilete; lei pe un grafic
// separat (niciodată a doua axă). Luna în curs se compară pe aceleași zile. «Anulare» = rând separat; în 12.2024–03.2025
// ~7 % din bilete erau «Anulare», deci anul trecut pe coridoare e incomplet în acele luni.

import { useEffect, useMemo, useState } from 'react';
import { getTikiCalitate, getTikiTendinta } from '../biletAparatActions';
import type { TikiCalitate, TikiTendinta } from './types';
import { MONTHS_RO, addDays, fmtDate, pctChange } from './periods';
import {
  ANULARE_MONTHS, compareMonths, daysInMonth, prevYearMonth, tariffSteps, windowMonths, type TendWindow,
} from './analiza';
import { HatchSwatch, YearLegend, YearLines } from './charts';
import { CertaintyLegend, Delta, Kpi, Notice, QualityLine, fmtInt, fmtLei, nf1, nf2, tableWrap } from './ui';

const WINDOWS: { key: TendWindow; label: string }[] = [
  { key: '12luni', label: 'Ultimele 12 luni' },
  { key: 'an', label: 'Anul acesta' },
  { key: 'luna', label: 'Ultima lună' },
];

const ANULARE = 'Anulare';
const mLabel = (m: string) => `${MONTHS_RO[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;

export default function TendintaView({ dateMax }: { dateMax: string }) {
  const [data, setData] = useState<TikiTendinta | null>(null);
  const [q, setQ] = useState<TikiCalitate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [win, setWin] = useState<TendWindow>('12luni');

  useEffect(() => {
    let alive = true;
    Promise.all([getTikiTendinta(), getTikiCalitate(addDays(dateMax, -364), dateMax)]).then(([t, c]) => {
      if (!alive) return;
      if (t.error) { setError(t.error); return; }
      setData(t.data!);
      setQ(c.data ?? null);
    });
    return () => { alive = false; };
  }, [dateMax]);

  const ultima = data?.ultima_zi ?? null;
  const lastMonth = ultima?.slice(0, 7) ?? null;
  const partialDays = ultima && +ultima.slice(8, 10) < daysInMonth(ultima.slice(0, 7)) ? +ultima.slice(8, 10) : null;
  const months = useMemo(() => (lastMonth ? windowMonths(win, lastMonth) : []), [win, lastMonth]);
  const chartMonths = useMemo(() => (lastMonth ? windowMonths('12luni', lastMonth) : []), [lastMonth]);

  const corridors = useMemo(() => {
    const tot = new Map<string, number>();
    for (const r of data?.luni ?? []) if (r.coridor !== ANULARE) tot.set(r.coridor, (tot.get(r.coridor) ?? 0) + r.bilete);
    return [...tot.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [data]);

  // bilete / lei pe lună × coridor
  const cell = useMemo(() => {
    const m = new Map<string, { bilete: number; lei: number }>();
    for (const r of data?.luni ?? []) {
      for (const k of [`${r.luna}|${r.coridor}`, `${r.luna}|*`]) {
        const v = m.get(k) ?? { bilete: 0, lei: 0 };
        v.bilete += r.bilete; v.lei += r.lei;
        m.set(k, v);
      }
    }
    return m;
  }, [data]);

  const steps = useMemo(() => tariffSteps(data?.tarif ?? []), [data]);
  const marks = chartMonths.flatMap((m, i) => (steps.has(m) ? [{ i, label: `preț nou ${nf1.format(steps.get(m)!)}` }] : []));

  /** Seria anului acesta și a anului trecut; luna în curs: anul trecut pro rata pe aceleași zile. */
  const series = (key: string, field: 'bilete' | 'lei') => {
    const cur = chartMonths.map(m => cell.get(`${m}|${key}`)?.[field] ?? null);
    const prev = chartMonths.map(m => {
      const p = cell.get(`${prevYearMonth(m)}|${key}`)?.[field];
      if (p == null) return null;
      return m === lastMonth && partialDays ? p * (partialDays / daysInMonth(prevYearMonth(m))) : p;
    });
    return { cur, prev };
  };
  const hollow = (i: number) => (ANULARE_MONTHS.has(prevYearMonth(chartMonths[i])) ? 'Anul trecut incomplet: ~7 % din bilete fără cursă («Anulare»)' : null);
  const partialNote = (i: number) => (chartMonths[i] === lastMonth && partialDays ? `Luna în curs: zilele 1–${partialDays}, anul trecut pe aceleași zile` : null);

  const total = useMemo(() => (data && ultima ? compareMonths(data.luni, months, ultima) : null), [data, ultima, months]);

  // suma mobilă pe 12 luni, în bilete (doar unde toate cele 12 luni au date)
  const rolling = chartMonths.map(m => {
    const w = windowMonths('12luni', m);
    if (lastMonth && m === lastMonth && partialDays) return null;
    const vals = w.map(x => cell.get(`${x}|*`)?.bilete);
    return vals.every(v => v != null) ? vals.reduce((a, b) => a! + b!, 0)! : null;
  });

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <div style={{ padding: 20, color: '#999' }}>Se încarcă…</div>;
  if (!ultima || !total) return <Notice tone="info">Nu există încă date pe ziua cursei.</Notice>;

  const pricePct = pctChange(
    total.cur.bilete ? total.cur.lei / total.cur.bilete : null,
    total.prev.bilete ? total.prev.lei / total.prev.bilete : null,
  );
  const missingNa = total.missing.length
    ? `Anul trecut fără date pentru: ${total.missing.map(mLabel).join(', ')}${(q?.coada ?? 0) > 0 ? ' (istoria se pregătește)' : ''}`
    : undefined;
  const anularePrev = months.some(m => ANULARE_MONTHS.has(prevYearMonth(m)));
  const winLabel = `${mLabel(months[0])} – ${mLabel(months[months.length - 1])}${partialDays && months.includes(lastMonth!) ? ` (până pe ${fmtDate(ultima)})` : ''}`;

  return (
    <div>
      <QualityLine q={q} />
      <CertaintyLegend types={false} hatch={<HatchSwatch />} />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {WINDOWS.map(w => (
          <button key={w.key} className="btn" onClick={() => setWin(w.key)}
            style={{ padding: '4px 10px', fontSize: 12, ...(win === w.key ? { background: 'var(--primary-dim)' } : {}) }}>{w.label}</button>
        ))}
        <span style={{ fontSize: 12, color: '#777' }}>
          {winLabel} față de aceleași zile cu un an în urmă{partialDays && months.includes(lastMonth!) ? '; luna în curs pe aceleași zile' : ''}.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Kpi title="Bilete" value={<Delta pct={missingNa ? null : pctChange(total.cur.bilete, total.prev.bilete)} na={missingNa} size={22} />}
          sub={`${fmtInt(total.cur.bilete)} față de ${missingNa ? '—' : fmtInt(Math.round(total.prev.bilete))}`} />
        <Kpi title="Preț mediu (lei pe bilet)" value={<Delta pct={missingNa ? null : pricePct} na={missingNa} size={22} />}
          sub={`${total.cur.bilete ? nf2.format(total.cur.lei / total.cur.bilete) : '—'} față de ${!missingNa && total.prev.bilete ? nf2.format(total.prev.lei / total.prev.bilete) : '—'} lei`} />
        <Kpi title="Lei" value={<Delta pct={missingNa ? null : pctChange(total.cur.lei, total.prev.lei)} na={missingNa} size={22} />}
          sub={`${fmtLei(total.cur.lei)} față de ${missingNa ? '—' : fmtLei(total.prev.lei)}`} />
      </div>
      {anularePrev && (
        <Notice>În 12.2024–03.2025 aproape 7 % din bilete erau «Anulare» (fără cursă reală): pe coridoare anul trecut e mai mic decât a fost, deci creșterea pare mai mare. Totalul (cu «Anulare») e corect.</Notice>
      )}

      <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <div style={{ fontWeight: 600 }}>Bilete pe lună, pe coridor</div>
          <YearLegend hollowNote="anul trecut incomplet («Anulare»)" />
        </div>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>Fiecare grafic are scara lui (cifrele din stânga). Linia punctată = preț nou Chișinău–Bălți.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {[...corridors, ANULARE].map(c => {
            const s = series(c, 'bilete');
            if (!s.cur.some(v => v != null) && !s.prev.some(v => v != null)) return null;
            return (
              <div key={c}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{c}</div>
                <YearLines labels={chartMonths.map(mLabel)} cur={s.cur} prev={s.prev} marks={marks}
                  hollowPrev={c === ANULARE ? undefined : hollow} note={partialNote} height={120} />
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, marginBottom: 12 }}>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Lei pe lună (toate coridoarele)</div>
          {(() => {
            const s = series('*', 'lei');
            return <YearLines labels={chartMonths.map(mLabel)} cur={s.cur} prev={s.prev} marks={marks} note={partialNote}
              format={v => (v >= 1e6 ? `${nf1.format(v / 1e6)} mil` : fmtInt(v))} />;
          })()}
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Bilete pe ultimele 12 luni (sumă mobilă)</div>
          {rolling.some(v => v != null)
            ? <YearLines labels={chartMonths.map(mLabel)} cur={rolling} curName="12 luni până aici" format={v => fmtInt(v)} />
            : <div style={{ fontSize: 13, color: '#999', padding: '20px 0' }}>Încă nu sunt 12 luni întregi de date pe ziua cursei{(q?.coada ?? 0) > 0 ? ' — istoria se pregătește' : ''}.</div>}
        </div>
      </div>

      <div className="card" style={{ padding: '12px 14px' }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>De unde vine diferența, pe coridor</div>
        <div style={{ fontSize: 12, color: '#777', marginBottom: 8 }}>
          Lei = bilete × preț mediu: dacă leii cresc doar din preț, biletele stau pe loc. {winLabel}.
        </div>
        <div style={tableWrap}>
          <table style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Coridor</th>
                <th style={{ textAlign: 'right' }}>Bilete</th>
                <th style={{ textAlign: 'right' }}>Bilete față de anul trecut</th>
                <th style={{ textAlign: 'right' }}>Preț mediu</th>
                <th style={{ textAlign: 'right' }}>Preț față de anul trecut</th>
                <th style={{ textAlign: 'right' }}>Lei</th>
                <th style={{ textAlign: 'right' }}>Lei față de anul trecut</th>
              </tr>
            </thead>
            <tbody>
              {[...corridors, ANULARE, '*'].map(c => {
                const t = compareMonths(data.luni, months, ultima, c === '*' ? undefined : x => x === c);
                if (!t.cur.bilete && !t.prev.bilete) return null;
                const na = t.missing.length ? `Anul trecut fără date pentru: ${t.missing.map(mLabel).join(', ')}` : undefined;
                const anul = c !== ANULARE && c !== '*' && anularePrev ? 'Anul trecut incomplet: în 12.2024–03.2025 ~7 % din bilete erau «Anulare»' : undefined;
                const p = t.cur.bilete ? t.cur.lei / t.cur.bilete : null;
                const pp = t.prev.bilete ? t.prev.lei / t.prev.bilete : null;
                return (
                  <tr key={c} style={c === '*' ? { fontWeight: 700, borderTop: '2px solid rgba(0,0,0,0.12)' } : c === ANULARE ? { color: '#777' } : undefined}>
                    <td style={{ textAlign: 'left' }}>{c === '*' ? 'Total' : c === ANULARE ? '«Anulare» (fără cursă)' : c}</td>
                    <td style={{ textAlign: 'right' }}>{fmtInt(t.cur.bilete)}</td>
                    <td style={{ textAlign: 'right' }}><Delta pct={na ? null : pctChange(t.cur.bilete, t.prev.bilete)} na={na} title={anul} /></td>
                    <td style={{ textAlign: 'right' }}>{p == null ? '—' : `${nf2.format(p)} lei`}</td>
                    <td style={{ textAlign: 'right' }}><Delta pct={na ? null : pctChange(p, pp)} na={na} /></td>
                    <td style={{ textAlign: 'right' }}>{fmtLei(t.cur.lei)}</td>
                    <td style={{ textAlign: 'right' }}><Delta pct={na ? null : pctChange(t.cur.lei, t.prev.lei)} na={na} title={anul} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
