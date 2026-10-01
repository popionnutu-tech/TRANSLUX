'use client';

// Grafice SVG simple pentru «Bilete aparat» (fără bibliotecă, ca restul panoului — vezi analytics/AnalyticsClient.tsx).
// Serii: paleta categorială validată (albastru, portocaliu, aqua — trece verificarea CVD pentru 3 serii), mereu cu
// legendă; tabelul de sub grafic dă cifrele exacte.

import { useEffect, useId, useRef, useState } from 'react';

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];
export const BRAND = '#9B1B30';
const GRID = 'rgba(0,0,0,0.06)';
const INK_MUTED = '#777';

const nf = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

interface Tip { x: number; y: number; lines: string[] }

/** Lățimea reală a containerului, ca SVG-ul să fie desenat la 1:1 (text nedeformat, fără spațiu gol). */
function useWidth(ref: React.RefObject<HTMLDivElement | null>, fallback = 900) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(e => setW(Math.max(280, Math.round(e[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x + 12, 0), width - 190);
  return (
    <div style={{
      position: 'absolute', left, top: Math.max(tip.y - 10, 0), pointerEvents: 'none',
      background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 6, padding: '6px 8px',
      fontSize: 12, color: '#333', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', minWidth: 150, zIndex: 5,
    }}>
      {tip.lines.map((l, i) => <div key={i} style={{ fontWeight: i === 0 ? 600 : 400 }}>{l}</div>)}
    </div>
  );
}

// ─── ION-159: culorile tipului de client și siguranța cifrei ───
// Culoarea = tipul de client (TIKI albastru, ceilalți portocaliu — perechea validată CVD ΔE 24,7);
// siguranța = forma: plin = sigur, pal = interval, liniuță la capăt = «cel puțin», gri hașurat = nu știm («?») /
// nu se potrivește («!»). Gri-ul nu e o serie; culorile de stare nu se folosesc aici.

export const TIKI = SERIES[0];
export const OTHERS = SERIES[1];
export const LAST_YEAR = '#a3a3a3';
const INK = '#333';
const HATCH_BG = '#ececec';
const HATCH_LINE = '#9a9a9a';

function useSvgId(prefix: string) {
  return prefix + useId().replace(/[^a-zA-Z0-9]/g, '');
}

function GreyHatch({ id }: { id: string }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill={HATCH_BG} />
      <line x1="0" y1="0" x2="0" y2="6" stroke={HATCH_LINE} strokeWidth="1.5" />
    </pattern>
  );
}

/** Mostra hașurii gri pentru legende. */
export function HatchSwatch({ w = 14, h = 10 }: { w?: number; h?: number }) {
  const id = useSvgId('hs');
  return (
    <svg width={w} height={h} aria-hidden style={{ verticalAlign: 'middle' }}>
      <defs><GreyHatch id={id} /></defs>
      <rect width={w} height={h} rx={2} fill={`url(#${id})`} />
    </svg>
  );
}

/** Celula hărții L–D: un singur albastru, deschis → închis, aceeași scară pe tot tabelul; «—» gri unde nu circulă. */
export function seqCell(v: number | null | undefined, max: number, rgb = '42,120,214'): React.CSSProperties {
  if (v == null) return { background: '#f4f4f4', color: '#aaa' };
  const t = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
  const a = 0.06 + 0.78 * t;
  return { background: `rgba(${rgb},${a.toFixed(2)})`, color: a > 0.55 ? '#fff' : '#222' };
}
export const OTHERS_RGB = '235,104,52';

function hoverTip(wrap: React.RefObject<HTMLDivElement | null>, e: React.MouseEvent, lines: string[]): Tip | null {
  const r = wrap.current?.getBoundingClientRect();
  return r ? { x: e.clientX - r.left, y: e.clientY - r.top, lines } : null;
}

/** Linie cu goluri (null = lipsă, nu zero). */
function gapPath(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = '';
  values.forEach((v, i) => {
    if (v == null) return;
    const prev = i > 0 ? values[i - 1] : null;
    d += `${prev == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  return d;
}

/** Puncte izolate (fără vecini) — altfel o săptămână singură între goluri nu se vede. */
function isolated(values: (number | null)[], i: number) {
  return values[i] != null && (i === 0 || values[i - 1] == null) && (i === values.length - 1 || values[i + 1] == null);
}

/** Sparkline pe 52 de săptămâni: anul acesta albastru, anul trecut gri, aceeași scară; golurile rămân goluri. */
export function WeekSpark({
  weeks, cur, prev, width = 120, height = 26, unit = 'bilete',
}: { weeks: string[]; cur: (number | null)[]; prev: (number | null)[]; width?: number; height?: number; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = [...cur, ...prev].filter((v): v is number => v != null);
  if (!all.length) return <span style={{ color: '#bbb' }}>—</span>;
  const max = Math.max(...all, 1);
  const n = Math.max(1, weeks.length - 1);
  const x = (i: number) => 2 + (i / n) * (width - 4);
  const y = (v: number) => height - 2 - (v / max) * (height - 4);
  const lab = (w: string) => `${w.slice(8, 10)}.${w.slice(5, 7)}`;
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <svg width={width} height={height} role="img"
        aria-label={`Ultimul an pe săptămâni, ${unit}; gri = anul trecut`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={e => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - 2) / (width - 4)) * n);
          setHover(i >= 0 && i < weeks.length ? i : null);
        }}>
        <path d={gapPath(prev, x, y)} fill="none" stroke={LAST_YEAR} strokeWidth={1.25} strokeLinejoin="round" />
        <path d={gapPath(cur, x, y)} fill="none" stroke={TIKI} strokeWidth={1.75} strokeLinejoin="round" />
        {cur.map((v, i) => v != null && isolated(cur, i) ? <circle key={i} cx={x(i)} cy={y(v)} r={1.5} fill={TIKI} /> : null)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={height} stroke="rgba(0,0,0,0.3)" />}
      </svg>
      {hover != null && (
        <span style={{
          position: 'absolute', right: '100%', top: -4, marginRight: 6, whiteSpace: 'nowrap', pointerEvents: 'none',
          background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 6, padding: '3px 6px', fontSize: 11,
          color: INK, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', zIndex: 5, textAlign: 'left',
        }}>
          Săpt. din {lab(weeks[hover])}: <b>{cur[hover] == null ? '—' : nf.format(cur[hover]!)}</b>
          {' · '}anul trecut {prev[hover] == null ? '—' : nf.format(prev[hover]!)}
        </span>
      )}
    </span>
  );
}

/**
 * Profilul zilei pe coridor: o tijă pe plecare la ora ei; Nord → Chișinău în sus, Chișinău → Nord în jos;
 * înălțimea = bilete pe plecare, aceeași scară pe toate coridoarele (`max`).
 */
export function StemProfile({
  items, max, height = 92,
}: { items: { hour: number; up: boolean; value: number | null; lines: string[] }[]; max: number; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const W = useWidth(wrap), H = height, PL = 36, PR = 8, PT = 6, PB = 6;
  const mid = PT + (H - PT - PB) / 2;
  const half = (H - PT - PB) / 2 - 2;
  const x = (h: number) => PL + (Math.max(0, Math.min(24, h)) / 24) * (W - PL - PR);
  const m = max > 0 ? max : 1;
  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
        aria-label="Plecările zilei: în sus spre Chișinău, în jos spre nord; înălțimea = bilete pe plecare"
        onMouseLeave={() => setTip(null)}>
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => (
          <g key={h}>
            <line x1={x(h)} x2={x(h)} y1={PT} y2={H - PB} stroke={GRID} />
            <text x={x(h)} y={mid - 3} textAnchor="middle" fontSize="9" fill="#aaa">{h < 24 ? `${h}` : ''}</text>
          </g>
        ))}
        <line x1={PL} x2={W - PR} y1={mid} y2={mid} stroke="rgba(0,0,0,0.18)" />
        <text x={PL - 4} y={PT + 9} textAnchor="end" fontSize="9" fill={INK_MUTED}>↑ Chiș.</text>
        <text x={PL - 4} y={H - PB - 2} textAnchor="end" fontSize="9" fill={INK_MUTED}>↓ Nord</text>
        {items.map((it, i) => {
          const len = it.value == null ? 0 : Math.max(1.5, (it.value / m) * half);
          const cx = x(it.hour);
          return (
            <g key={i}>
              {it.value == null
                ? <circle cx={cx} cy={mid} r={2.5} fill="#bbb" />
                : <rect x={cx - 2} width={4} rx={2} y={it.up ? mid - len : mid} height={len} fill={TIKI} />}
              <rect x={cx - 7} width={14} y={PT} height={H - PT - PB} fill="transparent"
                onMouseMove={e => setTip(hoverTip(wrap, e, it.lines))} />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} width={wrap.current?.clientWidth ?? 600} />
    </div>
  );
}

/**
 * Bara rutei pe scară comună (`max` = cea mai mare rută din listă): lungimea = drum făcut pe plecare (om × km).
 * TIKI plin până la minim, pal până la maxim (interval), ceilalți portocaliu până la totalul numărat; 2px între segmente.
 */
export function RouteShareBar({
  total, tikiMin, tikiMax, max, width = 220, height = 12, title,
}: { total: number; tikiMin: number; tikiMax: number; max: number; width?: number; height?: number; title?: string }) {
  const k = max > 0 ? width / max : 0;
  const t = Math.max(0, total);
  const a = Math.min(Math.max(0, tikiMin), t), b = Math.min(Math.max(a, tikiMax), t);
  const segs = [
    { from: 0, to: a, fill: TIKI, op: 1 },
    { from: a, to: b, fill: TIKI, op: 0.35 },
    { from: b, to: t, fill: OTHERS, op: 1 },
  ].filter(s => s.to - s.from > 0);
  return (
    <svg width={width} height={height} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      {segs.map((s, i) => {
        const x0 = s.from * k + (i ? 1 : 0);
        const x1 = s.to * k - (i < segs.length - 1 ? 1 : 0);
        return <rect key={i} x={x0} y={0} width={Math.max(0.5, x1 - x0)} height={height} rx={2} fill={s.fill} opacity={s.op} />;
      })}
    </svg>
  );
}

export interface DayBar {
  key: string;
  label: string;
  tiki: number | null;
  others: number | null;                                    // «cel puțin»
  state: 'ok' | 'necunoscut' | 'neconcordanta' | 'fara';   // fara = nicio plecare în acea zi
  lines: string[];
}

/** Oamenii pe zi: TIKI jos, ceilalți deasupra (cel puțin: liniuță la capăt); zi fără numărare = ciot gri hașurat «?». */
export function DayBars({ data, height = 170 }: { data: DayBar[]; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const hatch = useSvgId('db');
  const [tip, setTip] = useState<Tip | null>(null);
  const W = useWidth(wrap), H = height, PL = 40, PR = 8, PT = 18, PB = 22;
  const STUB = 14;
  const max = niceMax(Math.max(1, ...data.map(d => (d.tiki ?? 0) + (d.state === 'ok' ? d.others ?? 0 : 0))));
  const n = data.length || 1;
  const slot = (W - PL - PR) / n;
  const bw = Math.max(2, slot - Math.min(3, slot * 0.25));
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max);
  const labelEvery = Math.ceil(n / Math.max(4, Math.floor(W / 56)));
  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Oameni pe zi: TIKI și ceilalți"
        onMouseLeave={() => setTip(null)}>
        <defs><GreyHatch id={hatch} /></defs>
        {[0, max / 2, max].map(t => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={PL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill={INK_MUTED}>{nf.format(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PL + i * slot;
          const base = H - PB;
          const tTop = y(d.tiki ?? 0);
          const oTop = d.state === 'ok' && d.others ? y((d.tiki ?? 0) + d.others) : tTop;
          const r = Math.min(3, bw / 2);
          return (
            <g key={d.key}>
              {d.state !== 'fara' && (d.tiki ?? 0) > 0 && (
                <rect x={x} y={tTop} width={bw} height={Math.max(0, base - tTop)} rx={r} fill={TIKI} />
              )}
              {d.state === 'ok' && (d.others ?? 0) > 0 && (
                <>
                  <rect x={x} y={oTop} width={bw} height={Math.max(0, tTop - oTop - 2)} rx={r} fill={OTHERS} />
                  <line x1={x} x2={x + bw} y1={oTop} y2={oTop} stroke={INK} strokeWidth={1.5} />
                </>
              )}
              {(d.state === 'necunoscut' || d.state === 'neconcordanta') && (
                <>
                  <rect x={x} y={tTop - STUB - 2} width={bw} height={STUB} rx={r} fill={`url(#${hatch})`} />
                  {bw >= 7 && (
                    <text x={x + bw / 2} y={tTop - 5} textAnchor="middle" fontSize="10" fontWeight={700} fill="#555">
                      {d.state === 'necunoscut' ? '?' : '!'}
                    </text>
                  )}
                </>
              )}
              {d.state === 'fara' && (
                <text x={x + bw / 2} y={base - 3} textAnchor="middle" fontSize="10" fill="#bbb">—</text>
              )}
              <rect x={x} y={PT - 16} width={slot} height={H - PT - PB + 16} fill="transparent"
                onMouseMove={e => setTip(hoverTip(wrap, e, d.lines))} />
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill={INK_MUTED}>{d.label}</text>
              )}
            </g>
          );
        })}
        <line x1={PL} x2={W - PR} y1={H - PB} y2={H - PB} stroke="rgba(0,0,0,0.15)" />
      </svg>
      <Tooltip tip={tip} width={wrap.current?.clientWidth ?? 600} />
    </div>
  );
}

