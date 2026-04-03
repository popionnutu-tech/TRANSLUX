'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import type { Vehicle } from '@translux/db';

export async function getVehicles(): Promise<Vehicle[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const { data } = await getSupabase()
    .from('vehicles')
    .select('*')
    .order('plate_number');
  return (data || []) as Vehicle[];
}

export async function createVehicle(plateNumber: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const trimmed = plateNumber.trim().toUpperCase();
  if (!trimmed) throw new Error('Numărul de înmatriculare este obligatoriu');

  const { error } = await getSupabase().from('vehicles').insert({ plate_number: trimmed });
  if (error) {
    if (error.code === '23505') throw new Error('Acest număr de înmatriculare există deja');
    throw new Error(error.message);
  }
  revalidatePath('/vehicles');
}

export async function toggleVehicle(id: string, active: boolean) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  await getSupabase().from('vehicles').update({ active }).eq('id', id);
  revalidatePath('/vehicles');
}

export async function deleteVehicle(id: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const { error } = await getSupabase().from('vehicles').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/vehicles');
}
