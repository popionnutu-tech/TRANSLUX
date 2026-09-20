'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { searchCourses, type AntaCourse, type AntaStop, type ConcurentaInit, type Place } from './actions';
import { foldName, splitPrefix } from '@/lib/anta/names';
import { isIntersection } from '@/lib/anta/district';
import s from './concurenta.module.css';

// Concurența pe direcție (ION-12). Ion, 20.09.2026: «выбрал направление откуда-куда, фирму — и вышли все
// машины в ту сторону; нажимаю на маршрут — детально с Кишинёва в сторону конечной точки и наоборот».
// Fără dată (graficul ANTA n-are zile de circulație) și fără durată (Ion: «время поездки не надо»).
// Coloana a doua nu e sosirea, ci ora la care mașina pornește ÎNAPOI din capătul rutei (Ion, 20.09: «in loc de
// sosire am nevoie ora de pornire din punctul final inapoi») — sosirea la destinație rămâne în detaliu.

type Dir = 'tur' | 'retur';
interface Row { course: AntaCourse; dir: Dir; dep: string; arr: string | null; from: AntaStop; to: AntaStop; km: number; lei: number; terminus: string }
interface PlaceOpt { name: string; district: string | null; base: string; ty: string; key: string }

const TY: Record<string, string> = { or: 'oraș', s: 'sat', mun: 'municipiu', com: 'comună', '': '' };
const pad = (t: string | null) => (t ? t.replace(/^(\d):/, '0$1:') : '—');
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const price = (km: number, rate: number | null) => (rate && km > 0 && km < 1000 ? Math.round(km * rate) : 0);
const matchStop = (st: AntaStop, p: PlaceOpt) => st.name === p.name && (!p.district || !st.district || st.district === p.district);

function toOpts(places: Place[]): PlaceOpt[] {
  const opts = places.map((p) => { const b = splitPrefix(p.name); const x = isIntersection(p.name); return { name: p.name, district: p.district, base: b.name, ty: x ? '' : TY[b.ty] ?? '', key: foldName(b.name) + (x ? ' intersectie' : '') }; });
  return opts.sort((a, b) => a.base.localeCompare(b.base, 'ro') || (a.district ?? '').localeCompare(b.district ?? '', 'ro'));
}

