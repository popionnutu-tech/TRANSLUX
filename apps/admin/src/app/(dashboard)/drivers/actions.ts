'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import type { Driver } from '@translux/db';

export async function getDrivers(): Promise<Driver[]> {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const { data } = await getSupabase()
    .from('drivers')
    .select('*')
    .eq('is_lde', false) // autoparcul LDE se gestionează în /lde/soferi, nu aici
    .order('full_name');
  return (data || []) as Driver[];
}

export async function createDriver(fullName: string, phone?: string) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const trimmed = fullName.trim();
  if (!trimmed) throw new Error('Numele șoferului este obligatoriu');
  if (trimmed.split(/\s+/).length < 2) {
    throw new Error('Introduceți numele complet (prenume + familie)');
  }

  const row: any = { full_name: trimmed };
  if (phone?.trim()) {
    const cleaned = phone.replace(/\D/g, '');
    row.phone = cleaned.startsWith('373') ? cleaned : '373' + cleaned.replace(/^0/, '');
  }

  const { error } = await getSupabase().from('drivers').insert(row);
  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}

export async function updateDriverPhone(driverId: string, phone: string) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');

  const cleaned = phone.replace(/\D/g, '');
  const intl = cleaned.startsWith('373') ? cleaned : '373' + cleaned.replace(/^0/, '');

  const { error } = await getSupabase()
    .from('drivers')
    .update({ phone: intl })
    .eq('id', driverId);

  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}

export async function updateDriverName(driverId: string, fullName: string) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const trimmed = fullName.trim();
  if (!trimmed) throw new Error('Numele șoferului este obligatoriu');
  if (trimmed.split(/\s+/).length < 2) {
    throw new Error('Introduceți numele complet (prenume + familie)');
  }

  const { error } = await getSupabase()
    .from('drivers')
    .update({ full_name: trimmed })
    .eq('id', driverId);

  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}

export async function toggleDriver(id: string, active: boolean) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  await getSupabase().from('drivers').update({ active }).eq('id', id);
  revalidatePath('/drivers');
}

export async function deleteDriver(id: string) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const { error } = await getSupabase().from('drivers').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}

export async function updateDriverDirections(id: string, directions: string[]) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const clean = [...new Set((directions || []).filter((d) => typeof d === 'string' && d.length))];
  const { error } = await getSupabase().from('drivers').update({ directions: clean }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}
