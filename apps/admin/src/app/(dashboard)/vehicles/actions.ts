'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import type { Vehicle } from '@translux/db';

export type ClimaStatus = 'works' | 'broken' | 'none' | null;
export type VehicleWithClima = Vehicle & { ac_status: ClimaStatus; heat_status: ClimaStatus };

export async function getVehicles(): Promise<VehicleWithClima[]> {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const supa = getSupabase();
  const { data } = await supa
    .from('vehicles')
    .select('*')
    .eq('is_lde', false) // autoparcul LDE se gestionează în /lde/vehicule, nu aici
    .order('plate_number');
  const vehicles = (data || []) as Vehicle[];

  // Ultima stare climă cunoscută per mașină (din rapoartele operatorilor): A/C și căldură separat.
  const [acRes, heatRes] = await Promise.all([
    supa.from('reports').select('vehicle_id, ac_status, report_date, created_at')
      .not('ac_status', 'is', null).is('cancelled_at', null)
      .order('report_date', { ascending: false }).order('created_at', { ascending: false }),
    supa.from('reports').select('vehicle_id, heat_status, report_date, created_at')
      .not('heat_status', 'is', null).is('cancelled_at', null)
      .order('report_date', { ascending: false }).order('created_at', { ascending: false }),
  ]);
  const acMap = new Map<string, ClimaStatus>();
  for (const r of (acRes.data || []) as any[]) if (r.vehicle_id && !acMap.has(r.vehicle_id)) acMap.set(r.vehicle_id, r.ac_status);
  const heatMap = new Map<string, ClimaStatus>();
  for (const r of (heatRes.data || []) as any[]) if (r.vehicle_id && !heatMap.has(r.vehicle_id)) heatMap.set(r.vehicle_id, r.heat_status);

  return vehicles.map((v) => ({
    ...v,
    ac_status: acMap.get(v.id) ?? null,
    heat_status: heatMap.get(v.id) ?? null,
  }));
}

export async function createVehicle(plateNumber: string) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
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
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  await getSupabase().from('vehicles').update({ active }).eq('id', id);
  revalidatePath('/vehicles');
}

export async function updateVehiclePlate(id: string, plateNumber: string) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const trimmed = plateNumber.trim().toUpperCase();
  if (!trimmed) throw new Error('Numărul de înmatriculare este obligatoriu');

  const { error } = await getSupabase()
    .from('vehicles')
    .update({ plate_number: trimmed })
    .eq('id', id);

  if (error) {
    if (error.code === '23505') throw new Error('Acest număr de înmatriculare există deja');
    throw new Error(error.message);
  }
  revalidatePath('/vehicles');
}

export async function deleteVehicle(id: string) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const { error } = await getSupabase().from('vehicles').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/vehicles');
}

export async function updateVehicleDirections(id: string, directions: string[]) {
  requireRole(await verifySession(), 'ADMIN', 'DISPATCHER');
  const clean = [...new Set((directions || []).filter((d) => typeof d === 'string' && d.length))];
  const { error } = await getSupabase().from('vehicles').update({ directions: clean }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/vehicles');
}
