import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { formatPct, devBgStyle } from '@/lib/moneyball/format';
import { QuarterSelect } from '@/components/moneyball/QuarterSelect';
import { UsageBox } from '@/components/moneyball/UsageBox';

export const dynamic = 'force-dynamic';

type Ranking = {
  driver_id: string;
  driver_name: string | null;
  crm_route_id: number;
  route_name: string | null;
  quarter: string;
  avg_deviation_pct: number;
  n_trips: number;
  vorp_lei: number | null;
};

type DriverTotals = {
  driver_id: string;
  driver_name: string | null;
  quarter: string;
  total_trips: number;
  vorp_total: number | null;
  weighted_avg_deviation_pct: number | null;
};

const MIN_TRIPS_PER_CELL = 3;

export default async function HeatmapRutePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = getSupabase();

  const { data: quartersData } = await supabase
    .from('v_moneyball_ranking')
    .select('quarter')
    .order('quarter', { ascending: false });

  const quarters = Array.from(new Set((quartersData ?? []).map((r) => r.quarter)));
  const currentQuarter = q ?? quarters[0] ?? '2026-Q2';

  const [{ data: rankings }, { data: totals }] = await Promise.all([
    supabase
      .from('v_moneyball_ranking')
      .select('*')
      .eq('quarter', currentQuarter)
      .gte('n_trips', MIN_TRIPS_PER_CELL),
    supabase.from('v_moneyball_driver_totals').select('*').eq('quarter', currentQuarter),
  ]);

  const rows: Ranking[] = rankings ?? [];
  const driverTotals: DriverTotals[] = totals ?? [];

  const activeDrivers = driverTotals
    .filter((d) => d.total_trips >= MIN_TRIPS_PER_CELL)
    .sort((a, b) => (b.vorp_total ?? 0) - (a.vorp_total ?? 0));

  const routeMap = new Map<number, { name: string; trips: number }>();
  for (const r of rows) {
    const ex = routeMap.get(r.crm_route_id);
    if (ex) {
      ex.trips += r.n_trips;
    } else {
      routeMap.set(r.crm_route_id, {
        name: r.route_name ?? `Ruta ${r.crm_route_id}`,
        trips: r.n_trips,
      });
    }
  }
  const routes = Array.from(routeMap.entries())
    .sort((a, b) => b[1].trips - a[1].trips)
    .map(([id, info]) => ({ id, ...info }));

  const cellIndex = new Map<string, Ranking>();
  for (const r of rows) {
    cellIndex.set(`${r.driver_id}-${r.crm_route_id}`, r);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
            Heatmap șoferi × rute — {currentQuarter}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {activeDrivers.length} șoferi · {routes.length} rute · minim {MIN_TRIPS_PER_CELL} curse pe
            celulă
          </div>
        </div>
        <QuarterSelect quarters={quarters} current={currentQuarter} />
      </div>

      <UsageBox
        title="Ce afișează această pagină"
        what="Matricea completă: pe fiecare rând un șofer (sortat după VORP total), pe fiecare coloană o rută. Fiecare celulă colorată arată cum se descurcă acel șofer pe acea rută vs normă. Verde = vinde peste așteptări, roșu = sub. Gol = nu a condus pe acea rută."
        howToUse={[
          'Rânduri cu multe verzi închise = șoferi buni pe orice rută (talent pur).',
          'Rânduri mixte (verde + roșu) = șoferi cu specializare. Pune-i DOAR pe rutele verzi.',
          'Coloane roșii la toată lumea = ruta e problema, nu șoferul (orare/prețuri).',
          'Click pe celulă = zoom pe porțiuni (vezi unde exact vinde slab).',
          'Coloana VORP din stânga = câștig/pierdere cumulativă pe trimestru.',
        ]}
      />

      <Legend />

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table style={{ fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={stickyTh(0, 180)}>Șofer</th>
              <th style={{ ...stickyTh(180, 90), textAlign: 'right' }}>VORP</th>
              {routes.map((r) => (
                <th
                  key={r.id}
                  style={{
                    padding: '8px',
                    borderBottom: '1px solid var(--border)',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    fontSize: 10,
                    whiteSpace: 'nowrap',
                    maxWidth: 140,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    background: 'var(--bg-elevated)',
                  }}
                  title={r.name}
                >
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeDrivers.map((d) => (
              <tr key={d.driver_id}>
                <td style={stickyTd(0, 180)}>
                  <Link
                    href={`/analytics/moneyball/sofer/${d.driver_id}?q=${currentQuarter}`}
                    style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {d.driver_name ?? '—'}
                  </Link>
                </td>
                <td
                  style={{
                    ...stickyTd(180, 90),
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono, monospace)',
                    color:
                      (d.vorp_total ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)',
                    fontWeight: 600,
                  }}
                >
                  {d.vorp_total !== null
                    ? Math.round(d.vorp_total).toLocaleString('ro-RO')
                    : '—'}
                </td>
                {routes.map((r) => {
                  const cell = cellIndex.get(`${d.driver_id}-${r.id}`);
                  if (!cell) {
                    return (
                      <td
                        key={r.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: 'rgba(0,0,0,0.01)',
                        }}
                      />
                    );
                  }
                  return (
                    <td
                      key={r.id}
                      style={{
                        ...devBgStyle(cell.avg_deviation_pct),
                        borderBottom: '1px solid var(--border)',
                        padding: 0,
                        textAlign: 'center',
                      }}
                    >
                      <Link
                        href={`/analytics/moneyball/heatmap-segmente/${r.id}?q=${currentQuarter}`}
                        style={{
                          display: 'block',
                          padding: '6px 8px',
                          color: 'inherit',
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                        title={`${d.driver_name} · ${r.name} · ${cell.n_trips} curse`}
                      >
                        {formatPct(cell.avg_deviation_pct)}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function stickyTh(left: number, width: number): React.CSSProperties {
  return {
    position: 'sticky',
    left,
    zIndex: 2,
    background: 'var(--bg-elevated)',
    borderBottom: '1px solid var(--border)',
    borderRight: '1px solid var(--border)',
    padding: '8px 12px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: 10,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    minWidth: width,
  };
}

function stickyTd(left: number, width: number): React.CSSProperties {
  return {
    position: 'sticky',
    left,
    zIndex: 1,
    background: '#fff',
    borderBottom: '1px solid var(--border)',
    borderRight: '1px solid var(--border)',
    padding: '6px 12px',
    whiteSpace: 'nowrap',
    minWidth: width,
  };
}

function Legend() {
  const swatches = [
    { label: '+10%+', style: { background: 'var(--success)', color: '#fff' } },
    { label: '+5–10%', style: { background: 'rgba(22,163,74,0.22)', color: 'var(--success)' } },
    { label: '0–5%', style: { background: 'var(--success-dim)', color: 'var(--success)' } },
    { label: '-5–0%', style: { background: 'var(--warning-dim)', color: 'var(--warning)' } },
    { label: '-10– -5%', style: { background: 'rgba(217,119,6,0.22)', color: 'var(--warning)' } },
    { label: '<-10%', style: { background: 'var(--danger)', color: '#fff' } },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
      <span>Legendă:</span>
      {swatches.map((s) => (
        <span
          key={s.label}
          style={{ ...s.style, padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}
