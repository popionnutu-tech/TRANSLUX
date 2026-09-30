'use client';

// Grafice SVG simple pentru «Bilete aparat» (fără bibliotecă, ca restul panoului — vezi analytics/AnalyticsClient.tsx).
// Serii: o singură serie = culoarea brandului; mai multe serii = paleta categorială validată (albastru, portocaliu,
// aqua — trece verificarea CVD pentru 3 serii), mereu cu legendă; tabelul de sub grafic dă cifrele exacte.

import { useEffect, useMemo, useRef, useState } from 'react';

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

/** Bare pe zile/săptămâni. `flag` evidențiază bara (zi anormală / perioadă nesigură) cu hașură, nu doar cu culoare. */
export function BarChart({
  data, height = 180, valueLabel = 'bilete', format = (v: number) => nf.format(v),
  flag, flagLabel,
}: {
  data: { key: string; label: string; value: number; extra?: string }[];
  height?: number;
  valueLabel?: string;
  format?: (v: number) => string;
  flag?: (key: string) => boolean;
  flagLabel?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const W = useWidth(wrap), H = height, PL = 44, PR = 8, PT = 8, PB = 22;
  const max = niceMax(Math.max(0, ...data.map(d => d.value)));
  const n = data.length || 1;
  const slot = (W - PL - PR) / n;
  const bw = Math.max(1, slot - Math.min(2, slot * 0.25));
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(n / Math.max(4, Math.floor(W / 70)));
  const anyFlag = !!flag && data.some(d => flag(d.key));

  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Grafic ${valueLabel}`}
        onMouseLeave={() => setTip(null)}>
        <defs>
          <pattern id="tiki-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#d97706" opacity="0.35" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#d97706" strokeWidth="2" />
          </pattern>
        </defs>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={PL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill={INK_MUTED}>{format(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PL + i * slot;
          const flagged = flag?.(d.key);
          const h = Math.max(0, H - PB - y(d.value));
          return (
            <g key={d.key}>
              <rect x={x} y={y(d.value)} width={bw} height={h} rx={Math.min(4, bw / 2)}
                fill={flagged ? 'url(#tiki-hatch)' : BRAND} opacity={flagged ? 1 : 0.85} />
              <rect x={x} y={PT} width={slot} height={H - PT - PB} fill="transparent"
                onMouseMove={e => {
                  const r = wrap.current?.getBoundingClientRect();
                  if (!r) return;
                  setTip({
                    x: e.clientX - r.left, y: e.clientY - r.top,
                    lines: [d.label, `${format(d.value)} ${valueLabel}`, ...(d.extra ? [d.extra] : []),
                      ...(flagged && flagLabel ? [flagLabel] : [])],
                  });
                }} />
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill={INK_MUTED}>{d.label}</text>
              )}
            </g>
          );
        })}
        <line x1={PL} x2={W - PR} y1={H - PB} y2={H - PB} stroke="rgba(0,0,0,0.15)" />
      </svg>
      {anyFlag && flagLabel && (
        <div style={{ fontSize: 12, color: '#8a5a00', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <svg width="14" height="10"><rect width="14" height="10" fill="url(#tiki-hatch)" /></svg>
          ⚠ {flagLabel}
        </div>
      )}
      <Tooltip tip={tip} width={wrap.current?.clientWidth ?? 600} />
    </div>
  );
}

/** Linii pe aceeași axă (ex. aceeași lună în ani diferiți). Max. 3 serii; legendă mereu. */
export function LineChart({
  xLabels, series, height = 220, format = (v: number) => nf.format(v), unit = '',
}: {
  xLabels: string[];
  series: { name: string; values: (number | null)[] }[];
  height?: number;
  format?: (v: number) => string;
  unit?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [tipY, setTipY] = useState(0);
  const W = useWidth(wrap), H = height, PL = 52, PR = 12, PT = 10, PB = 24;
  const all = series.flatMap(s => s.values.filter((v): v is number => v != null));
  const max = niceMax(Math.max(0, ...all));
  const n = Math.max(1, xLabels.length - 1);
  const x = (i: number) => PL + ((W - PL - PR) * i) / n;
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max);
  const paths = useMemo(() => series.map(s => {
    let d = '';
    s.values.forEach((v, i) => {
      if (v == null) return;
      const prev = i > 0 ? s.values[i - 1] : null;
      d += `${prev == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    });
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [series, max, xLabels.length]);

  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        {series.map((s, i) => (
          <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#333' }}>
            <span style={{ width: 14, height: 3, borderRadius: 2, background: SERIES[i % SERIES.length] }} />{s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Grafic comparativ"
        onMouseLeave={() => setHover(null)}
        onMouseMove={e => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - PL) / (W - PL - PR)) * n);
          setHover(i >= 0 && i < xLabels.length ? i : null);
          setTipY(e.clientY - r.top);
        }}>
        {[0, max / 2, max].map(t => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={PL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill={INK_MUTED}>{format(t)}</text>
          </g>
        ))}
        {xLabels.map((l, i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={INK_MUTED}>{l}</text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} stroke="rgba(0,0,0,0.25)" />}
        {series.map((s, si) => (
          <g key={s.name}>
            <path d={paths[si]} fill="none" stroke={SERIES[si % SERIES.length]} strokeWidth={2} strokeLinejoin="round" />
            {s.values.map((v, i) => v == null ? null : (
              <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : 3} fill={SERIES[si % SERIES.length]}
                stroke="#fff" strokeWidth={2} />
            ))}
          </g>
        ))}
      </svg>
      {hover != null && (
        <Tooltip width={wrap.current?.clientWidth ?? 600} tip={{
          x: ((x(hover)) / W) * (wrap.current?.clientWidth ?? W), y: tipY,
          lines: [xLabels[hover], ...series.map(s => `${s.name}: ${s.values[hover] == null ? '—' : format(s.values[hover]!) + unit}`)],
        }} />
      )}
    </div>
  );
}

/** Tendința mică dintr-un rând de tabel. */
export function Sparkline({ values, width = 90, height = 22 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span style={{ color: '#bbb' }}>—</span>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) =>
    `${((i / (values.length - 1)) * (width - 4) + 2).toFixed(1)},${(height - 2 - ((v - min) / (max - min || 1)) * (height - 4)).toFixed(1)}`,
  ).join(' ');
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline points={pts} fill="none" stroke={BRAND} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
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
