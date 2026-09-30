'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { getTikiMonthly, getTikiPairs } from '../biletAparatActions';
import type { TikiMeta, TikiMonthly } from './types';
import { MONTHS_RO, isUnreliableMonth, pctChange, fmtDate, addDays, shiftMonth, UNRELIABLE_RANGES } from './periods';
import { BarChart, LineChart } from './charts';
import { Delta, Notice, fmtInt, fmtLei, nf0, nf1, tableWrap } from './ui';

type Metric = 'tickets' | 'lei' | 'per_day';

const METRICS: { key: Metric; label: string }[] = [
  { key: 'tickets', label: 'Bilete' },
  { key: 'lei', label: 'Încasat' },
  { key: 'per_day', label: 'Bilete pe zi' },
];

const inputStyle: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, fontSize: 13, background: '#fff',
  width: 'auto', flex: '0 0 auto',
};

function daysInMonth(m: string): number {
  return +addDays(shiftMonth(`${m}-01`, 1), -1).slice(8, 10);
}

export default function MonthlyView({ meta }: { meta: TikiMeta }) {
  const [route, setRoute] = useState('');
  const [driver, setDriver] = useState('');
  const [pair, setPair] = useState('');
  const [pairs, setPairs] = useState<string[]>([]);
  const [data, setData] = useState<TikiMonthly | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('tickets');

  useEffect(() => {
    if (!meta.date_min || !meta.date_max) return;
    getTikiPairs(meta.date_min, meta.date_max).then(r => setPairs((r.data ?? []).slice(0, 150).map(p => p.pair)));
  }, [meta.date_min, meta.date_max]);

  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    getTikiMonthly(route, driver, pair).then(r => {
      if (!alive) return;
      if (r.error) setError(r.error); else setData(r.data!);
    });
    return () => { alive = false; };
  }, [route, driver, pair]);

  const byMonth = useMemo(() => new Map((data?.months ?? []).map(m => [m.m, m])), [data]);
  const years = useMemo(() => [...new Set((data?.months ?? []).map(m => m.m.slice(0, 4)))].sort(), [data]);

  // Luna e parțială când exportul o acoperă doar în parte (prima sau ultima lună cu date).
  const partial = (m: string) => {
    const first = `${m}-01`;
    const last = addDays(shiftMonth(first, 1), -1);
    return (!!meta.date_min && meta.date_min > first && meta.date_min <= last)
      || (!!meta.date_max && meta.date_max < last && meta.date_max >= first);
  };
  const coveredDays = (m: string) => {
    const first = `${m}-01`;
    const last = addDays(shiftMonth(first, 1), -1);
    const a = meta.date_min && meta.date_min > first ? meta.date_min : first;
    const b = meta.date_max && meta.date_max < last ? meta.date_max : last;
    return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1);
  };
  const value = (m: string, k: Metric = metric): number | null => {
    const r = byMonth.get(m);
    if (!r) return null;
    if (k === 'tickets') return r.tickets;
    if (k === 'lei') return r.lei;
    return r.tickets / (coveredDays(m) || daysInMonth(m));
  };
  // Comparația cu anul trecut: pe zi când una din luni e parțială (altfel s-ar compara lună plină cu lună tăiată).
  const yoyPct = (m: string): { pct: number | null; perDay: boolean } => {
    const prev = `${+m.slice(0, 4) - 1}${m.slice(4)}`;
    if (!byMonth.has(m) || !byMonth.has(prev)) return { pct: null, perDay: false };
    const perDay = metric !== 'per_day' && (partial(m) || partial(prev));
    if (perDay) {
      const f = (x: string) => (metric === 'lei' ? byMonth.get(x)!.lei : byMonth.get(x)!.tickets) / (coveredDays(x) || daysInMonth(x));
      return { pct: pctChange(f(m), f(prev)), perDay: true };
    }
    return { pct: pctChange(value(m), value(prev)), perDay: false };
  };

  const fmt = (v: number | null) =>
    v == null ? '—' : metric === 'lei' ? fmtLei(v) : metric === 'per_day' ? nf1.format(v) : fmtInt(v);

  const lineYears = years.slice(-3);
  const weeks = data?.weeks ?? [];
  const weekUnreliable = (w: string) => UNRELIABLE_RANGES.some(u => w <= u.to && addDays(w, 6) >= u.from);

  return (
    <div>
      <div className="card" style={{ padding: '10px 12px', marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={route} onChange={e => setRoute(e.target.value)} style={{ ...inputStyle, maxWidth: 230 }}>
          <option value="">Toate cursele</option>
          {meta.routes.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
        </select>
        <select value={driver} onChange={e => setDriver(e.target.value)} style={{ ...inputStyle, maxWidth: 230 }}>
          <option value="">Toți șoferii</option>
          {meta.drivers.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
        </select>
        <select value={pair} onChange={e => setPair(e.target.value)} style={{ ...inputStyle, maxWidth: 260 }}>
          <option value="">Toate tipurile de bilet</option>
          {pairs.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {METRICS.map(m => (
            <button key={m.key} className="btn" onClick={() => setMetric(m.key)}
              style={{ padding: '4px 10px', fontSize: 12, ...(metric === m.key ? { background: 'var(--primary-dim)' } : {}) }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {!data && !error && <div style={{ padding: 20, color: '#999' }}>Se încarcă…</div>}

      {data && (
        <>
          <Notice tone="info">
            Aceeași lună, an lângă an. <b>Δ</b> = față de aceeași lună din anul precedent. Lunile acoperite doar parțial de export
            (*) se compară <b>pe zi</b>, ca să nu comparăm o lună plină cu una tăiată. Lunile marcate ⚠ (dec. 2025, ian. 2026)
            au date mutate de sincronizarea în bloc a terminalelor; totalul celor două luni la un loc e corect, împărțirea între ele nu.
          </Notice>
          <div className="card" style={{ padding: 0, marginBottom: 12 }}>
            <div style={tableWrap}>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Luna</th>
                    {years.map((y, i) => (
                      <Fragment key={y}>
                        <th style={{ textAlign: 'right' }}>{y}</th>
                        {i > 0 && <th style={{ textAlign: 'right', color: '#999', fontWeight: 500 }}>Δ</th>}
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS_RO.map((label, mi) => {
                    const mm = String(mi + 1).padStart(2, '0');
                    if (!years.some(y => byMonth.has(`${y}-${mm}`))) return null;
                    return (
                      <tr key={mm}>
                        <td style={{ textAlign: 'left', fontWeight: 600 }}>{label}</td>
                        {years.map((y, i) => {
                          const m = `${y}-${mm}`;
                          const unrel = isUnreliableMonth(m) && byMonth.has(m);
                          const part = partial(m) && byMonth.has(m);
                          const d = yoyPct(m);
                          return (
                            <Fragment key={y}>
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap', background: unrel ? 'var(--warning-dim)' : undefined }}
                                title={unrel ? 'Sincronizare în bloc: datele sunt mutate între dec. 2025 și ian. 2026'
                                  : part ? `Lună parțială: ${coveredDays(m)} din ${daysInMonth(m)} zile în export` : undefined}>
                                {unrel && '⚠ '}{fmt(value(m))}{part && <sup style={{ color: '#999', marginLeft: 2 }}>*</sup>}
                              </td>
                              {i > 0 && (
                                <td style={{ textAlign: 'right' }}>
                                  {(() => {
                                    const na = unrel || isUnreliableMonth(`${+y - 1}-${mm}`) ? 'Una din luni e afectată de sincronizarea în bloc' : undefined;
                                    return (
                                      <>
                                        <Delta pct={d.pct} na={na} title={d.perDay ? 'Comparat pe zi (lună parțială)' : undefined} />
                                        {!na && d.perDay && d.pct != null && <div style={{ fontSize: 10, color: '#999' }}>pe zi</div>}
                                      </>
                                    );
                                  })()}
                                </td>
                              )}
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid rgba(0,0,0,0.1)' }}>
                    <td style={{ textAlign: 'left', fontWeight: 700 }}>Total</td>
                    {years.map((y, i) => {
                      const ms = (data.months ?? []).filter(m => m.m.startsWith(y));
                      const t = metric === 'lei' ? ms.reduce((s, m) => s + m.lei, 0) : ms.reduce((s, m) => s + m.tickets, 0);
                      const days = ms.reduce((s, m) => s + coveredDays(m.m), 0);
                      return (
                        <Fragment key={y}>
                          <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {metric === 'per_day' ? nf1.format(days ? t / days : 0) : metric === 'lei' ? fmtLei(t) : fmtInt(t)}
                            <div style={{ fontSize: 10, color: '#999', fontWeight: 400 }}>{ms.length} luni</div>
                          </td>
                          {i > 0 && <td />}
                        </Fragment>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {lineYears.length > 0 && (
            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {METRICS.find(m => m.key === metric)!.label} pe luni — {lineYears.join(' vs ')}
              </div>
              <LineChart
                xLabels={MONTHS_RO}
                series={lineYears.map(y => ({
                  name: y,
                  values: MONTHS_RO.map((_, mi) => value(`${y}-${String(mi + 1).padStart(2, '0')}`, metric === 'per_day' ? 'per_day' : metric)),
                }))}
                format={v => (metric === 'lei' ? `${nf0.format(v / 1000)} mii` : metric === 'per_day' ? nf1.format(v) : nf0.format(v))}
              />
              <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>
                Lunile parțiale apar cu totalul lor; comparația corectă, pe zi, e în tabel.
              </div>
            </div>
          )}

          {weeks.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Ultimele 26 de săptămâni (până la {data.date_max ? fmtDate(data.date_max) : '—'})</div>
              <BarChart
                data={weeks.map(w => ({
                  key: w.w,
                  label: `${w.w.slice(8, 10)}.${w.w.slice(5, 7)}`,
                  value: metric === 'lei' ? w.lei : metric === 'per_day' ? w.tickets / (w.days || 1) : w.tickets,
                  extra: `${w.days} zile cu date${w.days < 7 ? ' (săptămână incompletă)' : ''}`,
                }))}
                valueLabel={metric === 'lei' ? 'lei' : metric === 'per_day' ? 'bilete pe zi' : 'bilete'}
                format={v => (metric === 'per_day' ? nf1.format(v) : nf0.format(v))}
                flag={k => weekUnreliable(k) || (weeks.find(w => w.w === k)?.days ?? 7) < 7}
                flagLabel="Săptămână incompletă sau afectată de sincronizarea în bloc"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
