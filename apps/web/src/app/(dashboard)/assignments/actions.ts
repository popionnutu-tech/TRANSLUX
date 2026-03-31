'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

export type ScheduleDirection = 'CHISINAU_NORD' | 'NORD_CHISINAU';

export interface AssignmentRow {
  id: string | null;
  crm_route_id: number;
  dest_to_ro: string; // "Chișinău - Criva" or "Criva - Chișinău"
  time_display: string; // "18:55 - 00:01" or "12:35 - 17:40"
  direction: ScheduleDirection;
  driver_id: string | null;
  vehicle_id: string | null;
}

export interface DriverOption {
  id: string;
  full_name: string;
}

export interface VehicleOption {
  id: string;
  plate_number: string;
}

/** Parse first time from "HH:MM - HH:MM" string for sorting */
function parseFirstTime(display: string): number {
  const match = display.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

/** Get all crm_routes with assignments for a given date and direction */
export async function getAssignmentsForDate(
  date: string,
  direction: ScheduleDirection
): Promise<AssignmentRow[]> {
  const db = getSupabase();

  const { data: routes } = await db
    .from('crm_routes')
    .select('id, dest_from_ro, dest_to_ro, time_nord, time_chisinau')
    .eq('active', true);

  if (!routes || routes.length === 0) return [];

  const { data: assignments } = await db
    .from('daily_assignments')
    .select('id, crm_route_id, driver_id, vehicle_id')
    .eq('assignment_date', date)
    .eq('direction', direction);

  const assignmentMap = new Map(
    (assignments || []).map((a: any) => [a.crm_route_id, a])
  );

  const rows: AssignmentRow[] = (routes as any[]).map((r) => {
    const a = assignmentMap.get(r.id);
    // CHISINAU_NORD = plecare din Chișinău → destinație = dest_to_ro, ore = time_chisinau
    // NORD_CHISINAU = plecare din Nord → destinație = dest_from_ro, ore = time_nord
    const isNorth = direction === 'CHISINAU_NORD';
    return {
      id: a?.id || null,
      crm_route_id: r.id,
      dest_to_ro: isNorth ? r.dest_to_ro : r.dest_from_ro,
      time_display: isNorth ? r.time_chisinau : r.time_nord,
      direction,
      driver_id: a?.driver_id || null,
      vehicle_id: a?.vehicle_id || null,
    };
  });

  // Sort by first departure time
  rows.sort((a, b) => parseFirstTime(a.time_display) - parseFirstTime(b.time_display));

  return rows;
}

export async function getActiveDrivers(): Promise<DriverOption[]> {
  const { data } = await getSupabase()
    .from('drivers')
    .select('id, full_name')
    .eq('active', true)
    .order('full_name');
  return (data || []) as DriverOption[];
}

export async function getActiveVehicles(): Promise<VehicleOption[]> {
  const { data } = await getSupabase()
    .from('vehicles')
    .select('id, plate_number')
    .eq('active', true)
    .order('plate_number');
  return (data || []) as VehicleOption[];
}

export async function upsertAssignment(
  crmRouteId: number,
  date: string,
  direction: ScheduleDirection,
  driverId: string,
  vehicleId: string | null
) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');

  const { error } = await getSupabase()
    .from('daily_assignments')
    .upsert(
      {
        crm_route_id: crmRouteId,
        assignment_date: date,
        direction,
        driver_id: driverId,
        vehicle_id: vehicleId,
      },
      { onConflict: 'crm_route_id,assignment_date,direction' }
    );

  if (error) throw new Error(error.message);
  revalidatePath('/assignments');
}

export async function deleteAssignment(id: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');

  const { error } = await getSupabase()
    .from('daily_assignments')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/assignments');
}

export async function copyAssignments(
  sourceDate: string,
  targetDate: string,
  direction: ScheduleDirection
) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');

  const db = getSupabase();

  const { data: source } = await db
    .from('daily_assignments')
    .select('crm_route_id, driver_id, vehicle_id')
    .eq('assignment_date', sourceDate)
    .eq('direction', direction);

  if (!source || source.length === 0) {
    throw new Error('Nu există programări pentru data sursă');
  }

  await db
    .from('daily_assignments')
    .delete()
    .eq('assignment_date', targetDate)
    .eq('direction', direction);

  const { error } = await db
    .from('daily_assignments')
    .insert(
      source.map((s: any) => ({
        crm_route_id: s.crm_route_id,
        driver_id: s.driver_id,
        vehicle_id: s.vehicle_id,
        assignment_date: targetDate,
        direction,
      }))
    );

  if (error) throw new Error(error.message);
  revalidatePath('/assignments');
}
