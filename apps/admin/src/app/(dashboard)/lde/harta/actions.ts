'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import type { RandListaHarta, ZiHarta } from '@/lib/lde/drax-harta';

// Harta mașinii pe zi (ION-130). lde_harta_zi o scrie VPS-ul, un rând pe mașină și zi (≈ 20 KB); lista citește doar `sumar`.
// Urmele și casa șoferului sunt date personale: doar ADMIN, doar prin serverul panoului.
const UZINA = 'DRAXELMAIER';

export async function getSaptamaniHarta(): Promise<string[]> {
  const session = await verifySession();
  requireRole(session, 'ADMIN');
  const { data, error } = await getSupabase().from('lde_harta_zi').select('saptamina').eq('uzina', UZINA)
    .order('saptamina', { ascending: false }).limit(1000);
  if (error) throw new Error(`lde_harta_zi: ${error.message}`);
  return [...new Set((data ?? []).map((r) => r.saptamina as string))];
}

export async function getListaHarta(saptamina: string): Promise<RandListaHarta[]> {
  const session = await verifySession();
  requireRole(session, 'ADMIN');
  const { data, error } = await getSupabase().from('lde_harta_zi').select('m, z, sumar').eq('uzina', UZINA).eq('saptamina', saptamina)
    .order('m').order('z').limit(1000);
  if (error) throw new Error(`lde_harta_zi: ${error.message}`);
  return (data ?? []) as RandListaHarta[];
}

export async function getZiHarta(saptamina: string, m: string, z: string): Promise<ZiHarta | null> {
  const session = await verifySession();
  requireRole(session, 'ADMIN');
  const { data, error } = await getSupabase().from('lde_harta_zi').select('date').eq('uzina', UZINA).eq('saptamina', saptamina)
    .eq('m', m).eq('z', z).maybeSingle();
  if (error) throw new Error(`lde_harta_zi: ${error.message}`);
  return (data?.date as ZiHarta | undefined) ?? null;
}
