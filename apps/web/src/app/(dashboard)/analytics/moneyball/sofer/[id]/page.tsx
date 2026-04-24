import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { formatLei, formatPct, devColor, devBgColor } from '@/lib/moneyball/format';
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

  const { data: driver } = await supabase
    .from('drivers')
    .select('id, full_name, phone')
    .eq('id', driverId)
    .single();

  const { data: quartersData } = await supabase
    .from('v_moneyball_ranking')
    .select('quarter')
    .eq('driver_id', driverId)
    .order('quarter', { ascending: false });

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
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Link
            href="/analytics/moneyball/clasament"
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            ← Clasament
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900 mt-1">
            {driver?.full_name ?? 'Șofer necunoscut'}
          </h1>
          {driver?.phone && <p className="text-sm text-slate-500 mt-0.5">{driver.phone}</p>}
        </div>
        <QuarterSelect quarters={quarters} current={currentQuarter} />
      </div>

      <UsageBox
        title="Ce afișează această pagină"
        what="Fișa completă a șoferului pentru trimestrul ales. Scor mediu ponderat (cântărit după numărul de curse pe rută), VORP total (câți lei a adus/pierdut față de un șofer mediu pus pe aceleași curse), performanța defalcată pe fiecare rută și top 10 porțiuni unde vinde cel mai slab."
        howToUse={[
          'Privești scorul mediu: sub 0 = vinde sub normă, peste 0 = peste. VORP îți spune câți lei înseamnă asta concret.',
          'Tabelul „Performanța pe rute" îți arată unde e bun și unde e slab. Cele roșii = candidate pentru a-l MUTA de acolo.',
          'Tabelul „Cele mai slabe porțiuni" = material pentru discuția personală cu el. Nu spui „ești slab vânzător", ci „la stația X pierzi sistematic pasageri, ce se întâmplă acolo?".',
          'Pentru decizii de salariu/bonus: uită-te la VORP absolut, nu la scor procentual. Un șofer cu +2% dar multe curse aduce mai mult decât unul cu +15% și puține curse.',
        ]}
      />

      <DriverInsight driverId={driverId} quarter={currentQuarter} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Scor mediu"
          value={
            totals?.weighted_avg_deviation_pct !== null &&
            totals?.weighted_avg_deviation_pct !== undefined
              ? formatPct(totals.weighted_avg_deviation_pct)
              : '—'
          }
          tone={(totals?.weighted_avg_deviation_pct ?? 0) >= 0 ? 'pos' : 'neg'}
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
          tone={(totals?.vorp_total ?? 0) >= 0 ? 'pos' : 'neg'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">Performanța pe rute</h2>
            <p className="text-xs text-slate-500 mt-0.5">Sortat descendent după scor</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-white text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Ruta</th>
                <th className="text-right px-4 py-2 font-medium">Dev</th>
                <th className="text-right px-4 py-2 font-medium">Curse</th>
                <th className="text-right px-4 py-2 font-medium">Lei</th>
                <th className="text-right px-4 py-2 font-medium">VORP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {routes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Nu sunt curse în acest trimestru.
                  </td>
                </tr>
              )}
              {routes.map((r) => (
                <tr key={r.crm_route_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-700 text-xs max-w-[240px] truncate">
                    <Link
                      href={`/analytics/moneyball/heatmap-segmente/${r.crm_route_id}?q=${currentQuarter}`}
                      className="hover:underline"
                    >
                      {r.route_name ?? '—'}
                    </Link>
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-medium ${devColor(r.avg_deviation_pct)}`}
                  >
                    {formatPct(r.avg_deviation_pct)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.n_trips}</td>
                  <td className="px-4 py-2 text-right text-slate-600 font-mono text-xs">
                    {formatLei(r.total_lei_actual)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-700 font-mono text-xs">
                    {r.vorp_lei !== null ? formatLei(r.vorp_lei) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">Cele mai slabe 10 porțiuni</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Unde vinde cel mai slab (minim 2 curse)
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-white text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Stație</th>
                <th className="text-left px-4 py-2 font-medium">Dir</th>
                <th className="text-right px-4 py-2 font-medium">Dev</th>
                <th className="text-right px-4 py-2 font-medium">Curse</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {segments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Nu sunt suficiente date pe porțiuni.
                  </td>
                </tr>
              )}
              {segments.map((s) => (
                <tr
                  key={`${s.crm_route_id}-${s.direction}-${s.stop_from_order}`}
                  className="hover:bg-slate-50"
                >
                  <td className="px-4 py-2 text-slate-700 text-xs">
                    <Link
                      href={`/analytics/moneyball/heatmap-segmente/${s.crm_route_id}?q=${currentQuarter}&d=${s.direction}`}
                      className="hover:underline"
                    >
                      {s.stop_name ?? `Stația #${s.stop_from_order}`}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{s.direction}</td>
                  <td
                    className={`px-4 py-2 text-right font-medium text-xs ${devBgColor(s.avg_deviation_pct)}`}
                  >
                    {formatPct(s.avg_deviation_pct)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">{s.n_trips}</td>
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
  tone,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg';
}) {
  const toneClass =
    tone === 'pos' ? 'text-emerald-700' : tone === 'neg' ? 'text-red-700' : 'text-slate-900';
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}
