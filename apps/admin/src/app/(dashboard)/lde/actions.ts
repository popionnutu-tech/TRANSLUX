'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';

export type LdeTopPererashod = {
  vehicle_id: string;
  plate_number: string;
  pererashod_l_per_100km: number;          // depășire reală (actual − normă)
  actual_consumption_l_per_100km: number;  // consum brut (context)
  level: string;
};

export type LdeOverview = {
  vehicle_types_count: number;
  uzine_count: number;
  factory_routes_count: number;
  driver_extras_count: number;
  active_assignments_count: number;
  // Operațional (ultimele 30 zile)
  combustibil_litri_30d: number;
  combustibil_lei_30d: number;
  km_total_30d: number;
  alerte_deschise: { verde: number; galben: number; rosu: number };
  top_pererashod: LdeTopPererashod[];
};

export async function getLdeOverview(): Promise<LdeOverview> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  const sinceDate = sinceIso.slice(0, 10);

  const [
    { count: vehicleTypes },
    { count: uzine },
    { count: factoryRoutes },
    { count: driverExtras },
    { count: activeAssignments },
    fuelRes,
    gpsRes,
    alertsRes,
    topRes,
  ] = await Promise.all([
    sb.from('lde_vehicle_types').select('*', { count: 'exact', head: true }),
    sb.from('lde_uzine').select('*', { count: 'exact', head: true }),
    sb.from('lde_factory_routes').select('*', { count: 'exact', head: true }),
    sb.from('lde_driver_extras').select('*', { count: 'exact', head: true }),
    sb
      .from('lde_active_assignments')
      .select('*', { count: 'exact', head: true })
      .is('valid_to', null),
    // combustibil 30 zile (litri + lei)
    sb
      .from('lde_fuel_alimentari')
      .select('litri, suma_lei')
      .gte('alimentat_at', sinceIso),
    // km flotă 30 zile
    sb
      .from('lde_vehicle_gps_daily')
      .select('km_total')
      .gte('date', sinceDate),
    // alerte deschise (status='nou') grupate pe level
    sb.from('lde_dt_alerts').select('level').eq('status', 'nou'),
    // top 5 după depășire reală (perерасход = actual − normă), roșu deschis
    sb
      .from('lde_dt_alerts')
      .select('vehicle_id, pererashod_l_per_100km, actual_consumption_l_per_100km, level')
      .eq('status', 'nou')
      .eq('level', 'rosu')
      .order('pererashod_l_per_100km', { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  // combustibil — toleranță la tabel gol
  const fuelRows = (fuelRes.data ?? []) as Array<{ litri: number | null; suma_lei: number | null }>;
  const combustibil_litri_30d = fuelRows.reduce((s, r) => s + Number(r.litri ?? 0), 0);
  const combustibil_lei_30d = fuelRows.reduce((s, r) => s + Number(r.suma_lei ?? 0), 0);

  // km flotă — toleranță la tabel gol
  const gpsRows = (gpsRes.data ?? []) as Array<{ km_total: number | null }>;
  const km_total_30d = gpsRows.reduce((s, r) => s + Number(r.km_total ?? 0), 0);

  // alerte deschise pe level
  const alertRows = (alertsRes.data ?? []) as Array<{ level: string }>;
  const alerte_deschise = { verde: 0, galben: 0, rosu: 0 };
  for (const r of alertRows) {
    if (r.level === 'verde') alerte_deschise.verde++;
    else if (r.level === 'galben') alerte_deschise.galben++;
    else if (r.level === 'rosu') alerte_deschise.rosu++;
  }

  // top pererashod — rezolvă plăcuțele într-un al doilea query (toleranță la gol)
  const topRows = (topRes.data ?? []) as Array<{
    vehicle_id: string;
    pererashod_l_per_100km: number | null;
    actual_consumption_l_per_100km: number | null;
  }>;
  let top_pererashod: LdeTopPererashod[] = [];
  if (topRows.length > 0) {
    const vehicleIds = [...new Set(topRows.map((r) => r.vehicle_id))];
    const { data: plates } = await sb
      .from('vehicles')
      .select('id, plate_number')
      .in('id', vehicleIds);
    const plateMap = new Map(
      ((plates ?? []) as Array<{ id: string; plate_number: string }>).map((v) => [v.id, v.plate_number])
    );
    top_pererashod = topRows.map((r) => ({
      vehicle_id: r.vehicle_id,
      plate_number: plateMap.get(r.vehicle_id) ?? '—',
      pererashod_l_per_100km: Number(r.pererashod_l_per_100km ?? 0),
      actual_consumption_l_per_100km: Number(r.actual_consumption_l_per_100km ?? 0),
      level: 'rosu',
    }));
  }

  return {
    vehicle_types_count: vehicleTypes ?? 0,
    uzine_count: uzine ?? 0,
    factory_routes_count: factoryRoutes ?? 0,
    driver_extras_count: driverExtras ?? 0,
    active_assignments_count: activeAssignments ?? 0,
    combustibil_litri_30d,
    combustibil_lei_30d,
    km_total_30d,
    alerte_deschise,
    top_pererashod,
  };
}
