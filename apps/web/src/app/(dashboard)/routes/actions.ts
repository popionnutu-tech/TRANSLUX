'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import type { Route } from '@translux/db';

export async function getRoutes(): Promise<Route[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const { data } = await getSupabase()
    .from('routes')
    .select('*')
    .order('name');
  return (data || []) as Route[];
}

export async function createRoute(name: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Numele rutei este obligatoriu');

  const { error } = await getSupabase().from('routes').insert({ name: trimmed });
  if (error) {
    if (error.code === '23505') throw new Error('Ruta cu acest nume există deja');
    throw new Error(error.message);
  }
  revalidatePath('/routes');
}

export async function toggleRoute(id: string, active: boolean) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  await getSupabase().from('routes').update({ active }).eq('id', id);
  revalidatePath('/routes');
}

export async function deleteRoute(id: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const { error } = await getSupabase().from('routes').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/routes');
}
