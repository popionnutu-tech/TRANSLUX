import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Scoring statistic operatori peron: index 100 = norma zilei (fereastră ±21 zile × zi-a-săptămânii × meteo),
// zilele externe (sărbători / vârfuri / date incomplete) excluse. Sursa: operator_period_scores /
// operator_day_scores, recalculate nightly de operator_scoring_recompute() (pg_cron 02:30 UTC).

type PeriodKey = '28d' | 'quarter' | 'all';

interface ScoreRow {
  operator_id: string;
  point: string;
  period_key: string;
  index_100: number | null;
  raw_index: number | null;
  n_days: number | null;
  ci_low: number | null;
  ci_high: number | null;
  significant: boolean | null;
  users: { name: string | null; username: string | null } | null;
}

interface DayRow {
  point: string;
  score_date: string;
  operator_id: string | null;
  actual_pas: number | null;
  expected_pas: number | null;
  ratio: number | null;
  trips_ok: number | null;
  excluded: boolean;
  exclude_reason: string | null;
  wx: string | null;
  precip_mm: number | null;
  temp_max: number | null;
  users: { name: string | null; username: string | null } | null;
}

const POINTS = ['CHISINAU', 'BALTI'] as const;
const POINT_LABEL: Record<string, string> = { CHISINAU: 'Chișinău', BALTI: 'Bălți' };
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '28d', label: 'Ultimele 28 zile' },
  { key: 'quarter', label: 'Trimestrul curent' },
  { key: 'all', label: 'Tot istoricul' },
];
const WX_ICON: Record<string, string> = { rain: '🌧', heavy_rain: '⛈', heat: '🔥' };
const REASON_LABEL: Record<string, string> = {
  holiday: 'sărbătoare',
  holiday_adjacent: 'lângă sărbătoare',
  spike: 'vârf extern',
  low_coverage: 'date incomplete',
  no_trips: 'fără curse',
  short_window: 'istoric scurt',
};

function opName(u: { name: string | null; username: string | null } | null): string {
  return u?.name || u?.username || '—';
}

function idxColor(v: number | null): string {
  if (v == null) return 'var(--text-muted)';
  if (v >= 103) return 'var(--success)';
  if (v <= 97) return 'var(--danger)';
  return '#333';
}

/** Sparkline SVG: media ratio pe săptămâni ISO (ultimele ~12 săpt. cu date). */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <span className="text-muted" style={{ fontSize: 11 }}>—</span>;
  const w = 110, h = 26, pad = 2;
  const min = Math.min(...points, 0.9), max = Math.max(...points, 1.1);
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = (v: number) => h - pad - ((v - min) * (h - 2 * pad)) / (max - min || 1);
  const line = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <line x1={pad} y1={y(1)} x2={w - pad} y2={y(1)} stroke="rgba(155,27,48,0.25)" strokeDasharray="3,3" />
      <polyline points={line} fill="none" stroke="#9B1B30" strokeWidth="1.5" />
    </svg>
  );
}

