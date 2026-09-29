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
