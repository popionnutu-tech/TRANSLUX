'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import type { Driver } from '@translux/db';

export async function getDrivers(): Promise<Driver[]> {
  const { data } = await getSupabase()
    .from('drivers')
    .select('*')
    .order('full_name');
  return (data || []) as Driver[];
}

export async function createDriver(fullName: string, phone?: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const trimmed = fullName.trim();
  if (!trimmed) throw new Error('Numele șoferului este obligatoriu');

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
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');

  const cleaned = phone.replace(/\D/g, '');
  const intl = cleaned.startsWith('373') ? cleaned : '373' + cleaned.replace(/^0/, '');

  const { error } = await getSupabase()
    .from('drivers')
    .update({ phone: intl })
    .eq('id', driverId);

  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}

export async function toggleDriver(id: string, active: boolean) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  await getSupabase().from('drivers').update({ active }).eq('id', id);
  revalidatePath('/drivers');
}

export async function deleteDriver(id: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const { error } = await getSupabase().from('drivers').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}
