import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { formatLei, formatPct, devColor } from '@/lib/moneyball/format';
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
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Clasament șoferi — {currentQuarter}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Deviație procentuală față de normă · minim {MIN_TRIPS} curse pe rută ·{' '}
            {rows.length} combinații șofer × rută
          </p>
        </div>
        <QuarterSelect quarters={quarters} current={currentQuarter} />
      </div>

      <UsageBox
        title="Ce afișează această pagină"
        what="Clasamentul Moneyball al combinațiilor șofer × rută pe trimestrul ales. Nu arată cifre brute de încasare (care depind de ruta pe care merge șoferul), ci deviația procentuală față de norma contextului — adică cât de bine vinde fiecare șofer comparat cu norma pe aceeași rută, aceeași zi-tip, aceeași capacitate mașină."
        howToUse={[
          'Top 10 = șoferi de păstrat, promovat, dat bonus. Sunt vânzătorii reali.',
          'Bottom 10 = șoferi cu care ai o discuție. Nu neapărat să-i concediezi — poate doar să-i muți pe alte rute (vezi heatmap-ul).',
          'Dacă un șofer apare atât în Top cât și în Bottom pe rute diferite = Moneyball clasic. Rotește-l pe ruta unde e bun.',
          'Click pe numele șoferului pentru fișa detaliată. Schimbă trimestrul din dreapta sus pentru comparații în timp.',
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingTable title="Top 10 vânzători" accent="emerald" rows={top} />
        <RankingTable title="Bottom 10 vânzători" accent="red" rows={bottom} />
      </div>
    </div>
  );
}

function RankingTable({
  title,
  accent,
  rows,
}: {
  title: string;
  accent: 'emerald' | 'red';
  rows: RankingRow[];
}) {
  const borderClass = accent === 'emerald' ? 'border-emerald-200' : 'border-red-200';
  const headerClass = accent === 'emerald' ? 'bg-emerald-50' : 'bg-red-50';

  return (
    <div className={`bg-white rounded-xl border ${borderClass} overflow-hidden`}>
      <div className={`px-5 py-3 ${headerClass} border-b ${borderClass}`}>
        <h2 className="font-semibold text-slate-900">{title}</h2>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Șofer</th>
            <th className="text-left px-4 py-2 font-medium">Ruta</th>
            <th className="text-right px-4 py-2 font-medium">Dev</th>
            <th className="text-right px-4 py-2 font-medium">Curse</th>
            <th className="text-right px-4 py-2 font-medium">VORP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={`${r.driver_id}-${r.crm_route_id}`} className="hover:bg-slate-50">
              <td className="px-4 py-2">
                <Link
                  href={`/analytics/moneyball/sofer/${r.driver_id}?q=${r.quarter}`}
                  className="text-slate-900 hover:underline"
                >
                  {r.driver_name ?? '—'}
                </Link>
              </td>
              <td className="px-4 py-2 text-slate-600 text-xs max-w-xs truncate">
                {r.route_name ?? '—'}
              </td>
              <td
                className={`px-4 py-2 text-right font-medium ${devColor(r.avg_deviation_pct)}`}
              >
                {formatPct(r.avg_deviation_pct)}
              </td>
              <td className="px-4 py-2 text-right text-slate-600">{r.n_trips}</td>
              <td className="px-4 py-2 text-right text-slate-700 font-mono text-xs">
                {r.vorp_lei !== null ? formatLei(r.vorp_lei) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
