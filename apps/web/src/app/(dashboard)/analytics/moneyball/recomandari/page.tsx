import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { formatLei, formatPct, devTextColor } from '@/lib/moneyball/format';
import { QuarterSelect } from '@/components/moneyball/QuarterSelect';
import { UsageBox } from '@/components/moneyball/UsageBox';
import { AIRecommendation } from '@/components/moneyball/AIRecommendation';

export const dynamic = 'force-dynamic';

type RecRow = {
  crm_route_id: number;
  route_name: string | null;
  quarter: string;
  current_driver_id: string;
  current_driver_name: string | null;
  current_score: number;
  current_trips: number;
  current_vorp_per_trip: number | null;
  best_driver_id: string;
  best_driver_name: string | null;
  best_score: number;
  best_trips: number;
  best_vorp_per_trip: number | null;
  n_drivers_on_route: number;
  current_is_best: boolean;
  est_monthly_gain_lei: number | null;
  est_quarterly_gain_lei: number | null;
};

export default async function RecomandariPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = getSupabase();

  const { data: quartersData } = await supabase
    .from('v_moneyball_recommendations')
    .select('quarter')
    .order('quarter', { ascending: false });

  const quarters = Array.from(new Set((quartersData ?? []).map((r) => r.quarter)));
  const currentQuarter = q ?? quarters[0] ?? '2026-Q2';

  const { data: recs } = await supabase
    .from('v_moneyball_recommendations')
    .select('*')
    .eq('quarter', currentQuarter)
    .order('est_monthly_gain_lei', { ascending: false, nullsFirst: false });

  const rows: RecRow[] = recs ?? [];

  const rotations = rows.filter((r) => !r.current_is_best && (r.est_monthly_gain_lei ?? 0) > 0);
  const optimal = rows.filter((r) => r.current_is_best);

  const totalMonthlyGain = rotations.reduce(
    (sum, r) => sum + (r.est_monthly_gain_lei ?? 0),
    0
  );
  const totalQuarterlyGain = totalMonthlyGain * 3;

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
            Recomandări AI — {currentQuarter}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Pe baza ipotezei că un șofer stabil lucrează 18-22 zile/lună pe aceeași rută (20 în
            estimări) · {rows.length} rute analizate
          </div>
        </div>
        <QuarterSelect quarters={quarters} current={currentQuarter} />
      </div>

      <UsageBox
        title="Ce afișează această pagină"
        what="Pentru fiecare rută, AI-ul compară șoferul care conduce cel mai des acolo (current) cu șoferul care VINDE cel mai bine pe ea (best). Dacă sunt diferiți, estimează câștigul lunar dacă faci rotația, asumând că un șofer stabil face 20 curse/lună pe ruta atribuită."
        howToUse={[
          'Tabelul de sus = rotațiile cu cel mai mare impact financiar. Începe de acolo.',
          'Tabelul de jos = rute unde cel mai bun șofer conduce deja cel mai des. NU face rotații acolo — totul e OK.',
          'Estimarea folosește VORP per cursă (nu doar procentaj) × 20 curse/lună. E realistă la nivel de ordin de mărime, nu exactă la leu.',
          'Apasă „Generează analiza" pe fiecare card pentru a primi strategia AI detaliată.',
          'Rotațiile cu câștig <1.000 lei/lună nu merită efortul logistic de a schimba orare și obișnuința șoferilor. Concentrează-te pe top.',
        ]}
      />

      {/* Summary stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        <div
          className="card"
          style={{ padding: '14px 18px', borderTop: '3px solid var(--success)' }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--success)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Câștig lunar potențial
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, color: 'var(--success)' }}>
            +{formatLei(totalMonthlyGain)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            dacă faci toate cele {rotations.length} rotații
          </div>
        </div>
        <div className="card" style={{ padding: '14px 18px', borderTop: '3px solid var(--primary)' }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--primary)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Câștig trimestrial
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, color: 'var(--primary)' }}>
            +{formatLei(totalQuarterlyGain)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            × 3 luni stabilitate
          </div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Rute OK deja
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, color: 'var(--text)' }}>
            {optimal.length}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            șoferul dominant = cel mai bun
          </div>
        </div>
      </div>

      <AIRecommendation
        quarter={currentQuarter}
        mode="overall"
        label="Analiza strategică a lui Claude"
      />

      {/* Rotații recomandate */}
      {rotations.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--success-dim)',
              borderBottom: '1px solid var(--border)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--success)',
            }}
          >
            Rotații recomandate ({rotations.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  <th style={th}>Ruta</th>
                  <th style={th}>Șofer curent</th>
                  <th style={{ ...th, textAlign: 'right' }}>Scor</th>
                  <th style={{ ...th, textAlign: 'right' }}>Curse</th>
                  <th style={th}>→ Șofer recomandat</th>
                  <th style={{ ...th, textAlign: 'right' }}>Scor</th>
                  <th style={{ ...th, textAlign: 'right' }}>Curse</th>
                  <th style={{ ...th, textAlign: 'right' }}>Câștig/lună</th>
                </tr>
              </thead>
              <tbody>
                {rotations.map((r) => (
                  <tr key={r.crm_route_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...td, maxWidth: 220, fontSize: 11 }}>
                      <Link
                        href={`/analytics/moneyball/heatmap-segmente/${r.crm_route_id}?q=${r.quarter}`}
                        style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {r.route_name ?? `Ruta ${r.crm_route_id}`}
                      </Link>
                    </td>
                    <td style={td}>
                      <Link
                        href={`/analytics/moneyball/sofer/${r.current_driver_id}?q=${r.quarter}`}
                        style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
                      >
                        {r.current_driver_name ?? '—'}
                      </Link>
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                        fontWeight: 600,
                        color: devTextColor(r.current_score),
                      }}
                    >
                      {formatPct(r.current_score)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>
                      {r.current_trips}
                    </td>
                    <td style={td}>
                      <Link
                        href={`/analytics/moneyball/sofer/${r.best_driver_id}?q=${r.quarter}`}
                        style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
                      >
                        {r.best_driver_name ?? '—'}
                      </Link>
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                        fontWeight: 600,
                        color: devTextColor(r.best_score),
                      }}
                    >
                      {formatPct(r.best_score)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>
                      {r.best_trips}
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: 600,
                        color: 'var(--success)',
                      }}
                    >
                      +{formatLei(r.est_monthly_gain_lei ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rute optime — nu schimba nimic */}
      {optimal.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--primary-dim)',
              borderBottom: '1px solid var(--border)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--primary)',
            }}
          >
            Rute cu alocare optimă ({optimal.length}) — nu recomand rotații
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  <th style={th}>Ruta</th>
                  <th style={th}>Șofer dominant = cel mai bun</th>
                  <th style={{ ...th, textAlign: 'right' }}>Scor</th>
                  <th style={{ ...th, textAlign: 'right' }}>Curse</th>
                  <th style={{ ...th, textAlign: 'right' }}>Alți șoferi pe rută</th>
                </tr>
              </thead>
              <tbody>
                {optimal.map((r) => (
                  <tr key={r.crm_route_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...td, maxWidth: 280, fontSize: 11 }}>
                      <Link
                        href={`/analytics/moneyball/heatmap-segmente/${r.crm_route_id}?q=${r.quarter}`}
                        style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {r.route_name ?? `Ruta ${r.crm_route_id}`}
                      </Link>
                    </td>
                    <td style={td}>
                      <Link
                        href={`/analytics/moneyball/sofer/${r.current_driver_id}?q=${r.quarter}`}
                        style={{
                          color: 'var(--success)',
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                      >
                        {r.current_driver_name ?? '—'}
                      </Link>
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                        fontWeight: 600,
                        color: devTextColor(r.current_score),
                      }}
                    >
                      {formatPct(r.current_score)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>
                      {r.current_trips}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>
                      {r.n_drivers_on_route - 1}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div
          className="card"
          style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}
        >
          Nu sunt date suficiente pentru recomandări în trimestrul ales.
        </div>
      )}
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
