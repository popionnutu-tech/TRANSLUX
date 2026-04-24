export function formatLei(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(n) + ' lei';
}

export function formatPct(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

/** Text color for deviation % — matches TRANSLUX palette */
export function devTextColor(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return 'var(--text-muted)';
  if (pct >= 5) return 'var(--success)';
  if (pct >= 0) return 'var(--success)';
  if (pct >= -5) return 'var(--warning)';
  return 'var(--danger)';
}

/** Background color for heatmap cells — TRANSLUX dim gradient */
export function devBgStyle(pct: number | null | undefined): React.CSSProperties {
  if (pct === null || pct === undefined) {
    return { background: 'rgba(0,0,0,0.02)', color: 'var(--text-muted)' };
  }
  if (pct >= 10) return { background: 'var(--success)', color: '#fff' };
  if (pct >= 5) return { background: 'rgba(22,163,74,0.22)', color: 'var(--success)' };
  if (pct >= 0) return { background: 'var(--success-dim)', color: 'var(--success)' };
  if (pct >= -5) return { background: 'var(--warning-dim)', color: 'var(--warning)' };
  if (pct >= -10) return { background: 'rgba(217,119,6,0.22)', color: 'var(--warning)' };
  return { background: 'var(--danger)', color: '#fff' };
}
