'use client';

interface ChartPoint {
  label: string;
  value: number;
}

interface Props {
  data: ChartPoint[];
  comparisonData: ChartPoint[];
  showComparison: boolean;
  currentLabel: string;
  comparisonLabel: string;
}

export default function PassengersChart({ data, comparisonData, showComparison, currentLabel, comparisonLabel }: Props) {
  if (data.length === 0) return null;

  const W = 800;
  const H = 200;
  const P = { t: 15, r: 20, b: 40, l: 50 };
  const plotW = W - P.l - P.r;
  const plotH = H - P.t - P.b;

  const allVals = data.map((d) => d.value);
  if (showComparison && comparisonData.length) allVals.push(...comparisonData.map((d) => d.value));
  const maxRaw = Math.max(...allVals, 1);
  const niceMax = Math.ceil((maxRaw * 1.15) / 10) * 10 || 10;

  const n = data.length;
  const xStep = n > 1 ? plotW / (n - 1) : 0;
  const toX = (i: number) => P.l + (n > 1 ? i * xStep : plotW / 2);
  const toY = (v: number) => P.t + plotH - (v / niceMax) * plotH;

  const mkPath = (pts: ChartPoint[]) =>
    pts.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.value).toFixed(1)}`).join(' ');

  const mainPath = mkPath(data);
  const areaPath =
    n > 1
      ? mainPath + ` L${toX(n - 1).toFixed(1)},${(P.t + plotH).toFixed(1)} L${toX(0).toFixed(1)},${(P.t + plotH).toFixed(1)} Z`
      : '';

  const compSlice = comparisonData.slice(0, n);
  const compPath = showComparison && compSlice.length > 0 ? mkPath(compSlice) : '';

  const yTicks = 5;
  const grid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = Math.round((niceMax / yTicks) * i);
    return { val, y: toY(val) };
  });

  const showEvery = Math.max(1, Math.ceil(n / 14));

  return (
    <div>
      {showComparison && (
        <div style={{ display: 'flex', gap: 24, fontSize: 11, color: '#888', marginBottom: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 20, height: 3, background: '#D42027', borderRadius: 2, display: 'inline-block' }} />
            {currentLabel}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 20, height: 0, borderTop: '2px dashed #bbb', display: 'inline-block' }} />
            {comparisonLabel}
          </span>
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D42027" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#D42027" stopOpacity="0" />
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

        {compPath && (
          <>
            <path d={compPath} fill="none" stroke="#ccc" strokeWidth="1.5" strokeDasharray="6 4" />
            {compSlice.map((d, i) => (
              <circle key={`c${i}`} cx={toX(i)} cy={toY(d.value)} r="2.5" fill="#ccc" />
            ))}
          </>
        )}

        <path d={mainPath} fill="none" stroke="#D42027" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle key={`m${i}`} cx={toX(i)} cy={toY(d.value)} r="3.5" fill="#D42027" />
        ))}

        {data.map((d, i) => {
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
