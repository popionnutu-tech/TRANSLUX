// Media lunii pe mașină — panoul Clavei (/lde/agreare/norme), plan docs/plans/2026-10-07-panou-norme-clava.md.
// Ion, 07.10.2026: «media o face softul după legea pusă de Clava și la camioane legea noastră»; «Clava se uită la media
// făcută de AI pe lună și pune media ei dacă e diferită» (cu motiv — «ca să învățăm sistemul»); «în octombrie face
// septembrie». Legea Clavei (interviul ei, «a scris din fișier Word»): litrii mașinii pe lună ÷ km GPS, împărțiți pe
// șoferi după km. Camioanele: cursele pornite în lună până la plinul următor (ION-162). Ambele vin din lde_fuel_flota.
// Bibliotecă fără verificare de rol: o cheamă acțiunile (cu rol).

import { getSupabase } from '../supabase';

/** Direcțiile uzinelor (legea Clavei: litrii lunii ÷ km GPS). */
export const UZINE_DIRS = ['DRAXELMAIER_BALTI', 'SEBN_ORHEI', 'SEBN_STRASENI', 'LEAR_UNGHENI', 'LEAR_FLORESTI'] as const;
/** Direcțiile din panou: uzinele, interurbanul și suburbanul (legea Clavei) + camioanele (legea noastră, pe curse — ION-162).
 *  Ion, 07.10.2026: «nu văd interurbane, suburbane, administrație» — administrația n-are direcție în vehicles încă. */
export const PANOU_DIRS = [...UZINE_DIRS, 'interurban', 'suburban', 'camioane'] as const;
export const UZINA_NUME: Record<string, string> = {
  DRAXELMAIER_BALTI: 'Drăxlmaier', SEBN_ORHEI: 'SEBN Orhei', SEBN_STRASENI: 'SEBN Strășeni', LEAR_UNGHENI: 'LEAR Ungheni', LEAR_FLORESTI: 'LEAR Florești',
  interurban: 'Interurban', suburban: 'Suburban', camioane: 'Camioane',
};
/** Ordinea filelor din panou — fiecare direcție separat (Ion, 07.10.2026: «direcțiile să fie separate»). */
export const DIRECTII_PANOU = PANOU_DIRS.map((d) => UZINA_NUME[d]);
export const LUNA_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type Ales = 'confirmat' | 'media_clava';
/** Felul motivului când Clava pune media ei (migr. 531) — se grupează lunar, ca legea de calcul să învețe din el. */
export const MOTIVE = {
  plin_luna_vecina: 'Plinul a căzut în luna vecină',
  reparatie: 'Mașina a stat în reparație',
  gps: 'Km lipsă sau greșiți în GPS',
  alimentare_gresita: 'Alimentare scrisă greșit (foaie / benzol)',
  alt: 'Alt motiv',
} as const;
export type Motiv = keyof typeof MOTIVE;
export const MOTIV_MIN = 20;
export type Reper = { norma_tip: number | null; tip: string | null; medie3: number | null; km3: number };
export type Decizie = {
  vehicle_id: string; norma_tip: number | null; medie3: number | null; km3: number | null;
  norma_program: number | null; km: number | null; litri: number | null; motiv: Motiv | null;
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
    .select('vehicle_id, norma_tip, medie3, km3, norma_program, km, litri, motiv, ales, norma, comentariu, decis_de, decis_la').eq('luna', primaZi(luna));
  if (ids) q = q.in('vehicle_id', ids);
  const { data, error } = await q.limit(1000);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as any[]).map((d) => [d.vehicle_id, {
    ...d, norma: Number(d.norma), norma_tip: d.norma_tip != null ? Number(d.norma_tip) : null,
    medie3: d.medie3 != null ? Number(d.medie3) : null, km3: d.km3 != null ? Number(d.km3) : null,
    norma_program: d.norma_program != null ? Number(d.norma_program) : null,
    km: d.km != null ? Number(d.km) : null, litri: d.litri != null ? Number(d.litri) : null,
  } as Decizie]));
}

export async function confirmarea(luna: string): Promise<Confirmare | null> {
  const { data, error } = await getSupabase().from('lde_norma_luna_confirmare')
    .select('luna, confirmat_de, confirmat_la, poster_rezultat, poster_motiv, poster_trimis_la').eq('luna', primaZi(luna)).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Confirmare | null) ?? null;
}
