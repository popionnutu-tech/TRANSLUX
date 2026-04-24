export function formatLei(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(n) + ' lei';
}

export function formatPct(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

export function devColor(pct: number | null | undefined) {
  if (pct === null || pct === undefined) return 'text-slate-400';
  if (pct >= 5) return 'text-emerald-700 bg-emerald-50';
  if (pct >= 0) return 'text-emerald-600';
  if (pct >= -5) return 'text-amber-600';
  return 'text-red-700 bg-red-50';
}

export function devBgColor(pct: number | null | undefined) {
  if (pct === null || pct === undefined) return 'bg-slate-100';
  if (pct >= 10) return 'bg-emerald-500 text-white';
  if (pct >= 5) return 'bg-emerald-200';
  if (pct >= 0) return 'bg-emerald-50';
  if (pct >= -5) return 'bg-amber-50';
  if (pct >= -10) return 'bg-orange-200';
  return 'bg-red-500 text-white';
}
