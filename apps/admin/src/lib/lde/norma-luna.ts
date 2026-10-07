// Norma lunii pe mașinile de uzină — panoul Clavei (/lde/agreare/norme), plan docs/plans/2026-10-07-panou-norme-clava.md.
// Ion, 07.10.2026: «verificarea se face strict tipuri mașini și media 3 luni la această mașină» → două repere; Clava
// alege unul sau «pune norma pe care o crede și comentariu de ce, ca să învățăm sistemul»; norma ei contează în poster
// și pe /lde/combustibil «doar după confirmarea mea». Bibliotecă fără verificare de rol: o cheamă acțiunile (cu rol)
// și posterul (cron).

import { getSupabase } from '../supabase';

/** Direcțiile mașinilor de uzină din panou (camioanele se judecă pe curse, ION-162; interurbanul și Briceni n-au uzină). */
export const UZINE_DIRS = ['DRAXELMAIER_BALTI', 'SEBN_ORHEI', 'SEBN_STRASENI', 'LEAR_UNGHENI', 'LEAR_FLORESTI'] as const;
export const UZINA_NUME: Record<string, string> = {
  DRAXELMAIER_BALTI: 'Drăxlmaier', SEBN_ORHEI: 'SEBN', SEBN_STRASENI: 'SEBN', LEAR_UNGHENI: 'LEAR Ungheni', LEAR_FLORESTI: 'LEAR Florești',
};
export const LUNA_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type Ales = 'tip' | 'medie3' | 'clava';
export type Reper = { norma_tip: number | null; tip: string | null; medie3: number | null; km3: number };
export type Decizie = {
  vehicle_id: string; norma_tip: number | null; medie3: number | null; km3: number | null;
  ales: Ales; norma: number; comentariu: string | null; decis_de: string; decis_la: string;
};
export type Confirmare = {
  luna: string; confirmat_de: string; confirmat_la: string;
  poster_rezultat: Record<'album' | 'general' | 'introducere', StareBucata>; poster_motiv: string | null; poster_trimis_la: string | null;
};
export type StareBucata = 'netrimis' | 'in_curs' | 'ok' | 'refuzat' | 'incert';

export const primaZi = (luna: string) => `${luna}-01`;
export function lunaInainte(luna: string, n = 1): string {
  const [y, m] = luna.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function ultimaZi(luna: string): string {
  const [y, m] = luna.split('-').map(Number);
  return `${luna}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Cele două repere ale lunii pe fiecare mașină: norma tipului (nomenclator) și media mașinii pe cele 3 luni închise
 *  de dinainte (r_masina din lde_fuel_norma_eb — brut, netras spre tip). Rotunjite la 0,01 (aceeași cifră se îngheață). */
export async function reperele(luna: string, ids: string[]): Promise<Map<string, Reper>> {
  const out = new Map<string, Reper>();
  if (!ids.length) return out;
  const sb = getSupabase();
  const [eb, nt] = await Promise.all([
    sb.rpc('lde_fuel_norma_eb', { luna: primaZi(luna), vehicule: ids }),
    sb.from('lde_vehicle_norms').select('vehicle_id, lde_vehicle_types ( display_name, norm_l_per_100km )').in('vehicle_id', ids),
  ]);
  if (eb.error) throw new Error(`lde_fuel_norma_eb: ${eb.error.message}`);
  if (nt.error) throw new Error(nt.error.message);
  const tipuri = new Map<string, { nume: string | null; norma: number | null }>();
  for (const r of (nt.data ?? []) as any[]) {
    const t = Array.isArray(r.lde_vehicle_types) ? r.lde_vehicle_types[0] : r.lde_vehicle_types;
    tipuri.set(r.vehicle_id, { nume: t?.display_name ?? null, norma: t?.norm_l_per_100km != null ? r2(Number(t.norm_l_per_100km)) : null });
  }
  const e3 = new Map<string, any>(((eb.data ?? []) as any[]).map((r) => [r.vehicle_id, r]));
  for (const id of ids) {
    const t = tipuri.get(id), e = e3.get(id);
    out.set(id, {
      norma_tip: t?.norma ?? null, tip: t?.nume ?? null,
      medie3: e?.r_masina != null ? r2(Number(e.r_masina)) : null, km3: e ? Number(e.km_calib) : 0,
    });
  }
  return out;
}

export async function deciziileLunii(luna: string, ids?: string[]): Promise<Map<string, Decizie>> {
  let q = getSupabase().from('lde_norma_luna')
    .select('vehicle_id, norma_tip, medie3, km3, ales, norma, comentariu, decis_de, decis_la').eq('luna', primaZi(luna));
  if (ids) q = q.in('vehicle_id', ids);
  const { data, error } = await q.limit(1000);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as any[]).map((d) => [d.vehicle_id, {
    ...d, norma: Number(d.norma), norma_tip: d.norma_tip != null ? Number(d.norma_tip) : null,
    medie3: d.medie3 != null ? Number(d.medie3) : null, km3: d.km3 != null ? Number(d.km3) : null,
  } as Decizie]));
}

export async function confirmarea(luna: string): Promise<Confirmare | null> {
  const { data, error } = await getSupabase().from('lde_norma_luna_confirmare')
    .select('luna, confirmat_de, confirmat_la, poster_rezultat, poster_motiv, poster_trimis_la').eq('luna', primaZi(luna)).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Confirmare | null) ?? null;
}

/** Norma Clavei pe mașinile decise, DOAR pentru o lună confirmată de Ion (altfel hartă goală → rapoartele rămân pe EB). */
export async function normeleConfirmate(luna: string): Promise<Map<string, number>> {
  if (!(await confirmarea(luna))) return new Map();
  const d = await deciziileLunii(luna);
  return new Map([...d].map(([id, x]) => [id, x.norma]));
}