export default async function OperatoriPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const period: PeriodKey = p === '28d' || p === 'quarter' ? p : 'all';
  const sb = getSupabase();

  const [{ data: scoresData }, { data: daysData }] = await Promise.all([
    sb.from('operator_period_scores')
      .select('*, users(name, username)')
      .eq('period_key', period)
      .order('index_100', { ascending: false }),
    sb.from('operator_day_scores')
      .select('*, users(name, username)')
      .order('score_date', { ascending: false })
      .limit(400),
  ]);

  const scores = (scoresData ?? []) as unknown as ScoreRow[];
  const days = (daysData ?? []) as unknown as DayRow[];

  // Sparkline: media ratio per operator per săptămână ISO (doar zilele scored)
  const weekly = new Map<string, Map<string, { sum: number; n: number }>>(); // operator_id -> week -> agg
  for (const d of days) {
    if (d.excluded || d.ratio == null || !d.operator_id) continue;
    const dt = new Date(d.score_date + 'T00:00:00Z');
    const th = new Date(dt); th.setUTCDate(th.getUTCDate() + 4 - (th.getUTCDay() || 7));
    const y = th.getUTCFullYear();
    const week = Math.ceil((((th.getTime() - Date.UTC(y, 0, 1)) / 86400000) + 1) / 7);
    const wk = `${y}-${String(week).padStart(2, '0')}`;
    if (!weekly.has(d.operator_id)) weekly.set(d.operator_id, new Map());
    const m = weekly.get(d.operator_id)!;
    const cur = m.get(wk) ?? { sum: 0, n: 0 };
    cur.sum += Number(d.ratio); cur.n += 1;
    m.set(wk, cur);
  }
  function sparkFor(operatorId: string): number[] {
    const m = weekly.get(operatorId);
    if (!m) return [];
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([, v]) => v.sum / v.n);
  }

  const recentDays = days.filter(d => !d.excluded).slice(0, 42);
  const excludedDays = days.filter(d => d.excluded);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Operatori peron — scoring</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERIODS.map(pp => (
            <Link key={pp.key} href={`/analytics/operatori?p=${pp.key}`}
              className={`btn ${period === pp.key ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: 13, padding: '6px 14px' }}>
              {pp.label}
            </Link>
          ))}
        </div>
      </div>

      <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Index 100 = norma zilei lucrate (aceeași perioadă ±21 zile, aceeași zi a săptămânii, aceeași vreme,
        același număr de curse ieșite). Peste 100 = peste normă. Sărbătorile, vârfurile externe și zilele cu
        date incomplete nu se pun în socoteală nimănui. Indexul e temperat statistic pentru operatorii cu
        puține zile («semnificativ» = diferența e reală, nu întâmplare).
      </p>

      {POINTS.map(pt => {
        const rows = scores.filter(s => s.point === pt);
        return (
          <div className="card" key={pt} style={{ marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>{POINT_LABEL[pt]}</h3>
            {rows.length === 0 ? (
              <p className="text-muted">Fără date pe perioada selectată.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Operator</th>
                    <th>Index</th>
                    <th>Zile</th>
                    <th>Interval încredere</th>
                    <th>Concluzie</th>
                    <th>Trend (săpt.)</th>
                    <th>Index brut</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(s => (
                    <tr key={s.operator_id}>
                      <td><strong>{opName(s.users)}</strong></td>
                      <td style={{ color: idxColor(s.index_100), fontWeight: 700, fontSize: 16 }}>
                        {s.index_100 ?? '—'}
                      </td>
                      <td>{s.n_days ?? '—'}</td>
                      <td className="text-muted" style={{ fontSize: 12 }}>
                        {s.ci_low != null && s.ci_high != null ? `${s.ci_low} – ${s.ci_high}` : '—'}
                      </td>
                      <td>
                        {s.significant
                          ? <span className="badge badge-ok">semnificativ</span>
                          : <span className="text-muted" style={{ fontSize: 12 }}>poate fi întâmplare</span>}
                      </td>
                      <td><Sparkline points={sparkFor(s.operator_id)} /></td>
                      <td className="text-muted" style={{ fontSize: 12 }}>{s.raw_index ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Ultimele zile (real vs normă)</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Data</th><th>Punct</th><th>Operator</th><th>Real</th><th>Norma zilei</th><th>Scor zi</th><th>Meteo</th>
            </tr>
          </thead>
          <tbody>
            {recentDays.map(d => (
              <tr key={`${d.point}-${d.score_date}`}>
                <td>{d.score_date}</td>
                <td>{POINT_LABEL[d.point] ?? d.point}</td>
                <td>{opName(d.users)}</td>
                <td><strong>{d.actual_pas != null ? Math.round(Number(d.actual_pas)) : '—'}</strong></td>
                <td className="text-muted">{d.expected_pas != null ? Math.round(Number(d.expected_pas)) : '—'}</td>
                <td style={{ color: idxColor(d.ratio != null ? Number(d.ratio) * 100 : null), fontWeight: 600 }}>
                  {d.ratio != null ? Math.round(Number(d.ratio) * 100) : '—'}
                </td>
                <td style={{ fontSize: 12 }}>
                  {WX_ICON[d.wx ?? ''] ?? ''} {d.temp_max != null ? `${Math.round(Number(d.temp_max))}°` : ''}
                  {d.precip_mm != null && Number(d.precip_mm) >= 1 ? ` ${d.precip_mm}mm` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Zile excluse din socoteală (transparență)</h3>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 0 }}>
          Aceste zile nu intră nici în norme, nici în scorul operatorilor.
        </p>
        <table className="table">
          <thead>
            <tr><th>Data</th><th>Punct</th><th>Motiv</th><th>Real</th><th>Norma estimată</th></tr>
          </thead>
          <tbody>
            {excludedDays.map(d => (
              <tr key={`${d.point}-${d.score_date}`}>
                <td>{d.score_date}</td>
                <td>{POINT_LABEL[d.point] ?? d.point}</td>
                <td><span className="badge badge-absent">{REASON_LABEL[d.exclude_reason ?? ''] ?? d.exclude_reason}</span></td>
                <td>{d.actual_pas != null ? Math.round(Number(d.actual_pas)) : '—'}</td>
                <td className="text-muted">{d.expected_pas != null ? Math.round(Number(d.expected_pas)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
