import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { formatPct, devBgColor } from '@/lib/moneyball/format';
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

  const { data: quartersData } = await supabase
    .from('v_moneyball_segments')
    .select('quarter')
    .eq('crm_route_id', crmRouteId)
    .order('quarter', { ascending: false });

  const quarters = Array.from(new Set((quartersData ?? []).map((r) => r.quarter)));
  const currentQuarter = q ?? quarters[0] ?? '2026-Q2';

  const { data: routeInfo } = await supabase
    .from('crm_routes')
    .select('dest_from_ro, dest_to_ro')
    .eq('id', crmRouteId)
    .single();

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
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Link
            href={`/analytics/moneyball/heatmap-rute?q=${currentQuarter}`}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            ← Înapoi la heatmap rute
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900 mt-1">
            Heatmap segmente — {routeName}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {currentQuarter} · direcția {direction} · {drivers.length} șoferi ·{' '}
            {stops.length} porțiuni
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <DirectionToggle current={direction} crmRouteId={crmRouteId} quarter={currentQuarter} />
          <QuarterSelect quarters={quarters} current={currentQuarter} />
        </div>
      </div>

      <UsageBox
        title="Ce afișează această pagină"
        what="Zoom-ul maxim: pentru o singură rută, cum se descurcă fiecare șofer pe fiecare porțiune (de la o stație la următoarea). Aici se văd pattern-urile ascunse — un șofer poate fi bun pe rută în general, dar să piardă consistent pasageri pe UN anumit segment."
        howToUse={[
          'Dacă o COLOANĂ (porțiune) e roșie la toți șoferii = problema e stația aia (poate clienții o evită, poate programul nu se potrivește).',
          'Dacă un RÂND (șofer) are o singură celulă roșie foarte vizibilă = acolo e problema lui specifică. Întreabă-l ce se întâmplă la stația aia (poate nu oprește, nu strigă destinația, ajunge cu întârziere).',
          'Compară tur vs retur (butonul din dreapta sus) — unii șoferi sunt buni într-o direcție și slabi în alta.',
          'Folosește asta pentru coaching individual: duci șoferul la un cafea și-i arăți exact unde subperformează. Nu ghiciți împreună, aveți date.',
        ]}
      />

      {drivers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          Nu există date suficiente pentru această rută/direcție/trimestru.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left font-medium text-slate-600 z-10">
                  Șofer
                </th>
                {stops.map((s) => (
                  <th
                    key={s.order}
                    className="border-b border-slate-200 px-2 py-2 text-center font-medium text-slate-600 whitespace-nowrap"
                    title={s.name}
                  >
                    <div className="text-[10px] text-slate-400 font-normal">#{s.order}</div>
                    <div className="max-w-[80px] truncate">{s.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="sticky left-0 bg-white hover:bg-slate-50 border-r border-b border-slate-100 px-3 py-1.5 whitespace-nowrap">
                    <Link
                      href={`/analytics/moneyball/sofer/${d.id}?q=${currentQuarter}`}
                      className="text-slate-900 hover:underline font-medium"
                    >
                      {d.name}
                    </Link>
                  </td>
                  {stops.map((s) => {
                    const cell = cellIndex.get(`${d.id}-${s.order}`);
                    if (!cell) {
                      return (
                        <td key={s.order} className="border-b border-slate-100 bg-slate-50/50" />
                      );
                    }
                    return (
                      <td
                        key={s.order}
                        className={`border-b border-slate-100 px-2 py-1.5 text-center ${devBgColor(cell.avg_deviation_pct)}`}
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
    <div className="flex bg-slate-100 rounded-lg p-0.5">
      {(['tur', 'retur'] as const).map((dir) => (
        <Link
          key={dir}
          href={`/analytics/moneyball/heatmap-segmente/${crmRouteId}?q=${quarter}&d=${dir}`}
          className={`px-3 py-1 text-sm rounded ${
            current === dir
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          {dir}
        </Link>
      ))}
    </div>
  );
}
