'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import type { LdeVehicleType, LdeVehicleCategory } from '@translux/db';
import { LDE_VEHICLE_CATEGORY_LABELS } from '@translux/db';

const ID_RE = /^[A-Z][A-Z0-9_]*$/;

function normalizeInput(input: Partial<LdeVehicleType>): Partial<LdeVehicleType> {
  const row: Partial<LdeVehicleType> = {};
  if (input.id !== undefined) row.id = String(input.id).trim().toUpperCase();
  if (input.display_name !== undefined) row.display_name = String(input.display_name).trim();
  if (input.category !== undefined) row.category = input.category;
  if (input.norm_l_per_100km !== undefined) row.norm_l_per_100km = Number(input.norm_l_per_100km);
  if (input.norm_l_per_100km_loaded !== undefined) {
    const v = input.norm_l_per_100km_loaded;
    row.norm_l_per_100km_loaded = v === null || v === undefined || (v as unknown) === '' ? null : Number(v);
  }
  if (input.passenger_seats !== undefined) {
    const v = input.passenger_seats;
    row.passenger_seats = v === null || v === undefined || (v as unknown) === '' ? null : Number(v);
  }
  if (input.notes !== undefined) row.notes = input.notes ? String(input.notes).trim() : null;
  return row;
}

function validateCategory(cat: unknown): LdeVehicleCategory {
  if (typeof cat !== 'string' || !(cat in LDE_VEHICLE_CATEGORY_LABELS)) {
    throw new Error('Categorie invalidă');
  }
  return cat as LdeVehicleCategory;
}

export async function getVehicleTypes(): Promise<LdeVehicleType[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data, error } = await getSupabase()
    .from('lde_vehicle_types')
    .select('*')
    .order('display_name');
  if (error) throw new Error(error.message);
  return (data || []) as LdeVehicleType[];
}

export async function createVehicleType(input: LdeVehicleType) {
  requireRole(await verifySession(), 'ADMIN');

  const row = normalizeInput(input);

  if (!row.id || !ID_RE.test(row.id)) {
    throw new Error('ID invalid: doar litere mari, cifre și underscore (ex: SPRINTER_312)');
  }
  if (!row.display_name) throw new Error('Denumirea este obligatorie');
  const category = validateCategory(row.category);
  if (row.norm_l_per_100km === undefined || !Number.isFinite(row.norm_l_per_100km) || row.norm_l_per_100km <= 0) {
    throw new Error('Norma l/100km trebuie să fie un număr pozitiv');
  }
  if (category === 'camion_marfa') {
    if (row.norm_l_per_100km_loaded === undefined || row.norm_l_per_100km_loaded === null || !Number.isFinite(Number(row.norm_l_per_100km_loaded))) {
      throw new Error('Pentru camion, norma încărcat (l/100km) este obligatorie');
    }
    row.passenger_seats = null;
  } else {
    row.norm_l_per_100km_loaded = null;
    if (row.passenger_seats === undefined || row.passenger_seats === null || !Number.isFinite(Number(row.passenger_seats)) || Number(row.passenger_seats) <= 0) {
      throw new Error('Numărul de locuri este obligatoriu pentru pasageri');
    }
  }

  const { error } = await getSupabase().from('lde_vehicle_types').insert(row);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/tipuri-masini');
}

export async function updateVehicleType(id: string, patch: Partial<LdeVehicleType>) {
  requireRole(await verifySession(), 'ADMIN');
  if (!id) throw new Error('ID lipsește');

  const row = normalizeInput(patch);
  delete row.id; // nu permitem schimbarea PK
  if (row.category !== undefined) validateCategory(row.category);

  if (Object.keys(row).length === 0) return;

  const { error } = await getSupabase()
    .from('lde_vehicle_types')
    .update(row)
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/tipuri-masini');
}

export async function deleteVehicleType(id: string) {
  requireRole(await verifySession(), 'ADMIN');
  if (!id) throw new Error('ID lipsește');

  const { error } = await getSupabase().from('lde_vehicle_types').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/tipuri-masini');
}