export interface StepSeg {
  x0: number; x1: number;       // km pe geografie: nordul la stânga (0), Chișinău la dreapta
  numarat: number; tikiMin: number; tikiMax: number;
  lines: string[];
}

export interface StepPanel {
  title: string;
  segs: StepSeg[];
  ticks: { x: number; label: string }[];
  marks: { x: number; up: boolean; value: number }[];   // ▲ urcă net / ▼ coboară net (ceilalți)
}

/**
 * Încărcarea pe tronsoane, în trepte (constantă pe tronson): TIKI albastru (plin până la minim, pal până la maxim),
 * ceilalți = aria portocalie până la treapta numărată; unde TIKI > numărat, gri hașurat. Panourile au aceeași scară.
 */
export function SegmentStep({ panels, length, maxY, height = 150 }: { panels: StepPanel[]; length: number; maxY: number; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const hatch = useSvgId('ss');
  const [tip, setTip] = useState<Tip | null>(null);
  const W = useWidth(wrap), H = height, PL = 40, PR = 10, PT = 8, PB = 40;
  const max = niceMax(Math.max(1, maxY));
  const L = length > 0 ? length : 1;
  const x = (km: number) => PL + (Math.max(0, Math.min(L, km)) / L) * (W - PL - PR);
  const y = (v: number) => PT + (H - PT - PB) * (1 - Math.max(0, v) / max);
  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%' }}>
      {panels.map(p => {
        let line = '';
        p.segs.forEach((s, i) => { line += `${i ? 'L' : 'M'}${x(s.x0).toFixed(1)},${y(s.numarat).toFixed(1)} L${x(s.x1).toFixed(1)},${y(s.numarat).toFixed(1)} `; });
        // etichete de oraș fără suprapunere
        let lastX = -Infinity;
        const ticks = [...p.ticks].sort((a, b) => a.x - b.x).filter(t => {
          const px = x(t.x);
          if (px - lastX < 64) return false;
          lastX = px;
          return true;
        });
        return (
          <div key={p.title} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: INK, margin: '2px 0' }}>{p.title}</div>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Încărcarea pe tronsoane, ${p.title}`}
              onMouseLeave={() => setTip(null)}>
              <defs><GreyHatch id={hatch} /></defs>
              {[0, max / 2, max].map(t => (
                <g key={t}>
                  <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={GRID} />
                  <text x={PL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill={INK_MUTED}>{nf.format(t)}</text>
                </g>
              ))}
              {p.segs.map((s, i) => {
                const xa = x(s.x0), xb = x(s.x1), w = Math.max(0, xb - xa);
                if (w <= 0) return null;
                const a = Math.min(s.tikiMin, s.numarat);
                const b = Math.min(Math.max(s.tikiMin, s.tikiMax), s.numarat);
                const over = Math.max(s.tikiMin, s.tikiMax) > s.numarat;
                return (
                  <g key={i}>
                    {a > 0 && <rect x={xa} width={w} y={y(a)} height={y(0) - y(a)} fill={TIKI} />}
                    {b > a && <rect x={xa} width={w} y={y(b)} height={y(a) - y(b)} fill={TIKI} opacity={0.35} />}
                    {s.numarat > b && <rect x={xa} width={w} y={y(s.numarat)} height={y(b) - y(s.numarat)} fill={OTHERS} opacity={0.45} />}
                    {over && (
                      <rect x={xa} width={w} y={y(Math.max(s.tikiMin, s.tikiMax))}
                        height={y(s.numarat) - y(Math.max(s.tikiMin, s.tikiMax))} fill={`url(#${hatch})`} />
                    )}
                  </g>
                );
              })}
              <path d={line} fill="none" stroke={OTHERS} strokeWidth={2} />
              {p.marks.map((m, i) => (
                <text key={i} x={x(m.x)} y={H - PB + 13} textAnchor="middle" fontSize="10" fill={m.up ? '#b4461c' : '#7a3a1c'}>
                  {m.up ? '▲' : '▼'}
                </text>
              ))}
              <line x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} stroke="rgba(0,0,0,0.2)" />
              {ticks.map((t, i) => (
                <text key={i} x={x(t.x)} y={H - 6} textAnchor="middle" fontSize="10" fill={INK_MUTED}>{t.label}</text>
              ))}
              {p.segs.map((s, i) => {
                const xa = x(s.x0), xb = x(s.x1);
                return xb - xa > 0 ? (
                  <rect key={`h${i}`} x={xa} width={xb - xa} y={PT} height={H - PT - PB} fill="transparent"
                    onMouseMove={e => setTip(hoverTip(wrap, e, s.lines))} />
                ) : null;
              })}
            </svg>
          </div>
        );
      })}
      <Tooltip tip={tip} width={wrap.current?.clientWidth ?? 600} />
    </div>
  );
}

