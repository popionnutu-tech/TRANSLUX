'use client';

// Alegerea perioadei în rapoartele ION-167: o lună din listă sau o perioadă liberă (de la – până la).

import type { DateRange } from './periods';
import { monthLabel } from './periods';
import { monthBounds } from './raport';

const inputStyle: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, fontSize: 13, background: '#fff',
  width: 'auto', flex: '0 0 auto',
};

export function perioadaLabel(r: DateRange): string {
  const m = r.from.slice(0, 7);
  const b = monthBounds(m);
  if (b.from === r.from && b.to === r.to) return monthLabel(m);
  return `${r.from.slice(8, 10)}.${r.from.slice(5, 7)} – ${r.to.slice(8, 10)}.${r.to.slice(5, 7)}.${r.to.slice(0, 4)}`;
}

export default function PerioadaPicker({ label, months, value, onChange, dateMin, dateMax }: {
  label?: string; months: string[]; value: DateRange; onChange: (r: DateRange) => void; dateMin: string; dateMax: string;
}) {
  const m = value.from.slice(0, 7);
  const b = monthBounds(m);
  const isMonth = b.from === value.from && b.to === value.to;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {label && <span style={{ fontSize: 13, color: '#777' }}>{label}</span>}
      <select value={isMonth ? m : ''} style={inputStyle}
        onChange={e => { if (e.target.value) onChange(monthBounds(e.target.value)); }}>
        {!isMonth && <option value="">Perioadă liberă</option>}
        {months.map(x => <option key={x} value={x}>{monthLabel(x)}</option>)}
      </select>
      <input type="date" value={value.from} min={dateMin} max={value.to} style={inputStyle}
        onChange={e => { if (e.target.value) onChange({ ...value, from: e.target.value }); }} />
      <span style={{ color: '#999' }}>→</span>
      <input type="date" value={value.to} min={value.from} max={dateMax} style={inputStyle}
        onChange={e => { if (e.target.value) onChange({ ...value, to: e.target.value }); }} />
    </div>
  );
}
