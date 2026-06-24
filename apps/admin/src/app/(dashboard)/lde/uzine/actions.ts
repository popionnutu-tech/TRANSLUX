'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import type { LdeUzina } from '@translux/db';

const VALID_PATTERNS = ['S1_FIXED', 'S1_S2_FIXED', 'S1_S2_S3_FIXED', 'WEEKLY_ROTATION', 'MONTHLY_ROTATION'] as const;

export type UzinaInput = {
  id: string;
  display_name: string;
  city: string;
  shift_pattern: LdeUzina['shift_pattern'];
  shift1_time?: string | null;
  shift2_time?: string | null;
  shift3_time?: string | null;
  works_saturday: boolean;
  works_sunday: boolean;
  notes?: string | null;
};

function validate(input: UzinaInput, isCreate: boolean) {
  const id = input.id.trim();
  const display_name = input.display_name.trim();
  const city = input.city.trim();

  if (isCreate) {
    if (!id) throw new Error('ID-ul uzinei este obligatoriu');
    if (!/^[A-Z][A-Z0-9_]*$/.test(id)) {
      throw new Error('ID-ul trebuie să fie MAJUSCULE_CU_UNDERSCORE (ex: DRAXELMAIER_BALTI)');
    }
  }
  if (!display_name) throw new Error('Numele afișat este obligatoriu');
  if (!city) throw new Error('Orașul este obligatoriu');
  if (!VALID_PATTERNS.includes(input.shift_pattern as any)) {
    throw new Error('Pattern de schimburi invalid');
  }

  return {
    id,
    display_name,
    city,
    shift_pattern: input.shift_pattern,
    shift1_time: input.shift1_time?.trim() || null,
    shift2_time: input.shift2_time?.trim() || null,
    shift3_time: input.shift3_time?.trim() || null,
    works_saturday: !!input.works_saturday,
    works_sunday: !!input.works_sunday,
    notes: input.notes?.trim() || null,
  };
}

export async function getUzine(): Promise<LdeUzina[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data, error } = await getSupabase()
    .from('lde_uzine')
    .select('*')
    .order('display_name');
  if (error) throw new Error(error.message);
  return (data || []) as LdeUzina[];
}

export async function createUzina(input: UzinaInput) {
  requireRole(await verifySession(), 'ADMIN');
  const row = validate(input, true);
  const { error } = await getSupabase().from('lde_uzine').insert(row);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/uzine');
}

export async function updateUzina(id: string, input: UzinaInput) {
  requireRole(await verifySession(), 'ADMIN');
  const row = validate(input, false);
  // id-ul nu se schimbă în update
  const { id: _ignore, ...patch } = row;
  const { error } = await getSupabase()
    .from('lde_uzine')
    .update(patch)
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/uzine');
}

export async function toggleUzina(id: string, active: boolean) {
  requireRole(await verifySession(), 'ADMIN');
  const { error } = await getSupabase()
    .from('lde_uzine')
    .update({ active })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/uzine');
}

export async function deleteUzina(id: string) {
  requireRole(await verifySession(), 'ADMIN');
  const { error } = await getSupabase().from('lde_uzine').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/uzine');
}
