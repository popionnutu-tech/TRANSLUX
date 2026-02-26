'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import type { Driver } from '@translux/db';

export async function getDrivers(): Promise<Driver[]> {
  const { data } = await getSupabase()
    .from('drivers')
    .select('*')
    .order('full_name');
  return (data || []) as Driver[];
}

export async function createDriver(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) throw new Error('Numele șoferului este obligatoriu');

  const { error } = await getSupabase().from('drivers').insert({ full_name: trimmed });
  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}

export async function toggleDriver(id: string, active: boolean) {
  await getSupabase().from('drivers').update({ active }).eq('id', id);
  revalidatePath('/drivers');
}

export async function deleteDriver(id: string) {
  const { error } = await getSupabase().from('drivers').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}
