import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { formatLei, formatPct, devTextColor } from '@/lib/moneyball/format';
import { QuarterSelect } from '@/components/moneyball/QuarterSelect';
import { UsageBox } from '@/components/moneyball/UsageBox';

export const dynamic = 'force-dynamic';

type DriverTotals = {
  driver_id: string;
  driver_name: string | null;
  quarter: string;
  total_trips: number;
  total_lei: number;
  vorp_total: number | null;
  weighted_avg_deviation_pct: number | null;
  n_routes: number;
};

const MIN_TRIPS = 5;

export default async function VorpPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = getSupabase();

  const { data: quartersData } = await supabase
    .from('v_moneyball_driver_totals')
    .select('quarter')
    .order('quarter', { ascending: false });

  const quarters = Array.from(new Set((quartersData ?? []).map((r) => r.quarter)));
  const currentQuarter = q ?? quarters[0] ?? '2026-Q2';

  const { data: driversData } = await supabase
    .from('v_moneyball_driver_totals')
    .select('*')
    .eq('quarter', currentQuarter)
    .gte('total_trips', MIN_TRIPS)
    .order('vorp_total', { ascending: false });

  const drivers: DriverTotals[] = driversData ?? [];

  const totalVorpPositive = drivers
    .filter((d) => (d.vorp_total ?? 0) > 0)
    .reduce((sum, d) => sum + (d.vorp_total ?? 0), 0);
  const totalVorpNegative = drivers
    .filter((d) => (d.vorp_total ?? 0) < 0)
    .reduce((sum, d) => sum + (d.vorp_total ?? 0), 0);

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
            Driver Value (VORP) — {currentQuarter}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Câți lei aduce/pierde fiecare șofer față de un șofer mediu pe aceleași curse · minim{' '}
            {MIN_TRIPS} curse
          </div>
        </div>
        <QuarterSelect quarters={quarters} current={currentQuarter} />
      </div>

      <UsageBox
        title="Ce afișează această pagină"
        what="VORP (Value Over Replacement Player) — câți lei aduce (sau pierde) fiecare șofer față de un șofer mediu pus pe aceleași curse. Formula folosește deviația, nr. curse și prețul mediu real al biletelor pe rute. Sortat descendent — primul = cel mai valoros șofer pe acel trimestru."
        howToUse={[
          'KPI-ul principal pentru compensare: VORP pozitiv mare = bonus, retenție, recunoaștere.',
          'VORP negativ mare = conversație dificilă. Verifică mai întâi în Heatmap — dacă e roșu peste tot = șoferul. Dacă e mixt = alocarea.',
          '„Câștig Moneyball potențial" = bani recuperabili dacă muți șoferii slabi pe rute potrivite.',
          'La sfârșit de trimestru: lista asta = bonusurile variabile. Obiectiv, transparent, date.',
        ]}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        <div
          className="card"
          style={{ padding: '14px 18px', borderTop: '3px solid var(--success)' }}
        >
          <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total VORP pozitiv
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, color: 'var(--success)' }}>
            +{formatLei(totalVorpPositive)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {drivers.filter((d) => (d.vorp_total ?? 0) > 0).length} șoferi peste media
          </div>
        </div>
        <div
          className="card"
          style={{ padding: '14px 18px', borderTop: '3px solid var(--danger)' }}
        >
          <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total VORP negativ
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, color: 'var(--danger)' }}>
            {formatLei(totalVorpNegative)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {drivers.filter((d) => (d.vorp_total ?? 0) < 0).length} șoferi sub media
          </div>
        </div>
        <div className="card" style={{ padding: '14px 18px', borderTop: '3px solid var(--primary)' }}>
          <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Câștig Moneyball potențial
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, color: 'var(--text)' }}>
            ~{formatLei(Math.abs(totalVorpNegative))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            dacă recuperezi șoferii slabi
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)' }}>
              <th style={{ ...th, textAlign: 'right', width: 40 }}>#</th>
              <th style={th}>Șofer</th>
              <th style={{ ...th, textAlign: 'right' }}>VORP</th>
              <th style={{ ...th, textAlign: 'right' }}>Scor mediu</th>
              <th style={{ ...th, textAlign: 'right' }}>Curse</th>
              <th style={{ ...th, textAlign: 'right' }}>Rute</th>
              <th style={{ ...th, textAlign: 'right' }}>Total lei</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d, idx) => (
              <tr key={d.driver_id} style={{ borderTop: '1px solid var(--border)' }}>
                <td
                  style={{
                    ...td,
                    textAlign: 'right',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 11,
                  }}
                >
                  {idx + 1}
                </td>
                <td style={td}>
                  <Link
                    href={`/analytics/moneyball/sofer/${d.driver_id}?q=${currentQuarter}`}
                    style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {d.driver_name ?? '—'}
                  </Link>
                </td>
                <td
                  style={{
                    ...td,
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontWeight: 600,
                    color: (d.vorp_total ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  {d.vorp_total !== null && d.vorp_total >= 0 ? '+' : ''}
                  {formatLei(d.vorp_total)}
                </td>
                <td
                  style={{
                    ...td,
                    textAlign: 'right',
                    fontWeight: 600,
                    color: devTextColor(d.weighted_avg_deviation_pct),
                  }}
                >
                  {formatPct(d.weighted_avg_deviation_pct)}
                </td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)' }}>
                  {d.total_trips}
                </td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)' }}>
                  {d.n_routes}
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
                  {formatLei(d.total_lei)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  letterSpacing: '0.06em',
};

const td: React.CSSProperties = {
  padding: '10px 12px',
};
