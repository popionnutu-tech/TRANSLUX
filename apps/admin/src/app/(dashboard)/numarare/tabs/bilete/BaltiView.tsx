'use client';

// «Locuri în Bălți» (ION-181, 02.10). Ion: pe fiecare grafic spre Chișinău, câte locuri sunt libere la sosirea în Bălți
// (după ce coboară oamenii din nord), câți urcă în Bălți și, cu altă culoare, câte locuri mai putem vinde din Bălți.
// Coloanele sunt grupate sus pe luni și săptămâni, cu −/+ ca în Google Sheets: un grup închis = o singură coloană cu media.

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { getTikiBalti } from '../biletAparatActions';
import type { Filters, TikiBalti } from './types';
import { Notice, Pill } from './ui';
import {
  buildCalendar, calendarColumns, defaultClosed, monthKey, weekKey, monthSpan, weekSpan, weekdayColumns,
  indexCells, programSet, sumCells, mean, totalRoutes, step, fmtOra, nf1, type Column, type CellMean,
} from './balti';

type Mode = 'calendar' | 'dow';

// Scara «mai putem vinde»: de la roz pal (puține locuri) spre roșiatic (multe) — Ion, 02.10.
const RAMP = ['#fdf1f3', '#f9d5db', '#f2adb7', '#e67f8d', '#d2525f', '#b32f3b'];
const INK = ['#1b2430', '#1b2430', '#1b2430', '#fff', '#fff', '#fff'];
const SELL = ['#1d7a4f', '#1d7a4f', '#1d7a4f', '#d8ffe9', '#d8ffe9', '#d8ffe9'];
const FULL_BG = '#e4e8ee', FULL_INK = '#4a5565', TOTAL_BG = '#f1f3f6';
const MONO: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontVariantNumeric: 'tabular-nums' };

const thBase: CSSProperties = { textAlign: 'center', whiteSpace: 'nowrap', fontSize: 12, padding: '4px 6px', borderBottom: '1px solid rgba(0,0,0,0.08)', background: '#fff' };
const stickyCol: CSSProperties = { position: 'sticky', left: 0, background: '#fff', zIndex: 1, textAlign: 'left', borderRight: '1px solid rgba(0,0,0,0.08)' };

function GroupButton({ closed, onClick, title }: { closed: boolean; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} style={{
      width: 18, height: 18, lineHeight: '15px', padding: 0, marginRight: 6, border: '1px solid rgba(0,0,0,0.3)', borderRadius: 3,
      background: '#fff', color: '#333', fontSize: 13, fontWeight: 700, cursor: 'pointer', verticalAlign: 'middle', display: 'inline-block',
    }}>{closed ? '+' : '−'}</button>
  );
}

