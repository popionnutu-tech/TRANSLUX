import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { formatLei, formatPct, devTextColor, devBgStyle } from '@/lib/moneyball/format';
import { QuarterSelect } from '@/components/moneyball/QuarterSelect';
import { UsageBox } from '@/components/moneyball/UsageBox';
import { DriverInsight } from '@/components/moneyball/DriverInsight';

export const dynamic = 'force-dynamic';

type RouteScore = {
  driver_id: string;
  driver_name: string | null;
  crm_route_id: number;
  route_name: string | null;
  quarter: string;
  avg_deviation_pct: number;
  n_trips: number;
  total_lei_actual: number;
  vorp_lei: number | null;
};

type SegmentScore = {
  driver_id: string;
  crm_route_id: number;
  direction: 'tur' | 'retur';
  stop_from_order: number;
  stop_name: string | null;
  avg_deviation_pct: number;
  n_trips: number;
};

type Totals = {
  driver_id: string;
  driver_name: string | null;
  total_trips: number;
  total_lei: number;
  vorp_total: number | null;
  weighted_avg_deviation_pct: number | null;
  n_routes: number;
};

export default async function SoferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id: driverId } = await params;
  const { q } = await searchParams;
  const supabase = getSupabase();

  const [
    { data: driver },
    { data: quartersData },
  ] = await Promise.all([
    supabase.from('drivers').select('id, full_name, phone').eq('id', driverId).single(),
    supabase
      .from('v_moneyball_ranking')
      .select('quarter')
      .eq('driver_id', driverId)
      .order('quarter', { ascending: false }),
  ]);

  const quarters = Array.from(new Set((quartersData ?? []).map((r) => r.quarter)));
  const currentQuarter = q ?? quarters[0] ?? '2026-Q2';

  const [{ data: routeScores }, { data: segScores }, { data: totalsData }] = await Promise.all([
    supabase
      .from('v_moneyball_ranking')
      .select('*')
      .eq('driver_id', driverId)
      .eq('quarter', currentQuarter)
      .order('avg_deviation_pct', { ascending: false }),
    supabase
      .from('v_moneyball_segments')
      .select('*')
      .eq('driver_id', driverId)
      .eq('quarter', currentQuarter)
      .gte('n_trips', 2)
      .order('avg_deviation_pct', { ascending: true })
      .limit(10),
    supabase
      .from('v_moneyball_driver_totals')
      .select('*')
      .eq('driver_id', driverId)
      .eq('quarter', currentQuarter)
      .maybeSingle(),
  ]);

  const routes: RouteScore[] = routeScores ?? [];
  const segments: SegmentScore[] = segScores ?? [];
  const totals: Totals | null = totalsData;

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
          <Link
            href="/analytics/moneyball/clasament"
            style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none' }}
          >
            ← Clasament
          </Link>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>
            {driver?.full_name ?? 'Șofer necunoscut'}
          </div>
          {driver?.phone && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {driver.phone}
            </div>
          )}
        </div>
        <QuarterSelect quarters={quarters} current={currentQuarter} />
      </div>

      <UsageBox
        title="Ce afișează această pagină"
        what="Fișa completă a șoferului pentru trimestrul ales: scor mediu ponderat, VORP total (câți lei aduce/pierde față de un șofer mediu), performanță pe rute și top 10 porțiuni slabe."
        howToUse={[
          'Scor sub 0 = vinde sub normă. VORP spune câți lei înseamnă asta concret.',
          'Tabelul „Performanța pe rute" = unde e bun, unde e slab. Roșii = candidate de mutare.',
          'Tabelul „Cele mai slabe porțiuni" = material pentru discuție individuală: „la stația X pierzi sistematic pasageri, ce se întâmplă?".',
          'Pentru bonus/salariu: folosește VORP absolut, nu scor procentual.',
        ]}
      />

      <DriverInsight driverId={driverId} quarter={currentQuarter} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <StatCard
          label="Scor mediu"
          value={
            totals?.weighted_avg_deviation_pct !== null &&
            totals?.weighted_avg_deviation_pct !== undefined
              ? formatPct(totals.weighted_avg_deviation_pct)
              : '—'
          }
          color={devTextColor(totals?.weighted_avg_deviation_pct)}
        />
        <StatCard label="Total curse" value={totals?.total_trips?.toString() ?? '0'} />
        <StatCard label="Total încasat" value={formatLei(totals?.total_lei)} />
        <StatCard
          label="VORP"
          value={
            totals?.vorp_total !== null && totals?.vorp_total !== undefined
              ? formatLei(totals.vorp_total)
              : '—'
          }
          color={(totals?.vorp_total ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)'}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: 16,
        }}
      >
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              Performanța pe rute
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Sortat descendent după scor
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>Ruta</th>
                <th style={{ ...th, textAlign: 'right' }}>Dev</th>
                <th style={{ ...th, textAlign: 'right' }}>Curse</th>
                <th style={{ ...th, textAlign: 'right' }}>Lei</th>
                <th style={{ ...th, textAlign: 'right' }}>VORP</th>
              </tr>
            </thead>
            <tbody>
              {routes.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Nu sunt curse în acest trimestru.
                  </td>
                </tr>
              )}
              {routes.map((r) => (
                <tr key={r.crm_route_id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td
                    style={{
                      ...td,
                      color: 'var(--text-secondary)',
                      fontSize: 11,
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Link
                      href={`/analytics/moneyball/heatmap-segmente/${r.crm_route_id}?q=${currentQuarter}`}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {r.route_name ?? '—'}
                    </Link>
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      fontWeight: 600,
                      color: devTextColor(r.avg_deviation_pct),
                    }}
                  >
                    {formatPct(r.avg_deviation_pct)}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {r.n_trips}
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {formatLei(r.total_lei_actual)}
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: 11,
                    }}
                  >
                    {r.vorp_lei !== null ? formatLei(r.vorp_lei) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              Cele mai slabe 10 porțiuni
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Unde vinde cel mai slab (minim 2 curse)
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>Stație</th>
                <th style={th}>Dir</th>
                <th style={{ ...th, textAlign: 'right' }}>Dev</th>
                <th style={{ ...th, textAlign: 'right' }}>Curse</th>
              </tr>
            </thead>
            <tbody>
              {segments.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Nu sunt suficiente date pe porțiuni.
                  </td>
                </tr>
              )}
              {segments.map((s) => (
                <tr
                  key={`${s.crm_route_id}-${s.direction}-${s.stop_from_order}`}
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 11 }}>
                    <Link
                      href={`/analytics/moneyball/heatmap-segmente/${s.crm_route_id}?q=${currentQuarter}&d=${s.direction}`}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {s.stop_name ?? `Stația #${s.stop_from_order}`}
                    </Link>
                  </td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-muted)' }}>{s.direction}</td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'right',
                      fontWeight: 600,
                      ...devBgStyle(s.avg_deviation_pct),
                    }}
                  >
                    {formatPct(s.avg_deviation_pct)}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {s.n_trips}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, color: color ?? 'var(--text)' }}>
        {value}
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  letterSpacing: '0.06em',
  background: 'var(--bg-elevated)',
};

const td: React.CSSProperties = {
  padding: '8px 12px',
};
