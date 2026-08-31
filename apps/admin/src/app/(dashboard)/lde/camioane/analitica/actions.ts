'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { chisinauDayBounds } from '@/lib/chisinau-time';
import type { CursaCuMetrici, ZiStare } from '@/lib/lde/camioane-analitica';

export type DateAnalitica = {
  de: string;
  la: string;
  zile: string[];
  camioane: { vehicleId: string; plate: string }[];
  curse: CursaCuMetrici[];
  stari: ZiStare[];
  kmZilnic: { vehicleId: string; date: string; km: number }[];
};

/** Zilele calendaristice din interval, inclusiv capetele. */
function zileleDintre(de: string, la: string): string[] {
  const out: string[] = [];
  const d = new Date(`${de}T12:00:00Z`);
  const stop = new Date(`${la}T12:00:00Z`);
  // 92 de zile = un trimestru. Peste asta cele trei interogări cu fereastră ar
  // intra în plafonul tăcut de 1000 al PostgREST (perf review 31.08).
  while (d <= stop && out.length < 92) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function getAnalitica(de: string, la: string): Promise<DateAnalitica> {
  // Analitica e a administratorului (decizia Ion): dispecerul planifică, nu se
  // evaluează singur. Aici aruncăm, nu întoarcem { error } — e citire ADMIN-only.
  requireRole(await verifySession(), 'ADMIN');

  const zile = zileleDintre(de, la);
  const fromIso = chisinauDayBounds(zile[0]).fromIso;
  const toIso = chisinauDayBounds(zile[zile.length - 1]).toIso;
  const sb = getSupabase();

  // Camioanele se citesc PRIMELE: fără lista lor, km-ii zilnici ar veni pe toată
  // flota LDE (4000+ rânduri pe 30 de zile) și PostgREST i-ar tăia TĂCUT la 1000
  // — procentul de km goi ieșea fals din prima zi (perf review 31.08, Critical).
  const vehRes = await sb.from('vehicles').select('id, plate_number')
    .eq('active', true).eq('is_lde', true).contains('directions', ['camioane']).order('plate_number');
  if (vehRes.error) { console.error('[camioane/analitica]', vehRes.error.message); throw new Error('Nu am putut citi flota'); }
  const idCamioane = ((vehRes.data ?? []) as { id: string }[]).map((v) => v.id);

  const [curseRes, stariRes, kmRes] = await Promise.all([
    sb.from('lde_truck_trips')
      .select(`id, vehicle_id, cargo, status, load_planned_at, unload_planned_at,
               vehicles:vehicle_id ( plate_number ), drivers:driver_id ( full_name ),
               load_point:load_point_id ( name ), unload_point:unload_point_id ( name ),
               metrici:lde_truck_trip_metrics ( km_real, km_ideal, km_deviation, stops_over_30min,
                                                load_delay_min, unload_delay_min )`)
      .lt('load_planned_at', toIso).gte('unload_planned_at', fromIso)
      .in('vehicle_id', idCamioane)
      .order('load_planned_at'),
    sb.from('lde_truck_day_states').select('vehicle_id, date, state')
      .in('vehicle_id', idCamioane)
      .gte('date', zile[0]).lte('date', zile[zile.length - 1]),
    // Filtrare în SQL, nu în JS: altfel intrau autobuzele și se pierdea plafonul.
    sb.from('lde_vehicle_gps_daily').select('vehicle_id, date, km_total')
      .in('vehicle_id', idCamioane)
      .gte('date', zile[0]).lte('date', zile[zile.length - 1]),
  ]);
  for (const r of [curseRes, stariRes, kmRes]) {
    if (r.error) { console.error('[camioane/analitica]', r.error.message); throw new Error('Nu am putut citi analitica'); }
  }

  type Emb<T> = T | T[] | null;
  const unul = <T,>(x: Emb<T>): T | null => (Array.isArray(x) ? x[0] ?? null : x);

  type VehRow = { id: string; plate_number: string };
  const camioane = ((vehRes.data ?? []) as VehRow[]).map((v) => ({ vehicleId: v.id, plate: v.plate_number }));

  type MetriciRow = {
    km_real: number | null; km_ideal: number | null; km_deviation: number | null;
    stops_over_30min: number | null; load_delay_min: number | null; unload_delay_min: number | null;
  };
  type CursaRow = {
    id: string; vehicle_id: string; cargo: string | null; status: string;
    load_planned_at: string; unload_planned_at: string;
    vehicles: Emb<{ plate_number: string }>; drivers: Emb<{ full_name: string }>;
    load_point: Emb<{ name: string }>; unload_point: Emb<{ name: string }>;
    metrici: Emb<MetriciRow>;
  };

  const curse: CursaCuMetrici[] = ((curseRes.data ?? []) as CursaRow[]).map((t) => {
    const m = unul(t.metrici);
    return {
      tripId: t.id,
      vehicleId: t.vehicle_id,
      plate: unul(t.vehicles)?.plate_number ?? '—',
      driverName: unul(t.drivers)?.full_name ?? null,
      cargo: t.cargo,
      de: unul(t.load_point)?.name ?? null,
      la: unul(t.unload_point)?.name ?? null,
      status: t.status,
      loadPlannedAt: t.load_planned_at,
      unloadPlannedAt: t.unload_planned_at,
      kmReal: m?.km_real ?? null,
      kmIdeal: m?.km_ideal ?? null,
      kmDeviation: m?.km_deviation ?? null,
      stops: m?.stops_over_30min ?? null,
      loadDelayMin: m?.load_delay_min ?? null,
      unloadDelayMin: m?.unload_delay_min ?? null,
    };
  });

  type StareRow = { vehicle_id: string; date: string; state: 'reparatie' | 'odihna' };
  type KmRow = { vehicle_id: string; date: string; km_total: number | null };

  return {
    de: zile[0],
    la: zile[zile.length - 1],
    zile,
    camioane,
    curse,
    stari: ((stariRes.data ?? []) as StareRow[]).map((s) => ({ vehicleId: s.vehicle_id, date: s.date, state: s.state })),
    kmZilnic: ((kmRes.data ?? []) as KmRow[])
      .map((k) => ({ vehicleId: k.vehicle_id, date: k.date, km: Number(k.km_total ?? 0) })),
  };
}
