import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { formatLei, formatPct, devColor } from '@/lib/moneyball/format';
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
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Driver Value (VORP) — {currentQuarter}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Câți lei aduce/pierde fiecare șofer față de un șofer mediu pus pe aceleași curse ·
            minim {MIN_TRIPS} curse
          </p>
        </div>
        <QuarterSelect quarters={quarters} current={currentQuarter} />
      </div>

      <UsageBox
        title="Ce afișează această pagină"
        what="VORP (Value Over Replacement Player) — numărul de lei pe care fiecare șofer i-a adus (sau pierdut) față de un șofer mediu pus pe aceleași curse. Formula ia în considerare: deviația șoferului, numărul de curse făcute, și prețul mediu real al biletelor pe acele rute. Sortat descendent — primul = cel mai valoros șofer din toată compania pe acel trimestru."
        howToUse={[
          'KPI-ul principal pentru decizii de compensare: VORP pozitiv mare = bonus, retenție, recunoaștere publică.',
          'VORP negativ mare = conversație dificilă. Dar atenție: verifică-i mai întâi clasamentul Heatmap — poate e pe rute slabe. Dacă și acolo e roșu peste tot = problema e șoferul. Dacă e mixt = problema e alocarea.',
          'Totalurile de sus: „VORP pozitiv" = bani pe care îi câștigi extra datorită șoferilor buni. „VORP negativ" = bani pe care îi pierzi din cauza celor slabi.',
          '„Câștig Moneyball potențial" = dacă îi convingi pe cei slabi să atingă media (prin coaching sau mutare), câți bani câștigi pe trimestru.',
          'La sfârșit de trimestru: folosește lista asta pentru plătirea bonusurilor variabile. Obiectiv, transparent, bazat pe date.',
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-emerald-200 px-4 py-3">
          <div className="text-xs text-emerald-700">Total VORP pozitiv</div>
          <div className="text-xl font-semibold text-emerald-700 mt-1">
            +{formatLei(totalVorpPositive)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {drivers.filter((d) => (d.vorp_total ?? 0) > 0).length} șoferi peste media
          </div>
        </div>
        <div className="bg-white rounded-xl border border-red-200 px-4 py-3">
          <div className="text-xs text-red-700">Total VORP negativ</div>
          <div className="text-xl font-semibold text-red-700 mt-1">
            {formatLei(totalVorpNegative)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {drivers.filter((d) => (d.vorp_total ?? 0) < 0).length} șoferi sub media
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <div className="text-xs text-slate-500">Câștig Moneyball potențial</div>
          <div className="text-xl font-semibold text-slate-900 mt-1">
            ~{formatLei(Math.abs(totalVorpNegative))}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            dacă recuperezi șoferii sub media
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-right px-4 py-2 font-medium w-12">#</th>
              <th className="text-left px-4 py-2 font-medium">Șofer</th>
              <th className="text-right px-4 py-2 font-medium">VORP</th>
              <th className="text-right px-4 py-2 font-medium">Scor mediu</th>
              <th className="text-right px-4 py-2 font-medium">Curse</th>
              <th className="text-right px-4 py-2 font-medium">Rute</th>
              <th className="text-right px-4 py-2 font-medium">Total lei</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {drivers.map((d, idx) => (
              <tr key={d.driver_id} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-right text-slate-400 font-mono text-xs">
                  {idx + 1}
                </td>
                <td className="px-4 py-2">
                  <Link
                    href={`/analytics/moneyball/sofer/${d.driver_id}?q=${currentQuarter}`}
                    className="text-slate-900 hover:underline font-medium"
                  >
                    {d.driver_name ?? '—'}
                  </Link>
                </td>
                <td
                  className={`px-4 py-2 text-right font-mono font-semibold ${
                    (d.vorp_total ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {d.vorp_total !== null && d.vorp_total >= 0 ? '+' : ''}
                  {formatLei(d.vorp_total)}
                </td>
                <td
                  className={`px-4 py-2 text-right font-medium ${devColor(d.weighted_avg_deviation_pct)}`}
                >
                  {formatPct(d.weighted_avg_deviation_pct)}
                </td>
                <td className="px-4 py-2 text-right text-slate-600">{d.total_trips}</td>
                <td className="px-4 py-2 text-right text-slate-600">{d.n_routes}</td>
                <td className="px-4 py-2 text-right text-slate-600 font-mono text-xs">
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
