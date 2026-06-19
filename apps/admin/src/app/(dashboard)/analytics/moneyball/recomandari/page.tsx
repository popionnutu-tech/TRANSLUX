import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { formatLei, formatPct } from '@/lib/moneyball/format';
import { QuarterSelect } from '@/components/moneyball/QuarterSelect';
import { UsageBox } from '@/components/moneyball/UsageBox';
import { AIRecommendation } from '@/components/moneyball/AIRecommendation';

export const dynamic = 'force-dynamic';

type DriverItem = {
  driver_id: string;
  driver_name: string;
  score: number;
  trips: number;
  routes_covered: number;
};

type RouteItem = {
  id: number;
  name: string;
  time_chis: string | null;
  time_nord: string | null;
};

type GroupRec = {
  group_id: number;
  quarter: string;
  group_type: 'day_group' | 'pair' | 'triplet' | 'singleton';
  label: string;
  shift: 'day_trip' | 'overnight';
  route_ids: number[];
  n_routes: number;
  required_base_drivers: number;
  required_backup_drivers: number;
  required_total_drivers: number;
  display_order: number;
  routes: RouteItem[] | null;
  current_drivers: DriverItem[] | null;
  recommended_drivers: DriverItem[] | null;
  n_overlap: number;
  status: 'optimal' | 'minor_rotation' | 'major_rotation' | 'insufficient_data';
  est_monthly_gain_lei: number | null;
};

type RouteRec = {
  crm_route_id: number;
  route_name: string;
  base_driver_id: string;
  base_driver_name: string;
  base_score: number;
  base_trips: number;
  best_driver_id: string;
  best_driver_name: string;
  best_score: number;
  best_trips: number;
  est_monthly_gain_lei: number | null;
  status: 'urgent_change' | 'try_change';
};

const ROUTE_STATUS_STYLE: Record<
  RouteRec['status'],
  { label: string; color: string; bg: string; border: string }
> = {
  urgent_change: {
    label: 'Schimbare urgentă',
    color: 'var(--danger)',
    bg: 'var(--danger-dim)',
    border: 'var(--danger)',
  },
  try_change: {
    label: 'De încercat',
    color: 'var(--warning)',
    bg: 'var(--warning-dim)',
    border: 'var(--warning)',
  },
};

const STATUS_STYLE: Record<
  GroupRec['status'],
  { label: string; color: string; bg: string; border: string }
> = {
  optimal: {
    label: 'Alocare optimă',
    color: 'var(--success)',
    bg: 'var(--success-dim)',
    border: 'var(--success)',
  },
  minor_rotation: {
    label: 'Rotație ușoară',
    color: 'var(--warning)',
    bg: 'var(--warning-dim)',
    border: 'var(--warning)',
  },
  major_rotation: {
    label: 'Rotație majoră',
    color: 'var(--danger)',
    bg: 'var(--danger-dim)',
    border: 'var(--danger)',
  },
  insufficient_data: {
    label: 'Date insuficiente',
    color: 'var(--text-muted)',
    bg: 'rgba(0,0,0,0.03)',
    border: 'var(--text-muted)',
  },
};