// total: celula rândului de jos (ION-213) — suma pe grafice, cu fond neutru: scara de culoare e pentru o cursă de 20 de locuri.
function CellBox({ m, title, total = false }: { m: CellMean | null; title: string; total?: boolean }) {
  if (!m) return <div title={title} style={{ textAlign: 'center', color: '#bbb', padding: '10px 0' }}>—</div>;
  const s = step(m.vinde);
  const bg = total ? TOTAL_BG : m.plin ? FULL_BG : RAMP[s];
  const ink = total ? INK[0] : m.plin ? FULL_INK : INK[s];
  const sell = total ? SELL[0] : m.plin ? FULL_INK : SELL[s];
  // Ion, 03.10 (ION-218): cifra mare = câte locuri mai avem din Bălți; mici: cu câte libere a venit, câți s-au încărcat.
  // ION-220: «?» = biletele Mobilet ale cursei încă nu sunt atribuite (sau lipsesc), nu 0.
  const nr = (v: number | null) => (v == null ? '?' : nf1.format(v));
  const t = `${title}\n${nf1.format(m.vinde)} locuri mai avem din Bălți` + (m.plin ? ' (pleacă plin)' : '') +
    `\n${m.libere == null ? 'necunoscut' : nf1.format(m.libere)} locuri libere la sosirea în Bălți` +
    `\n${m.urca == null ? 'necunoscut câți' : nf1.format(m.urca)} s-au încărcat în Bălți` +
    (m.nepotr ? `\n! ${m.nepotr} ${m.nepotr === 1 ? 'cursă' : 'curse'} cu mai multe bilete din Bălți decât oameni numărați` : '') + (total
      ? `\ntotalul zilei pe toate graficele, media pe ${m.n} ${m.n === 1 ? 'zi' : 'zile'}` +
        (m.programate ? `\nnumărate ${m.numarate} din ${m.programate} curse din grafic; cele nenumărate intră cu media rutei` : '')
      : `\nmedia pe ${m.n} ${m.n === 1 ? 'cursă' : 'curse'}`);
  return (
    <div title={t} style={{
      ...MONO, display: 'grid', gridTemplateColumns: 'auto 1fr', gridTemplateRows: 'auto auto', columnGap: 8, rowGap: 2, alignItems: 'baseline',
      padding: '5px 8px', borderRadius: 5, background: bg, color: ink, minWidth: 84,
      outline: m.plin ? `1px dashed ${FULL_INK}` : 'none', outlineOffset: -1,
    }}>
      <span style={{ gridRow: '1 / span 2', alignSelf: 'center', fontSize: 19, fontWeight: 700, lineHeight: 1, color: sell }}>{nf1.format(m.vinde)}</span>
      <span style={{ justifySelf: 'end', fontSize: 12, lineHeight: 1, opacity: 0.85 }} title="locuri libere la sosirea în Bălți">lib. {nr(m.libere)}</span>
      <span style={{ justifySelf: 'end', fontSize: 12, lineHeight: 1, opacity: 0.85 }} title="s-au încărcat în Bălți">↑{nr(m.urca)}{m.nepotr ? <b style={{ color: '#b45309' }}> !</b> : null}</span>
    </div>
  );
}

