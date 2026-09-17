'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';

// Fereastra e plafonată explicit: 111 rute × 30 de zile × până la 3 schimburi × 2 sensuri
// trece cu mult peste plafonul PostgREST de 1000 de rânduri, iar tăierea e TĂCUTĂ.
// De aceea agregarea se face server-side, în `lde_trasee_sumar`, care întoarce un rând pe
// combinație — FĂRĂ geometrie. Geometria se cere separat, doar pentru ruta aleasă pe hartă
// (regula scrisă în migr. 206: «NICIODATĂ SELECT * în liste»).
export const ZILE_MAX = 30;

export type TraseuRand = {
  factory_route_id: string;
  uzina_id: string;
  route_number: number;
  stops_in_order: string | null;
  shift_number: number;
  slot: number;
  sens: 'tur' | 'retur';
  sate: { nume: string; pondere: number }[];
  km_median: number | null;
  observations: number;
  source: 'gps_trace' | 'operator_km';
  motiv_lipsa: string | null;
  curse: number;
  abatere_medie: number | null;
  km_goi_total: number | null;
  ambigue: number;
};

export type ImpacareZi = {
  gps_date: string;
  km_total: number;
  km_plin: number;
  km_gol: number;
  km_necunoscut: number;
  km_neatribuiti: number;   // DERIVAT, nu stocat — altfel identitatea ar fi adevărată prin definiție
  masini_esuate: number;
};

export async function getTrasee(zile = ZILE_MAX): Promise<TraseuRand[]> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const { data, error } = await sb.rpc('lde_trasee_sumar', { p_zile: Math.min(zile, ZILE_MAX) });
  if (error) throw new Error(`trasee: ${error.message}`);
  return (data ?? []) as TraseuRand[];
}

/**
 * Linia de împăcare, pe zi: km_total = utili + goi + necunoscut + neatribuiți.
 * `km_neatribuiti` se DERIVĂ aici, nu se citește dintr-o coloană: dacă ar fi stocat ca
 * rest, identitatea ar fi adevărată prin definiție și n-ar putea prinde niciodată un
 * segment pierdut — adică exact funcția pentru care există.
 */
export async function getImpacare(zile = 14): Promise<ImpacareZi[]> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const de = new Date(Date.now() - zile * 86400000).toISOString().slice(0, 10);

  const [{ data: contrib }, { data: zilnic }] = await Promise.all([
    sb.from('lde_route_day_contrib').select('gps_date, vehicle_id, km_plin, km_gol, km_necunoscut, stare').gte('gps_date', de),
    sb.from('lde_vehicle_gps_daily').select('date, vehicle_id, km_total').gte('date', de),
  ]);

  const kmMasinaZi = new Map<string, number>();
  for (const z of zilnic ?? []) kmMasinaZi.set(`${z.vehicle_id}|${z.date}`, Number(z.km_total) || 0);

  const peZi = new Map<string, ImpacareZi>();
  for (const c of contrib ?? []) {
    const z = c.gps_date as string;
    if (!peZi.has(z)) peZi.set(z, { gps_date: z, km_total: 0, km_plin: 0, km_gol: 0, km_necunoscut: 0, km_neatribuiti: 0, masini_esuate: 0 });
    const r = peZi.get(z)!;
    r.km_plin += Number(c.km_plin) || 0;
    r.km_gol += Number(c.km_gol) || 0;
    r.km_necunoscut += Number(c.km_necunoscut) || 0;
    r.km_total += kmMasinaZi.get(`${c.vehicle_id}|${z}`) ?? 0;
    if (c.stare === 'esuat') r.masini_esuate++;
  }
  for (const r of peZi.values()) {
    r.km_neatribuiti = +(r.km_total - r.km_plin - r.km_gol - r.km_necunoscut).toFixed(1);
    r.km_total = +r.km_total.toFixed(1); r.km_plin = +r.km_plin.toFixed(1);
    r.km_gol = +r.km_gol.toFixed(1); r.km_necunoscut = +r.km_necunoscut.toFixed(1);
  }
  return [...peZi.values()].sort((a, b) => b.gps_date.localeCompare(a.gps_date));
}

/** Geometria unei curse — cerută separat, NU în listă. */
export async function getGeometrie(factory_route_id: string, shift_number: number, slot: number, sens: string) {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const { data } = await sb.from('lde_route_etalon').select('geom')
    .eq('factory_route_id', factory_route_id).eq('shift_number', shift_number)
    .eq('slot', slot).eq('sens', sens).maybeSingle();
  return (data?.geom ?? null) as { type: string; coordinates: number[][][] } | null;
}