const TYPE_LABEL: Record<GroupRec['group_type'], string> = {
  day_group: 'Grup day-trip',
  pair: 'Pereche',
  triplet: 'Triplet',
  singleton: 'Singleton',
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

function shortRouteName(name: string): string {
  const parts = name.split(' - ');
  if (parts.length >= 2) return `${parts[0]} - ${parts[1]}`;
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
    .from('v_moneyball_group_recommendations')
    .select('quarter')
    .order('quarter', { ascending: false });

  const quarters = Array.from(new Set((quartersData ?? []).map((r) => r.quarter)));
  const currentQuarter = q ?? quarters[0] ?? '2026-Q2';

  const { data: recs } = await supabase
    .from('v_moneyball_group_recommendations')
    .select('*')
    .eq('quarter', currentQuarter)
    .order('display_order');

  const rows: GroupRec[] = recs ?? [];

  // Per-route рекомендации (индивидуальные замены водитель↔маршрут) из v_moneyball_recommendations.
  const { data: routeRecsData } = await supabase
    .from('v_moneyball_recommendations')
    .select(
      'crm_route_id, route_name, base_driver_id, base_driver_name, base_score, base_trips, best_driver_id, best_driver_name, best_score, best_trips, est_monthly_gain_lei, status'
    )
    .eq('quarter', currentQuarter)
    .eq('base_is_best', false)
    .in('status', ['urgent_change', 'try_change'])
    .order('est_monthly_gain_lei', { ascending: false, nullsFirst: false });

  const routeRecs: RouteRec[] = ((routeRecsData ?? []) as RouteRec[]).filter(
    // скрыть артефакт дублей-тёзок (один человек под двумя id) — «заменить X на X»
    (r) => r.base_driver_name !== r.best_driver_name
  );
  const urgentRoutes = routeRecs.filter((r) => r.status === 'urgent_change');
  const tryRoutes = routeRecs.filter((r) => r.status === 'try_change');

  const major = rows.filter((r) => r.status === 'major_rotation');
  const minor = rows.filter((r) => r.status === 'minor_rotation');
  const optimal = rows.filter((r) => r.status === 'optimal');
  const insufficient = rows.filter((r) => r.status === 'insufficient_data');

  const totalGain = [...major, ...minor].reduce(
    (sum, r) => sum + (r.est_monthly_gain_lei ?? 0),
    0
  );

  const totalDrivers = rows.reduce((s, r) => s + r.required_total_drivers, 0);

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
            {rows.length} grupuri · {totalDrivers} șoferi dedicați (bază + rezervă) · șofer stabil
            = 20 zile/lună
          </div>
        </div>
        <QuarterSelect quarters={quarters} current={currentQuarter} />
      </div>

      <UsageBox
        title="Cum se citește această pagină"
        what="Rutele sunt grupate operațional după orar și overlap de sate. Fiecare grup are un număr exact de șoferi (bază + rezervă) bazat pe zilele acoperite (20 zile/șofer/lună). Pentru fiecare grup AI-ul îți arată echipa actuală vs echipa ideală."
        howToUse={[
          'Cardurile ROȘII = schimbare majoră necesară. Impact financiar mare.',
          'Cardurile GALBENE = rotație ușoară — 1-2 șoferi de înlocuit.',
          'Cardurile VERZI = echipa deja optimă. Păstrează și recompensează.',
          'Numărul de șoferi per grup e calculat automat: day-trip 7 (5+2), pereche 3 (2+1), triplet 5 (4+1), singleton 2 (1+1).',
          'Apasă „Analiză AI detaliată" pentru strategia completă pe trimestru.',
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
            ≈ {formatLei(totalGain * 3)} pe trimestru · {major.length + minor.length} grupuri de
            ajustat · {optimal.length} deja optime
          </div>
        </div>
      )}

      <AIRecommendation
        quarter={currentQuarter}
        mode="overall"
        label="Analiză strategică Claude — ce echipe să schimbi săptămâna aceasta"
      />

      {(urgentRoutes.length > 0 || tryRoutes.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              Schimbări individuale pe rută
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Un șofer concret pe o rută concretă unde altul vinde vizibil mai bine. Scor ajustat
              (credibilitate) — corectat pentru numărul de curse, nu medie brută.
            </div>
          </div>

          {urgentRoutes.length > 0 && (
            <RouteRecSection
              title="Urgent de schimbat"
              subtitle="șofer experimentat sub normă, există alternativă clar mai bună"
              tone="danger"
              recs={urgentRoutes}
              quarter={currentQuarter}
            />
          )}

          {tryRoutes.length > 0 && (
            <RouteRecSection
              title="De încercat"
              subtitle="merită testată o rotație"
              tone="warning"
              recs={tryRoutes}
              quarter={currentQuarter}
            />
          )}
        </div>
      )}

      {major.length > 0 && (
        <Section title="Rotații majore" subtitle="schimbare urgentă — impact mare" tone="danger">
          {major.map((r) => (
            <GroupCard key={r.group_id} r={r} />
          ))}
        </Section>
      )}

      {minor.length > 0 && (
        <Section title="Rotații ușoare" subtitle="1-2 șoferi de înlocuit" tone="warning">
          {minor.map((r) => (
            <GroupCard key={r.group_id} r={r} />
          ))}
        </Section>
      )}

      {optimal.length > 0 && (
        <Section title="Alocări optime" subtitle="nu atinge — dă bonus" tone="success">
          {optimal.map((r) => (
            <GroupCard key={r.group_id} r={r} />
          ))}
        </Section>
      )}

      {insufficient.length > 0 && (
        <Section title="Date insuficiente" subtitle="mai așteptăm date" tone="muted">
          {insufficient.map((r) => (
            <GroupCard key={r.group_id} r={r} />
          ))}
        </Section>
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
          gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
          gap: 14,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function GroupCard({ r }: { r: GroupRec }) {
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
      {/* Header: status + label + type */}
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
            <span>●</span>
            <span>{style.label}</span>
          </div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {TYPE_LABEL[r.group_type]} · {r.shift === 'day_trip' ? 'day-trip' : 'overnight'}
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 8 }}>
          {r.label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          {r.n_routes} rute · {r.required_base_drivers} șoferi bază + {r.required_backup_drivers}{' '}
          rezervă = <strong>{r.required_total_drivers} total</strong> · {r.n_overlap}/
          {r.required_total_drivers} se păstrează
        </div>
      </div>

      {/* Rutele din grup */}
      {r.routes && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            padding: '8px 12px',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-xs)',
          }}
        >
          {r.routes.map((route) => (
            <Link
              key={route.id}
              href={`/analytics/moneyball/heatmap-segmente/${route.id}?q=${r.quarter}`}
              style={{
                color: 'var(--text)',
                textDecoration: 'none',
                fontSize: 12,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {shortRouteName(route.name)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {route.time_chis?.split(' - ')[0] ?? '—'} · N {route.time_nord?.split(' - ')[0] ?? '—'}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Echipa curentă */}
      <DriverList
        label={`Cine conduce acum (top ${r.required_total_drivers})`}
        drivers={r.current_drivers ?? []}
        quarter={r.quarter}
        highlightSet={recommendedIds}
        highlightLabel="rămâne"
      />

      {/* Echipa recomandată */}
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
            {' '}
            potențial în plus/lună dacă faci rotația
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
          Echipa optimă deja conduce aici. Marchează-i pentru bonus la final de trimestru.
        </div>
      )}

      {r.status === 'insufficient_data' && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Prea puțini șoferi cu ≥3 curse pe acest grup. Recomandarea va fi disponibilă când se
          acumulează mai multe date.
        </div>
      )}
    </div>
  );
}

function RouteRecSection({
  title,
  subtitle,
  tone,
  recs,
  quarter,
}: {
  title: string;
  subtitle: string;
  tone: 'danger' | 'warning';
  recs: RouteRec[];
  quarter: string;
}) {
  const toneColor = tone === 'danger' ? 'var(--danger)' : 'var(--warning)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: toneColor }}>{title}</h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 12,
        }}
      >
        {recs.map((r) => (
          <RouteRecCard key={`${r.crm_route_id}-${r.base_driver_id}`} r={r} quarter={quarter} />
        ))}
      </div>
    </div>
  );
}