/**
 * Anul acesta (albastru) și anul trecut (gri) pe aceeași axă — o singură măsură, niciodată a doua axă.
 * `marks` = linii verticale subțiri (ex. «preț nou»); `hollowPrev` = puncte goale ale anului trecut (luni incomplete).
 */
export function YearLines({
  labels, cur, prev, height = 130, format = (v: number) => nf.format(v), marks = [], hollowPrev, curName = 'anul acesta',
  prevName = 'anul trecut', note,
}: {
  labels: string[];
  cur: (number | null)[];
  prev?: (number | null)[];
  height?: number;
  format?: (v: number) => string;
  marks?: { i: number; label: string }[];
  hollowPrev?: (i: number) => string | null;
  curName?: string;
  prevName?: string;
  note?: (i: number) => string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [tipY, setTipY] = useState(0);
  const W = useWidth(wrap, 360), H = height, PL = 46, PR = 8, PT = 10, PB = 20;
  const pv = prev ?? [];
  const max = niceMax(Math.max(0, ...[...cur, ...pv].filter((v): v is number => v != null)));
  const n = Math.max(1, labels.length - 1);
  const x = (i: number) => PL + ((W - PL - PR) * i) / n;
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max);
  const every = Math.ceil(labels.length / Math.max(3, Math.floor((W - PL) / 46)));
  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${curName} față de ${prevName}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={e => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - PL) / (W - PL - PR)) * n);
          setHover(i >= 0 && i < labels.length ? i : null);
          setTipY(e.clientY - r.top);
        }}>
        {[0, max / 2, max].map(t => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={PL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill={INK_MUTED}>{format(t)}</text>
          </g>
        ))}
        {marks.map(m => (
          <g key={`m${m.i}`}>
            <line x1={x(m.i)} x2={x(m.i)} y1={PT} y2={H - PB} stroke="rgba(0,0,0,0.35)" strokeDasharray="2 3" />
            <text x={x(m.i) + 3} y={PT + 8} fontSize="9" fill={INK_MUTED}>{m.label}</text>
          </g>
        ))}
        {labels.map((l, i) => i % every === 0 || i === labels.length - 1 ? (
          <text key={i} x={x(i)} y={H - 5} textAnchor="middle" fontSize="10" fill={INK_MUTED}>{l}</text>
        ) : null)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} stroke="rgba(0,0,0,0.25)" />}
        {prev && <path d={gapPath(pv, x, y)} fill="none" stroke={LAST_YEAR} strokeWidth={1.5} strokeLinejoin="round" />}
        {prev && pv.map((v, i) => v == null ? null : (
          <circle key={`p${i}`} cx={x(i)} cy={y(v)} r={hollowPrev?.(i) ? 3.5 : (isolated(pv, i) || hover === i ? 2.5 : 0)}
            fill={hollowPrev?.(i) ? '#fff' : LAST_YEAR} stroke={LAST_YEAR} strokeWidth={1.5} />
        ))}
        <path d={gapPath(cur, x, y)} fill="none" stroke={TIKI} strokeWidth={2} strokeLinejoin="round" />
        {cur.map((v, i) => v == null ? null : (
          <circle key={`c${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 4 : isolated(cur, i) ? 2.5 : 0} fill={TIKI} stroke="#fff" strokeWidth={1.5} />
        ))}
      </svg>
      {hover != null && (
        <Tooltip width={wrap.current?.clientWidth ?? W} tip={{
          x: (x(hover) / W) * (wrap.current?.clientWidth ?? W), y: tipY,
          lines: [
            labels[hover],
            `${curName}: ${cur[hover] == null ? '—' : format(cur[hover]!)}`,
            ...(prev ? [`${prevName}: ${pv[hover] == null ? '—' : format(pv[hover]!)}`] : []),
            ...(hollowPrev?.(hover) ? [hollowPrev(hover)!] : []),
            ...(note?.(hover) ? [note(hover)!] : []),
          ],
        }} />
      )}
    </div>
  );
}

/** Legenda «anul acesta / anul trecut» pentru graficele mici (o dată deasupra grilei). */
export function YearLegend({ hollowNote }: { hollowNote?: string }) {
  return (
    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: INK, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 14, height: 3, borderRadius: 2, background: TIKI }} />anul acesta
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 14, height: 3, borderRadius: 2, background: LAST_YEAR }} />anul trecut
      </span>
      {hollowNote && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="3.5" fill="#fff" stroke={LAST_YEAR} strokeWidth="1.5" /></svg>
          {hollowNote}
        </span>
      )}
    </div>
  );
}

/** Bară orizontală împărțită (tur/retur, stații/dedus) cu spațiu de 2px între segmente. */
export function SplitBar({ parts, width = 120 }: { parts: { value: number; color: string; label: string }[]; width?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  let acc = 0;
  return (
    <svg width={width} height={10} role="img" aria-label={parts.map(p => `${p.label} ${nf.format(p.value)}`).join(', ')}>
      {parts.map((p, i) => {
        const w = (p.value / total) * width;
        const x = acc;
        acc += w;
        return w > 0 ? (
          <rect key={i} x={x + (i ? 1 : 0)} y={0} width={Math.max(0, w - (i ? 1 : 0) - (i < parts.length - 1 ? 1 : 0))}
            height={10} rx={2} fill={p.color}><title>{`${p.label}: ${nf.format(p.value)}`}</title></rect>
        ) : null;
      })}
    </svg>
  );
}
