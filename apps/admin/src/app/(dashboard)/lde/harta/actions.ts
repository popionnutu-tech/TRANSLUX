'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { UZINE_HARTA, uzHarta, type RandListaHarta, type ZiHarta } from '@/lib/lde/drax-harta';

// Harta mașinii pe zi (ION-130). lde_harta_zi o scrie VPS-ul, un rând pe mașină și zi (≈ 20 KB); lista citește doar `sumar`.
// Urmele și casa șoferului sunt date personale: doar ADMIN, doar prin serverul panoului.
// ION-143: și LEAR Ungheni / LEAR Florești — uzina vine din cheia adresei, trecută prin lista fixă (UZINE_HARTA), nu din text liber.
const uzina = (uz: string) => UZINE_HARTA[uzHarta(uz)].id;

export async function getSaptamaniHarta(uz: string): Promise<string[]> {
  const session = await verifySession();
  requireRole(session, 'ADMIN');
  const { data, error } = await getSupabase().from('lde_harta_zi').select('saptamina').eq('uzina', uzina(uz))
    .order('saptamina', { ascending: false }).limit(1000);
  if (error) throw new Error(`lde_harta_zi: ${error.message}`);
  return [...new Set((data ?? []).map((r) => r.saptamina as string))];
}

export async function getListaHarta(uz: string, saptamina: string): Promise<RandListaHarta[]> {
  const session = await verifySession();
  requireRole(session, 'ADMIN');
  const { data, error } = await getSupabase().from('lde_harta_zi').select('m, z, sumar').eq('uzina', uzina(uz)).eq('saptamina', saptamina)
    .order('m').order('z').limit(1000);
  if (error) throw new Error(`lde_harta_zi: ${error.message}`);
  return (data ?? []) as RandListaHarta[];
}

export async function getZiHarta(uz: string, saptamina: string, m: string, z: string): Promise<ZiHarta | null> {
  const session = await verifySession();
  requireRole(session, 'ADMIN');
  const { data, error } = await getSupabase().from('lde_harta_zi').select('date').eq('uzina', uzina(uz)).eq('saptamina', saptamina)
    .eq('m', m).eq('z', z).maybeSingle();
  if (error) throw new Error(`lde_harta_zi: ${error.message}`);
  return (data?.date as ZiHarta | undefined) ?? null;
}

/** ION-150: controlul flotei cisternelor pe săptămână — fiecare placă Wialon / cisternă din lde_truck_profile: pe hartă sau motivul */
export interface ControlCamion { m: string; pe: boolean; motiv: string | null; tip: string | null; km?: number; zile?: number }
export async function getControlCamioane(saptamina: string): Promise<ControlCamion[]> {
  const session = await verifySession();
  requireRole(session, 'ADMIN');
  const { data, error } = await getSupabase().from('lde_analiza_reguli').select('date').eq('uzina', UZINE_HARTA.camioane.id).eq('saptamina', saptamina).maybeSingle();
  if (error) throw new Error(`lde_analiza_reguli: ${error.message}`);
  return ((data?.date as { control?: ControlCamion[] } | null)?.control ?? []);
}

/** ION-148: controlul flotei Briceni (Trox + suburban) pe săptămână — fiecare mașină cu urmă sau atribuire: parcarea sau motivul.
 * Rândul îl scrie VPS briceni-parcare/harta.mjs în lde_analiza_reguli 'BRICENI_HARTA' (rândul «BRICENI» al analizei rămâne neatins). */
export interface ControlBriceni { m: string; pe: boolean; motiv: string | null; km?: number; zile?: number; economieSapt?: number; locuri?: string[] }
export async function getControlBriceni(saptamina: string): Promise<ControlBriceni[]> {
  const session = await verifySession();
  requireRole(session, 'ADMIN');
  const { data, error } = await getSupabase().from('lde_analiza_reguli').select('date').eq('uzina', UZINE_HARTA.briceni.control).eq('saptamina', saptamina).maybeSingle();
  if (error) throw new Error(`lde_analiza_reguli: ${error.message}`);
  return ((data?.date as { control?: ControlBriceni[] } | null)?.control ?? []);
}

/** ION-149: controlul flotei interurbane pe săptămână — fiecare plăcuță cu atribuire interurbană: loc propus sau motivul.
 * Rândul îl scrie VPS mejgorod-parcare/harta.mjs în lde_analiza_reguli 'MEJGOROD_HARTA' (rândul 'MEJGOROD' e analiza de luni). */
export interface ControlMejgorod {
  m: string; pe: boolean; propunere: boolean; motiv: string | null; rute: number[]; km?: number; zile?: number; nopti?: number;
  economieSapt?: number; locuri?: string[]; liber?: number; regula2509?: number; acum?: string;
}
export async function getControlMejgorod(saptamina: string): Promise<ControlMejgorod[]> {
  const session = await verifySession();
  requireRole(session, 'ADMIN');
  const { data, error } = await getSupabase().from('lde_analiza_reguli').select('date').eq('uzina', 'MEJGOROD_HARTA').eq('saptamina', saptamina).maybeSingle();
  if (error) throw new Error(`lde_analiza_reguli: ${error.message}`);
  return ((data?.date as { control?: ControlMejgorod[] } | null)?.control ?? []);
}
