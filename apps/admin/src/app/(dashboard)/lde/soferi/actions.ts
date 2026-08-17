'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { setUzinaInDirections, acelasiSet } from '@/lib/lde/uzina-directions';
import type { LdeDriverExtras, LdeParkingLocation, LdeSalaryCategory, LdeUzina } from '@translux/db';

export interface LdeSoferRow {
  driver_id: string;
  full_name: string;
  uzina_id: string | null;
  home_address: string | null;
  lde_salary_category: LdeSalaryCategory | null;
  parking_location: LdeParkingLocation;
  notes: string | null;
  hasAddress: boolean;
}

export interface LdeSoferExtrasPatch {
  uzina_id?: string | null;
  home_address?: string | null;
  lde_salary_category?: LdeSalaryCategory | null;
  parking_location?: LdeParkingLocation;
  notes?: string | null;
}

export async function getLdeUzine(): Promise<LdeUzina[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data, error } = await getSupabase()
    .from('lde_uzine')
    .select('*')
    .eq('active', true)
    .order('display_name');
  if (error) throw new Error(error.message);
  return (data || []) as LdeUzina[];
}

/**
 * JOIN drivers + lde_driver_extras.
 * Filtru opțional după uzina_id:
 *   - undefined → toți șoferii activi
 *   - 'NONE'    → doar cei fără uzină atribuită
 *   - <id>      → doar cei cu uzina respectivă
 */
export async function getLdeSoferi(uzina_id?: string): Promise<LdeSoferRow[]> {
  requireRole(await verifySession(), 'ADMIN');

  const sb = getSupabase();

  // Citim drivers activi + relația 1:0..1 cu lde_driver_extras.
  const { data, error } = await sb
    .from('drivers')
    .select('id, full_name, active, lde_driver_extras(uzina_id, home_address, lde_salary_category, parking_location, notes)')
    .eq('active', true)
    .order('full_name');

  if (error) throw new Error(error.message);

  const rows: LdeSoferRow[] = (data || []).map((d: any) => {
    const extras = Array.isArray(d.lde_driver_extras) ? d.lde_driver_extras[0] : d.lde_driver_extras;
    const home_address: string | null = extras?.home_address ?? null;
    return {
      driver_id: d.id as string,
      full_name: d.full_name as string,
      uzina_id: extras?.uzina_id ?? null,
      home_address,
      lde_salary_category: extras?.lde_salary_category ?? null,
      parking_location: (extras?.parking_location ?? 'HOME') as LdeParkingLocation,
      notes: extras?.notes ?? null,
      hasAddress: !!home_address && home_address.trim().length > 0,
    };
  });

  if (uzina_id === undefined) return rows;
  if (uzina_id === 'NONE') return rows.filter(r => r.uzina_id === null);
  return rows.filter(r => r.uzina_id === uzina_id);
}

/**
 * Ține `drivers.directions` în pas cu `lde_driver_extras.uzina_id`.
 *
 * Pagina asta scria istoric doar extras, iar pickerul din grafic citește
 * directions — de aici desincronizarea măsurată pe 17.08.2026 (93 cu extras,
 * 84 cu directions, 83 coincid): șoferul mutat de aici la altă uzină nu urca
 * în lista uzinei noi din grafic. Regula stă în lib/lde/uzina-directions.ts,
 * comună cu /lde/parc.
 */
async function sincronizeazaDirections(driver_id: string, uzina_id: string | null) {
  const sb = getSupabase();

  const [{ data: drv, error: dErr }, { data: uzine, error: uErr }] = await Promise.all([
    sb.from('drivers').select('directions').eq('id', driver_id).maybeSingle(),
    sb.from('lde_uzine').select('id'),
  ]);
  if (dErr) throw new Error(dErr.message);
  if (uErr) throw new Error(uErr.message);
  if (!drv) return; // șofer inexistent — upsertExtras ar fi picat oricum pe FK

  const acum = (drv.directions as string[] | null) ?? [];
  // toate uzinele, nu doar cele active: altfel codul unei uzine dezactivate ar
  // rămâne agățat în directions și n-ar mai fi curățat niciodată
  const noi = setUzinaInDirections(acum, uzina_id, (uzine ?? []).map((u) => u.id as string));
  if (acelasiSet(acum, noi)) return;

  const { error } = await sb.from('drivers').update({ directions: noi }).eq('id', driver_id);
  if (error) throw new Error(error.message);
}

/** Upsert pentru lde_driver_extras (creează rândul dacă nu există, altfel actualizează). */
async function upsertExtras(driver_id: string, patch: LdeSoferExtrasPatch) {
  const sb = getSupabase();

  const row: Record<string, unknown> = { driver_id };
  if ('uzina_id' in patch) row.uzina_id = patch.uzina_id;
  if ('home_address' in patch) {
    const v = patch.home_address;
    row.home_address = v && v.trim() ? v.trim() : null;
  }
  if ('lde_salary_category' in patch) row.lde_salary_category = patch.lde_salary_category;
  if ('parking_location' in patch) row.parking_location = patch.parking_location;
  if ('notes' in patch) {
    const v = patch.notes;
    row.notes = v && v.trim() ? v.trim() : null;
  }
  row.updated_at = new Date().toISOString();

  const { error } = await sb
    .from('lde_driver_extras')
    .upsert(row, { onConflict: 'driver_id' });
  if (error) throw new Error(error.message);

  // Doar când chiar s-a atins uzina — restul câmpurilor (adresă, categorie,
  // parcare) n-au treabă cu direcțiile.
  if ('uzina_id' in patch) {
    await sincronizeazaDirections(driver_id, patch.uzina_id ?? null);
  }
}

export async function updateLdeSoferExtras(driver_id: string, patch: LdeSoferExtrasPatch) {
  requireRole(await verifySession(), 'ADMIN');
  if (!driver_id) throw new Error('driver_id este obligatoriu');
  await upsertExtras(driver_id, patch);
  revalidatePath('/lde/soferi');
}

/** Creează rândul lde_driver_extras dacă șoferul nu îl are încă. */
export async function createLdeSoferExtras(
  driver_id: string,
  patch: LdeSoferExtrasPatch = {}
): Promise<LdeDriverExtras> {
  requireRole(await verifySession(), 'ADMIN');
  if (!driver_id) throw new Error('driver_id este obligatoriu');

  const sb = getSupabase();

  // Verificăm că șoferul există
  const { data: drv, error: drvErr } = await sb
    .from('drivers')
    .select('id')
    .eq('id', driver_id)
    .maybeSingle();
  if (drvErr) throw new Error(drvErr.message);
  if (!drv) throw new Error('Șoferul nu există');

  await upsertExtras(driver_id, patch);

  const { data, error } = await sb
    .from('lde_driver_extras')
    .select('*')
    .eq('driver_id', driver_id)
    .single();
  if (error) throw new Error(error.message);

  revalidatePath('/lde/soferi');
  return data as LdeDriverExtras;
}
