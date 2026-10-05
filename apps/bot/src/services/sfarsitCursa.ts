import type { SupabaseClient } from '@supabase/supabase-js';
import { oraOpririiPeSens, sfarsitulCurseiMs, type OreleOpririi } from '@translux/db';

// ION-252: sfârșitul cursei unei comenzi = sosirea din grafic la oprirea de coborâre + 30 min (regula comună din
// @translux/db). Botul are comanda (ruta, sensul, oprirea de coborâre, plecarea); ora sosirii o ia din crm_stop_fares,
// O SINGURĂ citire pentru toate comenzile unui tick.

/** Ce trebuie din comandă ca să-i afli sfârșitul cursei. */
export interface CursaComenzii {
  crm_route_id: number;
  to_stop_order: number;
  going_north: boolean;
  departure_at: string;
}

/** Orele opririlor, după cheia «ruta:oprirea». */
export type OreleOpririlor = ReadonlyMap<string, OreleOpririi>;

export const cheieOprire = (crmRouteId: number, stopOrder: number): string => `${crmRouteId}:${stopOrder}`;

/** Sfârșitul cursei (ms) cu orele deja citite; oprirea lipsă din nomenclator → plecarea + 6 h. Pur, testat. */
export function sfarsitulComenzii(c: CursaComenzii, opriri: OreleOpririlor): number {
  const oraSosire = oraOpririiPeSens(opriri.get(cheieOprire(c.crm_route_id, c.to_stop_order)), c.going_north);
  return sfarsitulCurseiMs(c.departure_at, oraSosire);
}

interface RandOprire extends OreleOpririi { crm_route_id: number; stop_order: number }

/** Orele opririlor de coborâre ale comenzilor date (rutele lor, o interogare). */
export async function citesteOreleOpririlor(db: SupabaseClient, comenzi: readonly CursaComenzii[]): Promise<OreleOpririlor> {
  const rute = [...new Set(comenzi.map((c) => c.crm_route_id))];
  const opriri = [...new Set(comenzi.map((c) => c.to_stop_order))];
  if (!rute.length) return new Map();
  // Doar opririle de coborâre ale comenzilor: răspunsul rămâne mic (PostgREST taie la 1000 de rânduri).
  const { data, error } = await db.from('crm_stop_fares')
    .select('crm_route_id, stop_order, hour_from_chisinau, hour_from_nord')
    .in('crm_route_id', rute)
    .in('stop_order', opriri);
  if (error) throw new Error(`crm_stop_fares: ${error.message}`);
  return new Map(((data as RandOprire[] | null) ?? []).map((r) => [cheieOprire(r.crm_route_id, r.stop_order), r]));
}

/** Comenzile, fiecare cu `sfarsit_ms` — sfârșitul cursei ei. */
export async function cuSfarsitulCursei<T extends CursaComenzii>(
  db: SupabaseClient,
  comenzi: readonly T[],
): Promise<Array<T & { sfarsit_ms: number }>> {
  const opriri = await citesteOreleOpririlor(db, comenzi);
  return comenzi.map((c) => ({ ...c, sfarsit_ms: sfarsitulComenzii(c, opriri) }));
}