function RouteRecCard({ r, quarter }: { r: RouteRec; quarter: string }) {
  const style = ROUTE_STATUS_STYLE[r.status];
  // «Mai bun» с малым числом рейсов = непроверенная альтернатива (шум малой выборки) → приглушаем сумму + оговорка.
  const proven = r.best_trips >= 10;
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderTop: `3px solid ${style.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span
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
          <span>●</span>
          <span>{style.label}</span>
        </span>
        {(r.est_monthly_gain_lei ?? 0) > 0 && (
          <span
            style={{
              fontSize: 13,
              fontWeight: proven ? 700 : 500,
              color: proven ? style.color : 'var(--text-muted)',
            }}
          >
            +{formatLei(r.est_monthly_gain_lei)} / lună{proven ? '' : ' (estimativ)'}
          </span>
        )}
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{r.route_name}</div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '8px 12px',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-xs)',
        }}
      >
        <DriverLine
          label="Acum"
          driverId={r.base_driver_id}
          name={r.base_driver_name}
          score={r.base_score}
          trips={r.base_trips}
          quarter={quarter}
        />
        <div style={{ fontSize: 14, color: 'var(--primary)', textAlign: 'center', lineHeight: 1 }}>
          ↓
        </div>
        <DriverLine
          label="Mai bun"
          driverId={r.best_driver_id}
          name={r.best_driver_name}
          score={r.best_score}
          trips={r.best_trips}
          quarter={quarter}
          strong
        />
      </div>

      {!proven && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--warning)',
            display: 'flex',
            gap: 6,
            alignItems: 'baseline',
          }}
        >
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>
            Alternativa are doar {r.best_trips} curse — semnal încă neconfirmat. Verifică pe teren
            înainte de schimbare.
          </span>
        </div>
      )}
    </div>
  );
}

function DriverLine({
  label,
  driverId,
  name,
  score,
  trips,
  quarter,
  strong = false,
}: {
  label: string;
  driverId: string;
  name: string;
  score: number;
  trips: number;
  quarter: string;
  strong?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: 1, overflow: 'hidden' }}>
        <span
          style={{
            fontSize: 9,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            width: 42,
            flexShrink: 0,
          }}
        >
          {label}
        </span>
        <Link
          href={`/analytics/moneyball/sofer/${driverId}?q=${quarter}`}
          style={{
            color: 'var(--text)',
            textDecoration: 'none',
            fontWeight: strong ? 700 : 600,
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </Link>
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        <span style={{ color: score >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
          {formatPct(score)}
        </span>{' '}
        · {trips} curse
      </span>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                padding: '3px 0',
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
