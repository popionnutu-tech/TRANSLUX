'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import type { Trip, Route, DirectionEnum } from '@translux/db';

export interface TripWithRoute extends Trip {
  routes: { name: string };
}

export async function getTrips(): Promise<TripWithRoute[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const { data } = await getSupabase()
    .from('trips')
    .select('*, routes(name)')
    .order('departure_time', { ascending: true });
  return (data || []) as TripWithRoute[];
}

export async function getActiveRoutes(): Promise<Route[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const { data } = await getSupabase()
    .from('routes')
    .select('*')
    .eq('active', true)
    .order('name');
  return (data || []) as Route[];
}

export async function createTrip(routeId: string, direction: DirectionEnum, departureTime: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  if (!routeId || !direction || !departureTime) {
    throw new Error('Toate câmpurile sunt obligatorii');
  }

  const { error } = await getSupabase().from('trips').insert({
    route_id: routeId,
    direction,
    departure_time: departureTime,
  });

  if (error) {
    if (error.code === '23505') throw new Error('Această cursă există deja (rută + direcție + oră)');
    throw new Error(error.message);
  }
  revalidatePath('/trips');
}

export async function toggleTrip(id: string, active: boolean) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  await getSupabase().from('trips').update({ active }).eq('id', id);
  revalidatePath('/trips');
}

export async function deleteTrip(id: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const { error } = await getSupabase().from('trips').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/trips');
}
