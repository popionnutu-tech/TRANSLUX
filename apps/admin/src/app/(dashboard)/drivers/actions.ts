'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { normalizeDriverPhone, type Driver } from '@translux/db';

export async function getDrivers(): Promise<Driver[]> {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const { data } = await getSupabase()
    .from('drivers')
    .select('*')
    .eq('is_lde', false) // autoparcul LDE se gestionează în /lde/soferi, nu aici
    .order('full_name');
  return (data || []) as Driver[];
}

export async function createDriver(fullName: string, phone: string) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const trimmed = fullName.trim();
  if (!trimmed) throw new Error('Numele șoferului este obligatoriu');
  if (trimmed.split(/\s+/).length < 2) {
    throw new Error('Introduceți numele complet (prenume + familie)');
  }

  const row = { full_name: trimmed, phone: normalizeDriverPhone(phone) };

  const { error } = await getSupabase().from('drivers').insert(row);
  if (error) throw new Error(error.message);
  revalidatePath('/drivers');
}

export async function updateDriverPhone(driverId: string, phone: string) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');

  const { error } = await getSupabase()
    .from('drivers')
    .update({ phone: normalizeDriverPhone(phone) })
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

  // Reactivarea e singura poartă prin care un șofer fără telefon se putea întoarce în
  // pickere: trigger-ele din 254/256 prind doar adăugarea, iar un șofer vechi
  // dezactivat (ex. «Oglasevici A.») putea reveni cu un click și ascunde iar cursa.
  if (active) {
    const { data, error } = await getSupabase()
      .from('drivers').select('full_name, phone, is_lde').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (data && !data.is_lde && !data.phone?.trim()) {
      throw new Error(`${data.full_name} n-are telefon — completează-l înainte de a-l reactiva, altfel cursele lui nu apar pe translux.md`);
    }
  }

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
