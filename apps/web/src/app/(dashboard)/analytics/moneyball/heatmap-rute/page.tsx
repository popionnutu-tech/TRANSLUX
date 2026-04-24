import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { formatPct, devBgColor } from '@/lib/moneyball/format';
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
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Heatmap șoferi × rute — {currentQuarter}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeDrivers.length} șoferi · {routes.length} rute · minim{' '}
            {MIN_TRIPS_PER_CELL} curse pe celulă
          </p>
        </div>
        <QuarterSelect quarters={quarters} current={currentQuarter} />
      </div>

      <UsageBox
        title="Ce afișează această pagină"
        what="Matricea completă: pe fiecare rând un șofer (sortat după VORP total), pe fiecare coloană o rută. Fiecare celulă colorată arată cum se descurcă acel șofer pe acea rută vs norma. Verde = vinde peste așteptări, roșu = sub. Gol = nu a condus pe acea rută."
        howToUse={[
          'Caută rândurile cu multe verzi închise = șoferi buni pe orice rută (talent pur).',
          'Caută rândurile mixte (parte roșu, parte verde) = șoferi cu specializare. Pune-i DOAR pe rutele verzi.',
          'Caută coloanele unde toată lumea e roșie = ruta nu e problema șoferului, e ruta însăși (reconsideră orarul sau prețul).',
          'Click pe o celulă = zoom pe porțiuni (vezi unde exact în ruta aia vinde slab).',
          'Coloana VORP din dreapta = cât câștigă/pierde șoferul cumulat pe tot trimestrul.',
        ]}
      />

      <Legend />

      <div className="bg-white rounded-xl border border-slate-200 overflow-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left font-medium text-slate-600 z-10">
                Șofer
              </th>
              <th className="sticky left-[180px] bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-right font-medium text-slate-600 z-10">
                VORP
              </th>
              {routes.map((r) => (
                <th
                  key={r.id}
                  className="border-b border-slate-200 px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap max-w-[140px] truncate"
                  title={r.name}
                >
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeDrivers.map((d) => (
              <tr key={d.driver_id} className="hover:bg-slate-50">
                <td className="sticky left-0 bg-white hover:bg-slate-50 border-r border-b border-slate-100 px-3 py-1.5 whitespace-nowrap">
                  <Link
                    href={`/analytics/moneyball/sofer/${d.driver_id}?q=${currentQuarter}`}
                    className="text-slate-900 hover:underline font-medium"
                  >
                    {d.driver_name ?? '—'}
                  </Link>
                </td>
                <td className="sticky left-[180px] bg-white hover:bg-slate-50 border-r border-b border-slate-100 px-3 py-1.5 text-right font-mono text-slate-700">
                  {d.vorp_total !== null
                    ? Math.round(d.vorp_total).toLocaleString('ro-RO')
                    : '—'}
                </td>
                {routes.map((r) => {
                  const cell = cellIndex.get(`${d.driver_id}-${r.id}`);
                  if (!cell) {
                    return <td key={r.id} className="border-b border-slate-100 bg-slate-50/50" />;
                  }
                  return (
                    <td
                      key={r.id}
                      className={`border-b border-slate-100 px-2 py-1.5 text-center ${devBgColor(cell.avg_deviation_pct)}`}
                    >
                      <Link
                        href={`/analytics/moneyball/heatmap-segmente/${r.id}?q=${currentQuarter}`}
                        className="block font-medium"
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

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-slate-500">
      <span>Legendă:</span>
      <span className="px-2 py-1 rounded bg-emerald-500 text-white">+10%+</span>
      <span className="px-2 py-1 rounded bg-emerald-200">+5% la +10%</span>
      <span className="px-2 py-1 rounded bg-emerald-50">0 la +5%</span>
      <span className="px-2 py-1 rounded bg-amber-50">-5 la 0</span>
      <span className="px-2 py-1 rounded bg-orange-200">-10 la -5</span>
      <span className="px-2 py-1 rounded bg-red-500 text-white">-10%+</span>
    </div>
  );
}
