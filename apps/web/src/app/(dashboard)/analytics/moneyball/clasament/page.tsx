import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { formatLei, formatPct, devTextColor } from '@/lib/moneyball/format';
import { QuarterSelect } from '@/components/moneyball/QuarterSelect';
import { UsageBox } from '@/components/moneyball/UsageBox';

export const dynamic = 'force-dynamic';

type RankingRow = {
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

const MIN_TRIPS = 3;

export default async function ClasamentPage({
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

  const { data: ranking } = await supabase
    .from('v_moneyball_ranking')
    .select('*')
    .eq('quarter', currentQuarter)
    .gte('n_trips', MIN_TRIPS)
    .order('avg_deviation_pct', { ascending: false });

  const rows: RankingRow[] = ranking ?? [];
  const top = rows.slice(0, 10);
  const bottom = rows.slice(-10).reverse();

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
            Clasament — {currentQuarter}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Deviație față de normă · minim {MIN_TRIPS} curse · {rows.length} combinații
          </div>
        </div>
        <QuarterSelect quarters={quarters} current={currentQuarter} />
      </div>

      <UsageBox
        title="Ce afișează această pagină"
        what="Clasamentul Moneyball al combinațiilor șofer × rută pe trimestrul ales. Nu arată cifre brute de încasare (care depind de ruta pe care merge șoferul), ci deviația procentuală față de norma contextului — cât de bine vinde fiecare șofer comparat cu norma pe aceeași rută, aceeași zi-tip, aceeași capacitate mașină."
        howToUse={[
          'Top 10 = șoferi de păstrat, promovat, dat bonus. Sunt vânzătorii reali.',
          'Bottom 10 = șoferi cu care ai o discuție. Nu neapărat concediere — poate doar mutare pe alte rute (vezi heatmap-ul).',
          'Dacă un șofer apare atât în Top cât și în Bottom pe rute diferite = Moneyball clasic. Rotește-l pe ruta unde e bun.',
          'Click pe numele șoferului pentru fișa detaliată. Schimbă trimestrul din dreapta sus.',
        ]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        <RankingTable title="Top 10 vânzători" tone="pos" rows={top} />
        <RankingTable title="Bottom 10 vânzători" tone="neg" rows={bottom} />
      </div>
    </div>
  );
}

function RankingTable({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: 'pos' | 'neg';
  rows: RankingRow[];
}) {
  const headerBg = tone === 'pos' ? 'var(--success-dim)' : 'var(--danger-dim)';
  const headerColor = tone === 'pos' ? 'var(--success)' : 'var(--danger)';

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '12px 16px',
          background: headerBg,
          borderBottom: '1px solid var(--border-accent)',
          fontWeight: 600,
          fontSize: 14,
          color: headerColor,
        }}
      >
        {title}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-elevated)' }}>
            <th style={th}>Șofer</th>
            <th style={th}>Ruta</th>
            <th style={{ ...th, textAlign: 'right' }}>Dev</th>
            <th style={{ ...th, textAlign: 'right' }}>Curse</th>
            <th style={{ ...th, textAlign: 'right' }}>VORP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={`${r.driver_id}-${r.crm_route_id}`}
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <td style={td}>
                <Link
                  href={`/analytics/moneyball/sofer/${r.driver_id}?q=${r.quarter}`}
                  style={{ color: 'var(--text)', textDecoration: 'none' }}
                >
                  {r.driver_name ?? '—'}
                </Link>
              </td>
              <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.route_name ?? '—'}
              </td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: devTextColor(r.avg_deviation_pct) }}>
                {formatPct(r.avg_deviation_pct)}
              </td>
              <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)' }}>
                {r.n_trips}
              </td>
              <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--text)' }}>
                {r.vorp_lei !== null ? formatLei(r.vorp_lei) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
};

const td: React.CSSProperties = {
  padding: '8px 12px',
};
