'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { computeCardTopup } from '@translux/db';

// ────────────────────────────────────────────────────────────────────────────
// NOTĂ (pas viitor): postarea automată a sumelor pe PORTALUL CARDURILOR de
// combustibil NU se face aici. Portalul are credențiale externe și va fi
// integrat separat (Playwright headless). Până atunci sugestiile se citesc din
// acest tabel și se introduc MANUAL pe portal de către admin.
// ────────────────────────────────────────────────────────────────────────────

export interface CardSuggestionRow {
  plate: string;
  type: string | null;            // display_name al tipului (null = fără tip)
  norm: number;                   // norma efectivă l/100km
  plannedKm: number;              // km plan folosiți la calcul
  liters: number;                 // litri stricti după normă
  litersWithReserve: number;      // litri + rezervă %
  lei: number | null;             // cost lei (null dacă fuelPriceLei lipsește)
}

export interface CardSuggestionsResult {
  rows: CardSuggestionRow[];
  params: { plannedKmDefault: number; reservePct: number; fuelPriceLei: number };
  totals: { litersWithReserve: number; lei: number };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Sugestii de completare card pentru fiecare mașină activă cu normă efectivă.
 *
 * plannedKm = suma km plan a curselor uzinei pe care o deservește mașina
 *             (lde_route_geometry.total_km_estimated, route_kind='uzina_factory'),
 *             altfel `plannedKmDefault`.
 * Norma efectivă = COALESCE(measured, type.norm_l_per_100km).
 *
 * Calcul BATCH, fără N+1: 4 query-uri fixe indiferent de numărul de mașini.
 */
export async function getCardSuggestions(
  plannedKmDefault = 200,
  reservePct = 10,
  fuelPriceLei = 22,
): Promise<CardSuggestionsResult> {
  requireRole(await verifySession(), 'ADMIN');

  const sb = getSupabase();

  // 1) Mașini active + normă + tip (același pattern ca lde/vehicule).
  const vehiclesP = sb
    .from('vehicles')
    .select(
      'id, plate_number, lde_vehicle_norms ( measured_consumption_l_per_100km, in_repair, lde_vehicle_types ( display_name, norm_l_per_100km ) )'
    )
    .eq('active', true)
    .order('plate_number');

  // 2) Maparea mașină → uzină (prin schimb → cursă). is_primary nu contează:
  //    o mașină ataşată oricărei curse a unei uzine deservește acea uzină.
  const vehicleUzinaP = sb
    .from('lde_factory_route_vehicles')
    .select(
      'vehicle_id, lde_factory_route_shifts!inner ( lde_factory_routes!inner ( uzina_id ) )'
    );

  // 3) Toate curselе factory cu id + uzina (pentru a lega geometria de uzină).
  const routesP = sb
    .from('lde_factory_routes')
    .select('id, uzina_id')
    .eq('active', true);

  // 4) Geometria curselor factory (km estimat per cursă).
  const geometryP = sb
    .from('lde_route_geometry')
    .select('route_id, total_km_estimated')
    .eq('route_kind', 'uzina_factory');

  const [vehiclesRes, vehicleUzinaRes, routesRes, geometryRes] = await Promise.all([
    vehiclesP,
    vehicleUzinaP,
    routesP,
    geometryP,
  ]);

  if (vehiclesRes.error) throw new Error(vehiclesRes.error.message);
  if (vehicleUzinaRes.error) throw new Error(vehicleUzinaRes.error.message);
  if (routesRes.error) throw new Error(routesRes.error.message);
  if (geometryRes.error) throw new Error(geometryRes.error.message);

  // km estimat per cursă (route_id → km)
  const kmByRoute = new Map<string, number>();
  for (const g of (geometryRes.data || []) as any[]) {
    if (g.total_km_estimated != null) kmByRoute.set(g.route_id as string, Number(g.total_km_estimated));
  }

  // suma km plan per uzină (doar curse cu geometrie cunoscută)
  const kmByUzina = new Map<string, number>();
  for (const r of (routesRes.data || []) as any[]) {
    const km = kmByRoute.get(r.id as string);
    if (km == null) continue;
    kmByUzina.set(r.uzina_id as string, (kmByUzina.get(r.uzina_id as string) ?? 0) + km);
  }

  // mașină → uzină (prima uzină găsită; mașinile uzine deservesc o singură fabrică)
  const uzinaByVehicle = new Map<string, string>();
  for (const v of (vehicleUzinaRes.data || []) as any[]) {
    if (uzinaByVehicle.has(v.vehicle_id)) continue;
    const shift = Array.isArray(v.lde_factory_route_shifts)
      ? v.lde_factory_route_shifts[0]
      : v.lde_factory_route_shifts;
    const route = shift
      ? Array.isArray(shift.lde_factory_routes)
        ? shift.lde_factory_routes[0]
        : shift.lde_factory_routes
      : null;
    if (route?.uzina_id) uzinaByVehicle.set(v.vehicle_id as string, route.uzina_id as string);
  }

  const rows: CardSuggestionRow[] = [];

  for (const v of (vehiclesRes.data || []) as any[]) {
    const norm = Array.isArray(v.lde_vehicle_norms) ? v.lde_vehicle_norms[0] : v.lde_vehicle_norms;
    const type = norm
      ? Array.isArray(norm.lde_vehicle_types)
        ? norm.lde_vehicle_types[0]
        : norm.lde_vehicle_types
      : null;

    const measured: number | null = norm?.measured_consumption_l_per_100km ?? null;
    const normType: number | null = type?.norm_l_per_100km ?? null;
    const effectiveNorm = measured ?? normType;

    // Fără normă efectivă → nu putem sugera (mașină fără tip atribuit).
    if (effectiveNorm == null) continue;

    const uzinaId = uzinaByVehicle.get(v.id as string);
    const uzinaKm = uzinaId != null ? kmByUzina.get(uzinaId) : undefined;
    const plannedKm = uzinaKm != null && uzinaKm > 0 ? round2(uzinaKm) : plannedKmDefault;

    const t = computeCardTopup(plannedKm, Number(effectiveNorm), reservePct, fuelPriceLei);

    rows.push({
      plate: v.plate_number as string,
      type: type?.display_name ?? null,
      norm: Number(effectiveNorm),
      plannedKm,
      liters: t.liters,
      litersWithReserve: t.litersWithReserve,
      lei: t.lei,
    });
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.litersWithReserve += r.litersWithReserve;
      acc.lei += r.lei ?? 0;
      return acc;
    },
    { litersWithReserve: 0, lei: 0 },
  );

  return {
    rows,
    params: { plannedKmDefault, reservePct, fuelPriceLei },
    totals: { litersWithReserve: round2(totals.litersWithReserve), lei: round2(totals.lei) },
  };
}