export default function BaltiView({ filters }: { filters: Filters }) {
  const [data, setData] = useState<TikiBalti | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('calendar');
  const [closed, setClosed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    getTikiBalti(filters.from, filters.to).then(r => {
      if (!alive) return;
      if (r.error) { setError(r.error); return; }
      setData(r.data!);
    });
    return () => { alive = false; };
  }, [filters.from, filters.to]);

  const cal = useMemo(() => buildCalendar(filters.from, filters.to), [filters.from, filters.to]);
  useEffect(() => { setClosed(defaultClosed(cal)); }, [cal]);

  const idx = useMemo(() => indexCells(data?.zile ?? []), [data]);
  const prog = useMemo(() => programSet(data?.program ?? []), [data]);
  const routes = useMemo(() => data?.rute ?? [], [data]);
  const routeKeys = useMemo(() => routes.map(r => r.cheie), [routes]);
  const cols: Column[] = useMemo(
    () => (mode === 'calendar' ? calendarColumns(cal, closed) : weekdayColumns(filters.from, filters.to)),
    [mode, cal, closed, filters.from, filters.to],
  );
  const allDates = useMemo(() => cal.flatMap(m => m.weeks.flatMap(w => w.dates)), [cal]);

  const toggle = (k: string) => setClosed(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setAll = (close: boolean) => setClosed(close ? defaultClosed(cal) : new Set());

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <div style={{ padding: 20, color: '#999' }}>Se încarcă…</div>;

  const ramp = (
    <span style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(6, 14px)', height: 11, borderRadius: 3, overflow: 'hidden', verticalAlign: 'middle', margin: '0 4px' }}>
      {RAMP.map(c => <i key={c} style={{ background: c, display: 'block' }} />)}
    </span>
  );

  return (
    <div>
      <div className="card" style={{ padding: '10px 12px', marginBottom: 10, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
        <CellBox m={{ n: 9, libere: 13.3, urca: 5, vinde: 8.3, plin: false, nepotr: 0 }} title="exemplu" />
        <div style={{ color: '#555', maxWidth: 640 }}>
          <b style={{ color: SELL[0] }}>8,3</b> locuri mai avem din Bălți ·
          <b> lib. 13,3</b> locuri libere când microbuzul ajunge în Bălți (20 minus cei din nord care merg mai departe) ·
          <b> ↑5,0</b> s-au încărcat în Bălți.
          Fondul {ramp} e cu atât mai roșu cu cât sunt mai multe locuri de vândut;
          <span style={{ display: 'inline-block', width: 12, height: 12, background: FULL_BG, border: `1px dashed ${FULL_INK}`, borderRadius: 3, verticalAlign: 'middle', margin: '0 4px 0 6px' }} />
          gri = autobuzul pleacă plin din Bălți (20 sau mai mulți numărați). Media pe curse; la hover se vede numărul de curse.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <Pill active={mode === 'calendar'} onClick={() => setMode('calendar')}>Calendar</Pill>
        <Pill active={mode === 'dow'} onClick={() => setMode('dow')}>Zile ale săptămânii</Pill>
        {mode === 'calendar' && (
          <span style={{ marginLeft: 8, display: 'inline-flex', gap: 6 }}>
            <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setAll(false)}>Deschide toate</button>
            <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setAll(true)}>Închide toate</button>
          </span>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead>
              {mode === 'calendar' ? (
                <>
                  <tr>
                    <th rowSpan={3} style={{ ...thBase, ...stickyCol, verticalAlign: 'bottom', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: '#777', paddingLeft: 12 }}>Graficul</th>
                    {cal.map(m => {
                      const k = monthKey(m), c = closed.has(k);
                      return (
                        <th key={k} colSpan={monthSpan(m, closed)} style={{ ...thBase, fontWeight: 600, color: '#333', textAlign: 'left', borderLeft: '1px solid rgba(0,0,0,0.08)' }}>
                          <GroupButton closed={c} onClick={() => toggle(k)} title={c ? `Deschide ${m.label}` : `Închide ${m.label}`} />
                          {m.label}
                        </th>
                      );
                    })}
                    <th rowSpan={3} style={{ ...thBase, verticalAlign: 'bottom', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: '#777', borderLeft: '2px solid rgba(0,0,0,0.12)' }}>Perioada</th>
                  </tr>
                  <tr>
                    {cal.map(m => closed.has(monthKey(m))
                      ? <th key={monthKey(m)} style={{ ...thBase, color: '#999', fontWeight: 400, borderLeft: '1px solid rgba(0,0,0,0.08)' }}>toată luna</th>
                      : m.weeks.map(w => {
                        const k = weekKey(m, w), c = closed.has(k);
                        return (
                          <th key={k} colSpan={weekSpan(m, w, closed)} style={{ ...thBase, fontWeight: 500, color: '#444', textAlign: 'left', borderLeft: '1px solid rgba(0,0,0,0.08)' }}>
                            <GroupButton closed={c} onClick={() => toggle(k)} title={c ? `Deschide săptămâna ${w.iso} pe zile` : `Închide săptămâna ${w.iso}`} />
                            S{w.iso} <span style={{ color: '#888', fontWeight: 400 }}>{w.label}</span>
                          </th>
                        );
                      }))}
                  </tr>
                  <tr>
                    {cols.map(c => (
                      <th key={c.key} title={c.title} style={{ ...thBase, color: c.kind === 'day' ? '#555' : '#999', fontWeight: c.kind === 'day' ? 600 : 400, borderLeft: '1px solid rgba(0,0,0,0.06)' }}>{c.label}</th>
                    ))}
                  </tr>
                </>
              ) : (
                <tr>
                  <th style={{ ...thBase, ...stickyCol, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: '#777', paddingLeft: 12 }}>Graficul</th>
                  {cols.map(c => <th key={c.key} title={c.title} style={{ ...thBase, fontWeight: 600, color: '#555', textTransform: 'capitalize', borderLeft: '1px solid rgba(0,0,0,0.06)' }}>{c.label}</th>)}
                  <th style={{ ...thBase, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: '#777', borderLeft: '2px solid rgba(0,0,0,0.12)' }}>Perioada</th>
                </tr>
              )}
            </thead>
            <tbody>
              {routes.map(r => {
                const name = `${fmtOra(r.ora)} ${r.nume} – Chișinău`;
                return (
                  <tr key={r.cheie}>
                    <th style={{ ...stickyCol, padding: '4px 10px 4px 12px', whiteSpace: 'nowrap', fontWeight: 600, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <span style={{ ...MONO, color: '#9B1B30', marginRight: 8, fontSize: 13 }}>{fmtOra(r.ora)}</span>
                      {r.nume} – Chișinău
                      <div style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>{r.curse} curse</div>
                    </th>
                    {cols.map(c => (
                      <td key={c.key} style={{ padding: 3, borderBottom: '1px solid rgba(0,0,0,0.06)', borderLeft: '1px solid rgba(0,0,0,0.04)' }}>
                        <CellBox m={mean(sumCells(idx, [r.cheie], c.dates))} title={`${name} · ${c.title}`} />
                      </td>
                    ))}
                    <td style={{ padding: 3, borderBottom: '1px solid rgba(0,0,0,0.06)', borderLeft: '2px solid rgba(0,0,0,0.12)' }}>
                      <CellBox m={mean(sumCells(idx, [r.cheie], allDates))} title={`${name} · toată perioada`} />
                    </td>
                  </tr>
                );
              })}
              {routes.length === 0 && (
                <tr><td colSpan={cols.length + 2} style={{ textAlign: 'center', color: '#999', padding: 20 }}>Nu sunt curse spre Chișinău numărate în perioada aleasă.</td></tr>
              )}
            </tbody>
            {routes.length > 0 && (
              <tfoot>
                <tr>
                  <th style={{ ...stickyCol, padding: '6px 12px', whiteSpace: 'nowrap', fontSize: 12, color: '#777', fontWeight: 600, borderTop: '2px solid rgba(0,0,0,0.12)' }}>Total pe toate graficele, media pe zi</th>
                  {cols.map(c => (
                    <td key={c.key} style={{ padding: 3, borderTop: '2px solid rgba(0,0,0,0.12)', borderLeft: '1px solid rgba(0,0,0,0.04)' }}>
                      <CellBox total m={totalRoutes(idx, prog, routeKeys, c.dates)} title={`total pe toate graficele · ${c.title}`} />
                    </td>
                  ))}
                  <td style={{ padding: 3, borderTop: '2px solid rgba(0,0,0,0.12)', borderLeft: '2px solid rgba(0,0,0,0.12)' }}>
                    <CellBox total m={totalRoutes(idx, prog, routeKeys, allDates)} title="total pe toate graficele · toată perioada" />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#777', marginTop: 10, maxWidth: 760, display: 'grid', gap: 4 }}>
        <div>Doar zilele numărate (sesiuni terminate, drumul spre Chișinău numărat); o zi pe rută = un autobuz. <b>Numărați</b> = oamenii din autobuz la ieșirea din Bălți (Numărare). <b>Încărcați în Bălți</b> = biletele Mobilet ale rutei din acea zi cu urcarea în Bălți, fără biletele altui autobuz (altă mașină decât cea numărată sau ora din etichetă la peste 3 ore de plecarea rutei, adică altă cursă a zilei).</div>
        <div><b>Mai avem din Bălți</b> (cifra mare) = 20 − numărați: locurile goale când autobuzul pleacă din Bălți.</div>
        <div><b>lib.</b> = locurile libere la sosirea în Bălți = 20 − (numărați − încărcați în Bălți): cei din nord care merg mai departe sunt numărații fără cei încărcați în Bălți. <b>↑</b> = s-au încărcat în Bălți. Exemplu: 16 numărați, 14 încărcați → 2 merg mai departe, lib. 18, mai avem 4.</div>
        <div>Celula gri = autobuzul pleacă plin din Bălți (20 sau mai mulți numărați). <b>?</b> = biletele Mobilet ale cursei încă nu sunt atribuite pe rută (se face noaptea) sau lipsesc. <b>!</b> = mai multe bilete din Bălți decât oameni numărați: ori numărarea, ori biletele sunt greșite.</div>
        <div>Ora e plecarea din capătul de nord, din graficul rutei.</div>
        <div><b>Total pe toate graficele</b> = totalul unei zile pe toate cursele spre Chișinău din grafic, mediat pe zilele coloanei (pe «sâmbătă» în septembrie: media celor 4 sâmbete). O cursă din grafic nenumărată în acea zi intră cu media rutei din aceeași coloană; la hover: câte sunt numărate din câte sunt în grafic. «Mai avem» se adună pe grafice, cursa plină nu scade din celelalte.</div>
      </div>
    </div>
  );
}
