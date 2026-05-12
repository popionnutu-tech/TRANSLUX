'use client';

interface ChartPoint {
  label: string;
  value: number | null;
}

export interface ChartSeries {
  label: string;
  color: string;
  data: ChartPoint[];
}

interface Props {
  series: ChartSeries[];
}

export default function PassengersChart({ series }: Props) {
  const primary = series[0];
  if (!primary || primary.data.length === 0) return null;

  const W = 800;
  const H = 200;
  const P = { t: 15, r: 20, b: 40, l: 50 };
  const plotW = W - P.l - P.r;
  const plotH = H - P.t - P.b;

  const allVals: number[] = [];
  for (const s of series) for (const d of s.data) if (d.value != null) allVals.push(d.value);
  const maxRaw = Math.max(...allVals, 1);
  const niceMax = Math.ceil((maxRaw * 1.15) / 10) * 10 || 10;

  const n = primary.data.length;
  const xStep = n > 1 ? plotW / (n - 1) : 0;
  const toX = (i: number) => P.l + (n > 1 ? i * xStep : plotW / 2);
  const toY = (v: number) => P.t + plotH - (v / niceMax) * plotH;

  function mkPath(pts: ChartPoint[]): string {
    const slice = pts.slice(0, n);
    let path = '';
    let started = false;
    slice.forEach((d, i) => {
      if (d.value == null) {
        started = false;
        return;
      }
      path += `${started ? 'L' : 'M'}${toX(i).toFixed(1)},${toY(d.value).toFixed(1)} `;
      started = true;
    });
    return path.trim();
  }

  const primaryPath = mkPath(primary.data);
  const areaPath =
    n > 1 && primary.data.every((d) => d.value != null)
      ? primaryPath + ` L${toX(n - 1).toFixed(1)},${(P.t + plotH).toFixed(1)} L${toX(0).toFixed(1)},${(P.t + plotH).toFixed(1)} Z`
      : '';

  const yTicks = 5;
  const grid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = Math.round((niceMax / yTicks) * i);
    return { val, y: toY(val) };
  });

  const showEvery = Math.max(1, Math.ceil(n / 14));

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, fontSize: 11, color: '#666', marginBottom: 8, flexWrap: 'wrap' }}>
        {series.map((s, idx) => (
          <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 20, height: 3, background: s.color, borderRadius: 2, display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primary.color} stopOpacity="0.1" />
            <stop offset="100%" stopColor={primary.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {grid.map(({ val, y }) => (
          <g key={val}>
            <line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#eee" strokeWidth="1" />
            <text x={P.l - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#aaa">{val}</text>
          </g>
        ))}

        <line x1={P.l} y1={P.t + plotH} x2={W - P.r} y2={P.t + plotH} stroke="#ddd" strokeWidth="1" />

        {areaPath && <path d={areaPath} fill="url(#chartArea)" />}

        {series.slice(1).map((s, sIdx) => {
          const path = mkPath(s.data);
          if (!path) return null;
          return (
            <g key={`s${sIdx + 1}`}>
              <path d={path} fill="none" stroke={s.color} strokeWidth="1.5" strokeOpacity="0.8" strokeLinejoin="round" strokeLinecap="round" />
              {s.data.slice(0, n).map((d, i) =>
                d.value == null ? null : (
                  <circle key={`s${sIdx + 1}p${i}`} cx={toX(i)} cy={toY(d.value)} r="2.5" fill={s.color} fillOpacity="0.8" />
                )
              )}
            </g>
          );
        })}

        <path d={primaryPath} fill="none" stroke={primary.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {primary.data.map((d, i) =>
          d.value == null ? null : (
            <circle key={`m${i}`} cx={toX(i)} cy={toY(d.value)} r="3.5" fill={primary.color} />
          )
        )}

        {primary.data.map((d, i) => {
          if (n > 1 && i % showEvery !== 0 && i !== n - 1) return null;
          return (
            <text key={`x${i}`} x={toX(i)} y={H - P.b + 16} textAnchor="middle" fontSize="10" fill="#aaa">
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
