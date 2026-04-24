import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { formatLei } from '@/lib/moneyball/format';
import { QuarterSelect } from '@/components/moneyball/QuarterSelect';
import { UsageBox } from '@/components/moneyball/UsageBox';
import { AIRecommendation } from '@/components/moneyball/AIRecommendation';

export const dynamic = 'force-dynamic';

type DriverItem = {
  driver_id: string;
  driver_name: string;
  score: number;
  trips: number;
  routes_count: number;
};

type PairRec = {
  pair_id: number;
  quarter: string;
  route_a_id: number;
  route_b_id: number;
  route_a_name: string | null;
  route_b_name: string | null;
  shared_drivers: number;
  current_drivers: DriverItem[] | null;
  recommended_drivers: DriverItem[] | null;
  n_overlap: number;
  status: 'optimal' | 'minor_rotation' | 'major_rotation' | 'insufficient_data';
  est_monthly_gain_lei: number | null;
};

const STATUS_STYLE: Record<
  PairRec['status'],
  { label: string; color: string; bg: string; border: string; icon: string }
> = {
  optimal: {
    label: 'Alocare optimă',
    color: 'var(--success)',
    bg: 'var(--success-dim)',
    border: 'var(--success)',
    icon: '●',
  },
  minor_rotation: {
    label: 'Rotație ușoară',
    color: 'var(--warning)',
    bg: 'var(--warning-dim)',
    border: 'var(--warning)',
    icon: '●',
  },
  major_rotation: {
    label: 'Rotație majoră',
    color: 'var(--danger)',
    bg: 'var(--danger-dim)',
    border: 'var(--danger)',
    icon: '●',
  },
  insufficient_data: {
    label: 'Date insuficiente',
    color: 'var(--text-muted)',
    bg: 'rgba(0,0,0,0.03)',
    border: 'var(--text-muted)',
    icon: '○',
  },
};

function driverNote(score: number): string {
  if (score >= 5) return 'vinde excelent';
  if (score >= 0) return 'vinde la normă';
  if (score >= -3) return 'ușor sub normă';
  return 'vinde sub normă';
}

function driverTone(score: number): 'pos' | 'mid' | 'neg' {
  if (score >= 0) return 'pos';
  if (score >= -3) return 'mid';
  return 'neg';
}

function shortRouteName(name: string | null): string {
  if (!name) return '—';
  // "Criva - Chișinău - Chișinău - Criva" → "Criva - Chișinău"
  const parts = name.split(' - ');
  if (parts.length >= 2) {
    return `${parts[0]} - ${parts[1]}`;
  }
  return name;
}