/* ---------- alegerea localității: nume + tip + raion ---------- */
function PlacePicker({ id, label, placeholder, opts, value, onChange }: {
  id: string; label: string; placeholder: string; opts: PlaceOpt[]; value: PlaceOpt | null; onChange: (p: PlaceOpt | null) => void;
}) {
  const [text, setText] = useState(value?.base ?? '');
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(-1);
  useEffect(() => { setText(value?.base ?? ''); }, [value]);
  const list = useMemo(() => {
    const q = foldName(text.trim()); if (!q || !open) return [];
    const starts = opts.filter((o) => o.key.startsWith(q)), incl = opts.filter((o) => !o.key.startsWith(q) && o.key.includes(q));
    return starts.concat(incl).slice(0, 30);
  }, [text, open, opts]);
  const choose = (o: PlaceOpt | null) => { onChange(o); setOpen(false); setAct(-1); };
  return (
    <div className={s.f}>
      <label htmlFor={id}>{label}</label>
      <div className={s.pk}>
        <input id={id} value={text} placeholder={placeholder} autoComplete="off"
          onChange={(e) => { setText(e.target.value); setOpen(true); if (!e.target.value.trim()) onChange(null); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); if (!value && list.length && text.trim()) choose(list[0]); }, 120)}
          onKeyDown={(e) => {
            if (!list.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setAct((a) => Math.min(a + 1, list.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); choose(list[act < 0 ? 0 : act]); }
          }} />
        {list.length > 0 && (
          <ul role="listbox">
            {list.map((o, i) => (
              <li key={o.name + (o.district ?? '')} role="option" aria-selected={i === act} className={i === act ? s.act : undefined}
                onMouseDown={(e) => { e.preventDefault(); choose(o); }}>
                <span><b>{o.base}</b> <span className={s.ty}>{o.ty}</span></span>
                <span className={s.r}>{o.district ? `r. ${o.district}` : isIntersection(o.name) ? 'intersecție pe drum' : 'raion ?'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <small>{value ? (isIntersection(value.name) ? 'intersecție pe drum, nu localitate' : `${value.ty || 'punct'}${value.district ? `, raionul ${value.district}` : ', raion nedeterminat'}`) : ''}</small>
    </div>
  );
}

/* ---------- firme: listă alfabetică, mai multe deodată ---------- */
function FirmPicker({ all, chosen, ours, onChange }: { all: string[]; chosen: string[]; ours: string; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const clean = (x: string) => foldName(x).replace(/[".]/g, '');
  const list = useMemo(() => {
    if (!open) return [];
    const q = clean(text);
    return all.filter((f) => !chosen.includes(f) && (!q || clean(f).includes(q))).slice(0, 60);
  }, [text, open, all, chosen]);
  const add = (f: string) => { onChange([...chosen, f]); setText(''); setOpen(false); };
  return (
    <div className={`${s.f} ${s.firm}`}>
      <label htmlFor="firm">Firma (una sau mai multe)</label>
      <div className={s.pk}>
        <input id="firm" value={text} placeholder="scrie primele litere…" autoComplete="off"
          onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && list.length) { e.preventDefault(); add(list[0]); }
            if (e.key === 'Backspace' && !text && chosen.length) onChange(chosen.slice(0, -1));
          }} />
        {list.length > 0 && (
          <ul role="listbox">
            {list.map((f) => <li key={f} role="option" onMouseDown={(e) => { e.preventDefault(); add(f); }}><span>{f === ours ? '★ ' : ''}{f}</span></li>)}
          </ul>
        )}
      </div>
      <div className={s.chips}>
        {chosen.map((f) => (
          <span key={f} className={`${s.chip} ${f === ours ? s.ours : ''}`}>{f}<button type="button" aria-label="Scoate" onClick={() => onChange(chosen.filter((x) => x !== f))}>✕</button></span>
        ))}
      </div>
    </div>
  );
}

/* ---------- pagina ---------- */
export default function ConcurentaClient({ init }: { init: ConcurentaInit }) {
  const opts = useMemo(() => toOpts(init.places), [init.places]);
  const firms = useMemo(() => {
    const all = init.operators.map((o) => o.operator).sort((a, b) => a.localeCompare(b, 'ro'));
    return all.includes(init.ourOperator) ? [init.ourOperator, ...all.filter((f) => f !== init.ourOperator)] : all;
  }, [init.operators, init.ourOperator]);
  const rate = init.rate?.value ?? null;

  const [from, setFrom] = useState<PlaceOpt | null>(() => opts.find((o) => o.name === 'or. Chisinau') ?? null);
  const [to, setTo] = useState<PlaceOpt | null>(() => opts.find((o) => o.name === 'or. Briceni' && o.district === 'Briceni') ?? opts.find((o) => o.name === 'or. Briceni') ?? null);
  const [chosenFirms, setChosenFirms] = useState<string[]>([]);
  const [courses, setCourses] = useState<AntaCourse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Row | null>(null);
  const [dir, setDir] = useState<Dir>('tur');
  const [pending, start] = useTransition();
  const reqId = useRef(0);

  useEffect(() => {
    setSel(null);
    if (!from) { setCourses([]); return; }
    const id = ++reqId.current;
    start(async () => {
      try {
        const data = await searchCourses({ name: from.name, district: from.district }, to ? { name: to.name, district: to.district } : null);
        if (id === reqId.current) { setCourses(data); setError(null); }
      } catch (e) { if (id === reqId.current) setError(e instanceof Error ? e.message : String(e)); }
    });
  }, [from, to]);

  const rows = useMemo<Row[]>(() => {
    if (!from) return [];
    const out: Row[] = [];
    for (const c of courses) {
      if (chosenFirms.length && !chosenFirms.includes(c.operator)) continue;
      const si = c.stops.findIndex((st) => matchStop(st, from)); if (si < 0) continue;
      const ti = to ? c.stops.findIndex((st) => matchStop(st, to)) : -1; if (to && ti < 0) continue;
      const dirs: Dir[] = to ? [ti > si ? 'tur' : 'retur'] : ['tur', 'retur'];
      for (const d of dirs) {
        const fwd = d === 'tur'; const ei = to ? ti : fwd ? c.stops.length - 1 : 0; if (ei === si) continue;
        const f = c.stops[si], e = c.stops[ei];
        const dep = fwd ? f.time_tur : f.time_retur, arr = fwd ? e.time_tur : e.time_retur; if (!dep) continue;
        const km = Math.abs(e.km_tur - f.km_tur);
        out.push({ course: c, dir: d, dep, arr, from: f, to: e, km, lei: price(km, rate), terminus: c.stops[fwd ? c.stops.length - 1 : 0].name });
      }
    }
    return out.sort((a, b) => mins(a.dep) - mins(b.dep));
  }, [courses, from, to, chosenFirms, rate]);

  const ours = rows.filter((r) => r.course.operator === init.ourOperator).length;
  const openRow = (r: Row) => { setSel(r); setDir(r.dir); };

  return (
    <div className={`page-wide ${s.wrap}`}>
      <div className="page-header">
        <h1>Concurența pe direcție</h1>
        <p className="text-sm text-muted-foreground">
          {init.counts.courses.toLocaleString('ro-RO')} curse · {init.operators.length} firme · {init.places.length.toLocaleString('ro-RO')} puncte · graficul ANTA + {init.counts.ours} curse ale noastre
        </p>
      </div>

      <form className={s.form} onSubmit={(e) => e.preventDefault()}>
        <PlacePicker id="from" label="De unde" placeholder="localitate…" opts={opts} value={from} onChange={setFrom} />
        <button type="button" className={s.swap} title="Schimbă direcția" aria-label="Schimbă direcția" onClick={() => { const a = from; setFrom(to); setTo(a); }}>⇄</button>
        <PlacePicker id="to" label="Încotro" placeholder="orice punct" opts={opts} value={to} onChange={setTo} />
        <FirmPicker all={firms} chosen={chosenFirms} ours={init.ourOperator} onChange={setChosenFirms} />
      </form>
      <p className={s.hint}>
        Toate cursele care trec prin ambele puncte în sensul ales, oricare le-ar fi capătul. Bilet = km × {init.rate ? `${init.rate.value.toFixed(2)} lei/km (tarif ANTA din ${init.rate.from})` : 'tarif (lipsește din tariff_periods)'}, rotunjit la leu.
        Graficul ANTA n-are zilele de circulație. Cursele noastre vin din baza translux.md, nu din fișierul ANTA.
      </p>

      <div className={`${s.main} ${sel ? '' : s.solo}`}>
        <section className={s.list}>
          <div className={s.sum}>
            <h2>
              {from ? <><em>{from.base}</em>{from.district && <span className={s.raion}> r. {from.district}</span>}</> : 'Alege punctul de plecare'}
              {from && <> → {to ? <><em>{to.base}</em>{to.district && <span className={s.raion}> r. {to.district}</span>}</> : 'toate direcțiile'}</>}
            </h2>
            <span className={s.n}>
              {pending ? 'se caută…' : `${rows.length} curse`}{chosenFirms.length ? ` · ${chosenFirms.length} firme alese` : ''}
              {ours > 0 && <> · <span className={s.legend}><i />{ours} ale noastre</span></>}
            </span>
          </div>
          {error && <p className={s.empty}>Eroare: {error}</p>}
          {!from && <p className={s.empty}>Scrie o localitate în <b>De unde</b> și alege-o din listă: numele repetate apar cu raionul lor (Briceni oraș, r. Briceni ≠ Briceni sat, r. Dondușeni).</p>}
          {from && !pending && !rows.length && !error && <p className={s.empty}>Nicio cursă între aceste puncte{chosenFirms.length ? ' pentru firmele alese' : ''}.</p>}
          {rows.length > 0 && (
            <table className={s.tt}>
              <thead><tr><th className={s.num}>#</th><th>Plecare</th><th>Pornire înapoi</th><th>Bilet</th><th>Ruta</th><th className={s.hideM}>Firma</th><th className={s.hideM}>Cod</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const mine = r.course.operator === init.ourOperator;
                  const isSel = sel === r;
                  return (
                    <tr key={`${r.course.id}-${r.dir}-${i}`} className={`${s.row} ${mine ? s.ours : ''} ${isSel ? s.sel : ''}`} tabIndex={0}
                      onClick={() => openRow(r)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(r); } }}>
                      <td className={s.num}>{i + 1}</td>
                      <td><div className={s.t1}>{pad(r.dep)}</div><div className={s.t2}>{r.from.name}{r.from.note ? ` · ${r.from.note}` : ''}</div></td>
                      <td><div className={s.t1}>{pad(r.dir === 'tur' ? r.course.dep_retur : r.course.dep_tur)}</div><div className={s.t2}>din {r.terminus}</div></td>
                      <td><div className={s.price}>{r.lei ? `${r.lei} lei` : '—'}</div><div className={s.t2}>{r.km} km</div></td>
                      <td><div className={s.route}>{r.course.route_name}</div><div className={s.dir}>{r.dir} · spre {r.terminus} · {r.course.stops.length} opriri</div></td>
                      <td className={`${s.hideM} ${s.op}`}>{r.course.operator}{mine && <span className={s.pill}>NOI</span>}</td>
                      <td className={`${s.hideM} ${s.code}`}>{r.course.source === 'tlx' ? 'translux.md' : r.course.code}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {sel && <Detail row={sel} dir={dir} setDir={setDir} rate={init.rate} ours={init.ourOperator} onClose={() => setSel(null)} />}
      </div>
    </div>
  );
}

/* ---------- detaliul cursei: opririle tur și retur, km și bilet de la urcare ---------- */
function Detail({ row, dir, setDir, rate, ours, onClose }: {
  row: Row; dir: Dir; setDir: (d: Dir) => void; rate: ConcurentaInit['rate']; ours: string; onClose: () => void;
}) {
  const c = row.course;
  const fwd = dir === 'tur';
  const list = fwd ? c.stops : [...c.stops].reverse();
  const first = c.stops[0], last = c.stops[c.stops.length - 1];
  const bi = dir === row.dir ? Math.max(list.indexOf(row.from), 0) : 0;   // punctul de urcare
  const board = list[bi];
  const r = rate?.value ?? null;
  return (
    <aside className={s.det}>
      <button type="button" className={s.close} aria-label="Închide" onClick={onClose}>✕</button>
      <div className={s.k}>{c.source === 'tlx' ? 'translux.md' : c.code}</div>
      <h3>{c.route_name}</h3>
      <div className={s.meta}><span>{c.operator}{c.operator === ours && <span className={s.pill}>NOI</span>}</span><span>{last.km_tur} km toată ruta</span><span>{c.stops.length} opriri</span></div>
      <div className={s.tabs}>
        <button type="button" className={fwd ? s.on : ''} onClick={() => setDir('tur')}>{first.name} → {last.name}<small>pleacă {pad(c.dep_tur)}, sosește {pad(last.time_tur)}</small></button>
        <button type="button" className={!fwd ? s.on : ''} onClick={() => setDir('retur')}>{last.name} → {first.name}<small>pleacă {pad(c.dep_retur)}, sosește {pad(first.time_retur)}</small></button>
      </div>
      <div className={s.rate}>Bilet de la <b>{board.name}</b> · km × <b>{r ? r.toFixed(2) : '?'}</b> lei/km{rate ? ` (tarif ANTA din ${rate.from})` : ''}, rotunjit la leu{c.source === 'tlx' ? ' · ore și km din translux.md' : ''}</div>
      <div className={s.hd}><span>ora</span><span /><span>oprire</span><span>km</span><span>bilet</span></div>
      <ol className={s.stops}>
        {list.map((st, i) => {
          const t = fwd ? st.time_tur : st.time_retur;
          const km = Math.abs(st.km_tur - board.km_tur);
          const cls = [i === 0 || i === list.length - 1 ? s.end : '', st === row.from || st === row.to ? s.hit : '', i < bi ? s.before : ''].join(' ');
          return (
            <li key={st.seq} className={cls}>
              <span className={s.tm}>{pad(t)}</span><span className={s.dot} />
              <span className={s.nm}>{st.name}{st.district && <span className={s.raion}> r. {st.district}</span>}{st.note && <small>{st.note}</small>}</span>
              <span className={s.km}>{i > bi ? km : i === bi ? '0' : ''}</span>
              <span className={s.pr}>{i > bi ? <><b>{price(km, r)}</b> lei</> : i === bi ? 'urcare' : ''}</span>
            </li>
          );
        })}
      </ol>
      <div className={s.foot}>Km și ore din graficul ANTA (la cursele noastre — din translux.md); km sunt de la punctul de urcare. Opririle absente pe unele rute lungi lipsesc și în fișierul ANTA.</div>
    </aside>
  );
}
