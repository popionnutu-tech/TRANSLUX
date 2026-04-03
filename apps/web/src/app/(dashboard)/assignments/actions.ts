'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

export interface AssignmentRow {
  id: string | null;
  crm_route_id: number;
  dest_to_ro: string; // northern destination, e.g. "Bălți", "Criva"
  time_chisinau: string; // tur: "06:55 - 11:05"
  time_nord: string; // retur: "14:10 - 18:30"
  driver_id: string | null;
  vehicle_id: string | null;
  vehicle_id_retur: string | null;
}

export interface DriverOption {
  id: string;
  full_name: string;
  phone: string | null;
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

/** Get all crm_routes with assignments for a given date (tur-retur = one assignment) */
export async function getAssignmentsForDate(
  date: string
): Promise<AssignmentRow[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const db = getSupabase();

  const { data: routes } = await db
    .from('crm_routes')
    .select('id, dest_from_ro, dest_to_ro, time_nord, time_chisinau')
    .eq('active', true);

  if (!routes || routes.length === 0) return [];

  const { data: assignments } = await db
    .from('daily_assignments')
    .select('id, crm_route_id, driver_id, vehicle_id, vehicle_id_retur')
    .eq('assignment_date', date);

  const assignmentMap = new Map(
    (assignments || []).map((a: any) => [a.crm_route_id, a])
  );

  const rows: AssignmentRow[] = (routes as any[]).map((r) => {
    const a = assignmentMap.get(r.id);
    return {
      id: a?.id || null,
      crm_route_id: r.id,
      dest_to_ro: r.dest_to_ro,
      time_chisinau: r.time_chisinau || '',
      time_nord: r.time_nord || '',
      driver_id: a?.driver_id || null,
      vehicle_id: a?.vehicle_id || null,
      vehicle_id_retur: a?.vehicle_id_retur || null,
    };
  });

  // Sort by tur departure time
  rows.sort((a, b) => parseFirstTime(a.time_chisinau) - parseFirstTime(b.time_chisinau));

  return rows;
}

export async function getActiveDrivers(): Promise<DriverOption[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const { data } = await getSupabase()
    .from('drivers')
    .select('id, full_name, phone')
    .eq('active', true)
    .order('full_name');
  return (data || []) as DriverOption[];
}

export async function getActiveVehicles(): Promise<VehicleOption[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
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
  driverId: string,
  vehicleId: string | null,
  vehicleIdRetur?: string | null
) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');

  const db = getSupabase();

  const row: any = {
    crm_route_id: crmRouteId,
    assignment_date: date,
    driver_id: driverId,
    vehicle_id: vehicleId,
    vehicle_id_retur: vehicleIdRetur || null,
  };

  const { error } = await db
    .from('daily_assignments')
    .upsert(row, { onConflict: 'crm_route_id,assignment_date' });

  if (error) throw new Error(error.message);

  // Auto-duplicate to tomorrow if tomorrow has no assignment for this route
  const tomorrow = nextDay(date);
  const { data: existing } = await db
    .from('daily_assignments')
    .select('id')
    .eq('crm_route_id', crmRouteId)
    .eq('assignment_date', tomorrow)
    .maybeSingle();

  if (!existing) {
    await db.from('daily_assignments').upsert(
      { ...row, assignment_date: tomorrow },
      { onConflict: 'crm_route_id,assignment_date' }
    );
  }

  revalidatePath('/assignments');
}

/** Update driver phone number */
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
  revalidatePath('/assignments');
  revalidatePath('/drivers');
}

/** Get coverage: how many days ahead have assignments (from today) */
export async function getDaysCoverage(): Promise<{ date: string; count: number }[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  const db = getSupabase();
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' }));
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const { data } = await db
    .from('daily_assignments')
    .select('assignment_date')
    .in('assignment_date', dates);

  const countMap = new Map<string, number>();
  for (const row of (data || []) as any[]) {
    countMap.set(row.assignment_date, (countMap.get(row.assignment_date) || 0) + 1);
  }

  return dates.map(d => ({ date: d, count: countMap.get(d) || 0 }));
}

function nextDay(date: string): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
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
  targetDate: string
) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');

  const db = getSupabase();

  const { data: source } = await db
    .from('daily_assignments')
    .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur')
    .eq('assignment_date', sourceDate);

  if (!source || source.length === 0) {
    throw new Error('Nu există programări pentru data sursă');
  }

  await db
    .from('daily_assignments')
    .delete()
    .eq('assignment_date', targetDate);

  const { error } = await db
    .from('daily_assignments')
    .insert(
      source.map((s: any) => ({
        crm_route_id: s.crm_route_id,
        driver_id: s.driver_id,
        vehicle_id: s.vehicle_id,
        vehicle_id_retur: s.vehicle_id_retur,
        assignment_date: targetDate,
      }))
    );

  if (error) throw new Error(error.message);
  revalidatePath('/assignments');
}