export default async function RecomandariPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = getSupabase();

  const { data: quartersData } = await supabase
    .from('v_moneyball_pair_recommendations')
    .select('quarter')
    .order('quarter', { ascending: false });

  const quarters = Array.from(new Set((quartersData ?? []).map((r) => r.quarter)));
  const currentQuarter = q ?? quarters[0] ?? '2026-Q2';

  const { data: recs } = await supabase
    .from('v_moneyball_pair_recommendations')
    .select('*')
    .eq('quarter', currentQuarter)
    .order('est_monthly_gain_lei', { ascending: false, nullsFirst: false });

  const rows: PairRec[] = recs ?? [];

  const major = rows.filter((r) => r.status === 'major_rotation');
  const minor = rows.filter((r) => r.status === 'minor_rotation');
  const optimal = rows.filter((r) => r.status === 'optimal');
  const insufficient = rows.filter((r) => r.status === 'insufficient_data');

  const totalGain = [...major, ...minor].reduce(
    (sum, r) => sum + (r.est_monthly_gain_lei ?? 0),
    0
  );

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
            {rows.length} perechi de rute · 3 șoferi per pereche (60 zile-om/lună)
          </div>
        </div>
        <QuarterSelect quarters={quarters} current={currentQuarter} />
      </div>

      <UsageBox
        title="Cum se citește această pagină"
        what="Rutele sunt grupate în perechi (2 rute = 3 șoferi dedicați, rotație între ele). Pentru fiecare pereche AI-ul îți arată cine conduce acolo acum vs. cine ar trebui să fie. Nu înlocuim 1 cu 1 — propunem echipa completă de 3 șoferi optimă pentru cele 2 rute împreună."
        howToUse={[
          'Perechile ROȘII (rotație majoră) = întreaga echipă de 3 trebuie schimbată. Impact mare.',
          'Perechile GALBENE (rotație ușoară) = 1-2 șoferi trebuie schimbați, restul rămân.',
          'Perechile VERZI = totul e OK. Dă-le bonus echipei.',
          'Un șofer care e „de bază" pe o pereche NU ar trebui să conducă și pe alta, doar dacă vrea ture suplimentare.',
          'Apasă „Analiză AI detaliată" pe fiecare card pentru strategia și ordinea schimbărilor.',
        ]}
      />

      {totalGain > 0 && (
        <div
          className="card"
          style={{
            padding: '16px 20px',
            borderTop: '3px solid var(--success)',
            background: 'var(--success-dim)',
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: 'var(--success)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Potențial total dacă faci toate rotațiile recomandate
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success)', marginTop: 4 }}>
            +{formatLei(totalGain)} / lună
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 4 }}>
            ≈ {formatLei(totalGain * 3)} pe trimestru · {major.length + minor.length} perechi de
            ajustat · {optimal.length} perechi deja optime
          </div>
        </div>
      )}

      <AIRecommendation
        quarter={currentQuarter}
        mode="overall"
        label="Analiză strategică Claude — ce echipe să schimbi săptămâna aceasta"
      />

      {major.length > 0 && (
        <Section
          title="Rotații majore"
          subtitle={`${major.length} perechi unde toată echipa de 3 necesită schimbări`}
          tone="danger"
        >
          {major.map((r) => (
            <PairCard key={r.pair_id} r={r} />
          ))}
        </Section>
      )}

      {minor.length > 0 && (
        <Section
          title="Rotații ușoare"
          subtitle={`${minor.length} perechi unde 1-2 șoferi ar trebui schimbați`}
          tone="warning"
        >
          {minor.map((r) => (
            <PairCard key={r.pair_id} r={r} />
          ))}
        </Section>
      )}

      {optimal.length > 0 && (
        <Section
          title="Alocare optimă"
          subtitle={`${optimal.length} perechi cu echipa ideală. Nu atinge. Dă bonus.`}
          tone="success"
        >
          {optimal.map((r) => (
            <PairCard key={r.pair_id} r={r} />
          ))}
        </Section>
      )}

      {insufficient.length > 0 && (
        <Section
          title="Date insuficiente"
          subtitle={`${insufficient.length} perechi cu prea puțini șoferi pentru recomandare. Mai așteptăm date.`}
          tone="muted"
        >
          {insufficient.map((r) => (
            <PairCard key={r.pair_id} r={r} />
          ))}
        </Section>
      )}

      {rows.length === 0 && (
        <div
          className="card"
          style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}
        >
          Nu sunt perechi generate pentru acest trimestru.
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string;
  subtitle: string;
  tone: 'danger' | 'warning' | 'success' | 'muted';
  children: React.ReactNode;
}) {
  const toneColor =
    tone === 'danger'
      ? 'var(--danger)'
      : tone === 'warning'
        ? 'var(--warning)'
        : tone === 'success'
          ? 'var(--success)'
          : 'var(--text-muted)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: toneColor }}>{title}</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
          gap: 14,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function PairCard({ r }: { r: PairRec }) {
  const style = STATUS_STYLE[r.status];
  const showRecommendation = r.status === 'major_rotation' || r.status === 'minor_rotation';

  const currentIds = new Set((r.current_drivers ?? []).map((d) => d.driver_id));
  const recommendedIds = new Set((r.recommended_drivers ?? []).map((d) => d.driver_id));

  return (
    <div
      className="card"
      style={{
        padding: 16,
        borderTop: `3px solid ${style.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px',
            background: style.bg,
            color: style.color,
            borderRadius: 'var(--radius-xs)',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <span>{style.icon}</span>
          <span>{style.label}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 8 }}>
          <Link
            href={`/analytics/moneyball/heatmap-segmente/${r.route_a_id}?q=${r.quarter}`}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            {shortRouteName(r.route_a_name)}
          </Link>
          <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>+</span>
          <Link
            href={`/analytics/moneyball/heatmap-segmente/${r.route_b_id}?q=${r.quarter}`}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            {shortRouteName(r.route_b_name)}
          </Link>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          60 zile-om/lună · 3 șoferi · {r.n_overlap}/3 se păstrează
        </div>
      </div>

      {/* Șoferii curenți */}
      <DriverList
        label="Cine conduce acum"
        drivers={r.current_drivers ?? []}
        quarter={r.quarter}
        highlightSet={recommendedIds}
        highlightLabel="rămâne"
      />

      {/* Șoferii recomandați (doar dacă e cazul) */}
      {showRecommendation && r.recommended_drivers && r.recommended_drivers.length > 0 && (
        <DriverList
          label="Echipă recomandată"
          arrow
          drivers={r.recommended_drivers}
          quarter={r.quarter}
          highlightSet={currentIds}
          highlightLabel="(rămâne)"
        />
      )}

      {/* Impact */}
      {showRecommendation && (r.est_monthly_gain_lei ?? 0) > 500 && (
        <div
          style={{
            padding: '10px 14px',
            background: style.bg,
            borderRadius: 'var(--radius-xs)',
            fontSize: 13,
            color: 'var(--text)',
          }}
        >
          <span style={{ fontWeight: 600, color: style.color }}>
            +{formatLei(r.est_monthly_gain_lei)}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            {' '}potențial în plus/lună dacă faci rotația
          </span>
        </div>
      )}

      {r.status === 'optimal' && (
        <div
          style={{
            padding: '10px 14px',
            background: style.bg,
            borderRadius: 'var(--radius-xs)',
            fontSize: 13,
            color: 'var(--text)',
          }}
        >
          Echipa optimă deja conduce aici. Marchează-i pentru bonus.
        </div>
      )}

      {r.status === 'insufficient_data' && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Prea puțini șoferi cu ≥3 curse pe această pereche. Recomandarea va fi disponibilă când se
          acumulează mai multe date.
        </div>
      )}
    </div>
  );
}

function DriverList({
  label,
  drivers,
  quarter,
  arrow = false,
  highlightSet,
  highlightLabel,
}: {
  label: string;
  drivers: DriverItem[];
  quarter: string;
  arrow?: boolean;
  highlightSet?: Set<string>;
  highlightLabel?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {arrow && <span style={{ fontSize: 14, color: 'var(--primary)' }}>↓</span>}
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {drivers.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            — nu avem date suficiente —
          </div>
        )}
        {drivers.map((d) => {
          const tone = driverTone(d.score);
          const toneColor =
            tone === 'pos'
              ? 'var(--success)'
              : tone === 'neg'
                ? 'var(--danger)'
                : 'var(--text-secondary)';
          const isHighlighted = highlightSet?.has(d.driver_id);
          return (
            <div
              key={d.driver_id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 10,
                padding: '4px 0',
              }}
            >
              <Link
                href={`/analytics/moneyball/sofer/${d.driver_id}?q=${quarter}`}
                style={{
                  color: 'var(--text)',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: 13,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {d.driver_name}
                {isHighlighted && highlightLabel && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      color: 'var(--success)',
                      fontWeight: 500,
                    }}
                  >
                    {highlightLabel}
                  </span>
                )}
              </Link>
              <span style={{ fontSize: 11, color: toneColor, whiteSpace: 'nowrap' }}>
                {driverNote(d.score)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
