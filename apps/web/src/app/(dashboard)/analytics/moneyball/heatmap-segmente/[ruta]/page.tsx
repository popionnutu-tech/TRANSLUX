import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { formatPct, devBgStyle } from '@/lib/moneyball/format';
import { QuarterSelect } from '@/components/moneyball/QuarterSelect';
import { UsageBox } from '@/components/moneyball/UsageBox';

export const dynamic = 'force-dynamic';

type SegRow = {
  driver_id: string;
  driver_name: string | null;
  crm_route_id: number;
  direction: 'tur' | 'retur';
  stop_from_order: number;
  stop_name: string | null;
  quarter: string;
  avg_deviation_pct: number;
  n_trips: number;
};

const MIN_TRIPS = 3;

export default async function HeatmapSegmentePage({
  params,
  searchParams,
}: {
  params: Promise<{ ruta: string }>;
  searchParams: Promise<{ q?: string; d?: 'tur' | 'retur' }>;
}) {
  const { ruta } = await params;
  const { q, d: directionParam } = await searchParams;
  const crmRouteId = parseInt(ruta, 10);
  const direction = directionParam ?? 'tur';

  const supabase = getSupabase();

  const [{ data: quartersData }, { data: routeInfo }] = await Promise.all([
    supabase
      .from('v_moneyball_segments')
      .select('quarter')
      .eq('crm_route_id', crmRouteId)
      .order('quarter', { ascending: false }),
    supabase
      .from('crm_routes')
      .select('dest_from_ro, dest_to_ro')
      .eq('id', crmRouteId)
      .single(),
  ]);

  const quarters = Array.from(new Set((quartersData ?? []).map((r) => r.quarter)));
  const currentQuarter = q ?? quarters[0] ?? '2026-Q2';

  const routeName = routeInfo
    ? `${routeInfo.dest_from_ro} → ${routeInfo.dest_to_ro}`
    : `Ruta ${crmRouteId}`;

  const { data: segments } = await supabase
    .from('v_moneyball_segments')
    .select('*')
    .eq('crm_route_id', crmRouteId)
    .eq('quarter', currentQuarter)
    .eq('direction', direction)
    .gte('n_trips', MIN_TRIPS)
    .order('stop_from_order');

  const rows: SegRow[] = segments ?? [];

  const driverMap = new Map<string, string>();
  const stopMap = new Map<number, string>();
  for (const r of rows) {
    if (r.driver_name) driverMap.set(r.driver_id, r.driver_name);
    if (r.stop_name) stopMap.set(r.stop_from_order, r.stop_name);
  }

  const drivers = Array.from(driverMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ro'));

  const stops = Array.from(stopMap.entries())
    .map(([order, name]) => ({ order, name }))
    .sort((a, b) => a.order - b.order);

  const cellIndex = new Map<string, SegRow>();
  for (const r of rows) {
    cellIndex.set(`${r.driver_id}-${r.stop_from_order}`, r);
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
          <Link
            href={`/analytics/moneyball/heatmap-rute?q=${currentQuarter}`}
            style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none' }}
          >
            ← Heatmap rute
          </Link>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>
            {routeName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {currentQuarter} · direcția {direction} · {drivers.length} șoferi · {stops.length}{' '}
            porțiuni
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <DirectionToggle current={direction} crmRouteId={crmRouteId} quarter={currentQuarter} />
          <QuarterSelect quarters={quarters} current={currentQuarter} />
        </div>
      </div>

      <UsageBox
        title="Ce afișează această pagină"
        what="Zoom-ul maxim: pentru o singură rută, cum se descurcă fiecare șofer pe fiecare porțiune (de la o stație la următoarea). Aici se văd pattern-urile ascunse — un șofer poate fi bun pe rută în general dar să piardă consistent pasageri pe UN segment anume."
        howToUse={[
          'COLOANĂ roșie la toată lumea = problema e stația (clienții o evită / programul nu se potrivește).',
          'RÂND cu o singură celulă foarte roșie = problema specifică a șoferului pe stația aia.',
          'Compară tur vs retur — unii sunt buni într-o direcție și slabi în cealaltă.',
          'Material pentru coaching: arăți șoferului exact unde subperformează. Nu ghiciți, aveți date.',
        ]}
      />

      {drivers.length === 0 ? (
        <div
          className="card"
          style={{
            padding: 32,
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
        >
          Nu există date suficiente pentru această rută/direcție/trimestru.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
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
                    minWidth: 180,
                  }}
                >
                  Șofer
                </th>
                {stops.map((s) => (
                  <th
                    key={s.order}
                    style={{
                      padding: '8px 4px',
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'center',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      fontSize: 10,
                      whiteSpace: 'nowrap',
                      background: 'var(--bg-elevated)',
                    }}
                    title={s.name}
                  >
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>
                      #{s.order}
                    </div>
                    <div style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id}>
                  <td
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      background: '#fff',
                      borderBottom: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      padding: '6px 12px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Link
                      href={`/analytics/moneyball/sofer/${d.id}?q=${currentQuarter}`}
                      style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {d.name}
                    </Link>
                  </td>
                  {stops.map((s) => {
                    const cell = cellIndex.get(`${d.id}-${s.order}`);
                    if (!cell) {
                      return (
                        <td
                          key={s.order}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: 'rgba(0,0,0,0.01)',
                          }}
                        />
                      );
                    }
                    return (
                      <td
                        key={s.order}
                        style={{
                          ...devBgStyle(cell.avg_deviation_pct),
                          borderBottom: '1px solid var(--border)',
                          padding: '6px 8px',
                          textAlign: 'center',
                          fontWeight: 600,
                        }}
                        title={`${d.name} · ${s.name} · ${cell.n_trips} curse`}
                      >
                        {formatPct(cell.avg_deviation_pct)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DirectionToggle({
  current,
  crmRouteId,
  quarter,
}: {
  current: 'tur' | 'retur';
  crmRouteId: number;
  quarter: string;
}) {
  return (
    <div className="mode-toggle">
      {(['tur', 'retur'] as const).map((dir) => (
        <Link
          key={dir}
          href={`/analytics/moneyball/heatmap-segmente/${crmRouteId}?q=${quarter}&d=${dir}`}
          className={current === dir ? 'mode-btn mode-btn-active' : 'mode-btn'}
          style={{ textDecoration: 'none' }}
        >
          {dir}
        </Link>
      ))}
    </div>
  );
}
