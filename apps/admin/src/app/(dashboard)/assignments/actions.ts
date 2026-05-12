'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { parseFirstTime, parseTimeLabel } from '@/lib/assignments';

export interface AssignmentRow {
  id: string | null;
  crm_route_id: number;
  dest_to_ro: string; // northern destination, e.g. "Bălți", "Criva"
  time_chisinau: string; // tur: "06:55 - 11:05"
  time_nord: string; // retur: "14:10 - 18:30"
  driver_id: string | null;
  vehicle_id: string | null;
  vehicle_id_retur: string | null;
  retur_route_id: number | null;
  retur_route_label: string | null; // e.g. "15:55 Ocnița"
}

export interface ReturRouteOption {
  id: number;
  label: string; // e.g. "15:55 Ocnița"
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

/** Get all crm_routes with assignments for a given date (tur-retur = one assignment) */
export async function getAssignmentsForDate(
  date: string
): Promise<{ data?: AssignmentRow[]; error?: string }> {
  try { requireRole(await verifySession(), 'ADMIN'); } catch { return { error: 'Acces interzis' }; }
  const db = getSupabase();

  const { data: routes, error: routesErr } = await db
    .from('crm_routes')
    .select('id, dest_from_ro, dest_to_ro, time_nord, time_chisinau')
    .eq('active', true);

  if (routesErr) return { error: `Eroare rute: ${routesErr.message}` };
  if (!routes || routes.length === 0) return { data: [] };

  const { data: assignments, error: assignErr } = await db
    .from('daily_assignments')
    .select('id, crm_route_id, driver_id, vehicle_id, vehicle_id_retur, retur_route_id')
    .eq('assignment_date', date);

  if (assignErr) return { error: `Eroare programări: ${assignErr.message}` };

  const assignmentMap = new Map(
    (assignments || []).map((a: any) => [a.crm_route_id, a])
  );

  // Build a lookup for retur route labels
  const routeMap = new Map((routes as any[]).map((r) => [r.id, r]));

  const rows: AssignmentRow[] = (routes as any[]).map((r) => {
    const a = assignmentMap.get(r.id);
    const returRoute = a?.retur_route_id ? routeMap.get(a.retur_route_id) : null;
    return {
      id: a?.id || null,
      crm_route_id: r.id,
      dest_to_ro: r.dest_to_ro,
      time_chisinau: r.time_chisinau || '',
      time_nord: r.time_nord || '',
      driver_id: a?.driver_id || null,
      vehicle_id: a?.vehicle_id || null,
      vehicle_id_retur: a?.vehicle_id_retur || null,
      retur_route_id: a?.retur_route_id || null,
      retur_route_label: returRoute
        ? `${parseTimeLabel(returRoute.time_nord)} ${returRoute.dest_to_ro}`
        : null,
    };
  });

  // Sort by tur departure time
  rows.sort((a, b) => parseFirstTime(a.time_chisinau) - parseFirstTime(b.time_chisinau));

  return { data: rows };
}

export async function getActiveDrivers(): Promise<DriverOption[]> {
  try { requireRole(await verifySession(), 'ADMIN'); } catch { return []; }
  const { data } = await getSupabase()
    .from('drivers')
    .select('id, full_name, phone')
    .eq('active', true)
    .order('full_name');
  return (data || []) as DriverOption[];
}

export async function getActiveVehicles(): Promise<VehicleOption[]> {
  try { requireRole(await verifySession(), 'ADMIN'); } catch { return []; }
  const { data } = await getSupabase()
    .from('vehicles')
    .select('id, plate_number')
    .eq('active', true)
    .order('plate_number');
  return (data || []) as VehicleOption[];
}

export async function getReturRouteOptions(): Promise<ReturRouteOption[]> {
  try { requireRole(await verifySession(), 'ADMIN'); } catch { return []; }
  const { data } = await getSupabase()
    .from('crm_routes')
    .select('id, dest_to_ro, time_nord')
    .eq('active', true);

  return ((data || []) as any[])
    .map((r) => ({
      id: r.id,
      label: `${parseTimeLabel(r.time_nord || '')} ${r.dest_to_ro}`,
      _sort: parseFirstTime(r.time_nord || ''),
    }))
    .sort((a, b) => a._sort - b._sort)
    .map(({ id, label }) => ({ id, label }));
}

export async function upsertAssignment(
  crmRouteId: number,
  date: string,
  driverId: string,
  vehicleId: string | null,
  vehicleIdRetur?: string | null,
  returRouteId?: number | null
): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), 'ADMIN'); } catch { return { error: 'Acces interzis' }; }

  const db = getSupabase();

  // Normalize self-assignment to NULL
  const effectiveReturRouteId = returRouteId === crmRouteId ? null : (returRouteId || null);

  const row: any = {
    crm_route_id: crmRouteId,
    assignment_date: date,
    driver_id: driverId,
    vehicle_id: vehicleId,
    vehicle_id_retur: vehicleIdRetur || null,
    retur_route_id: effectiveReturRouteId,
  };

  const { error } = await db
    .from('daily_assignments')
    .upsert(row, { onConflict: 'crm_route_id,assignment_date' });

  if (error) return { error: `Eroare salvare: ${error.message}` };

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
  return {};
}

/** Update driver phone number */
export async function updateDriverPhone(driverId: string, phone: string): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), 'ADMIN'); } catch { return { error: 'Acces interzis' }; }

  const cleaned = phone.replace(/\D/g, '');
  const intl = cleaned.startsWith('373') ? cleaned : '373' + cleaned.replace(/^0/, '');

  const { error } = await getSupabase()
    .from('drivers')
    .update({ phone: intl })
    .eq('id', driverId);

  if (error) return { error: error.message };
  revalidatePath('/assignments');
  revalidatePath('/drivers');
  return {};
}

/** Get coverage: how many days ahead have assignments (from today) */
export async function getDaysCoverage(): Promise<{ date: string; count: number }[]> {
  try { requireRole(await verifySession(), 'ADMIN'); } catch { return []; }
  const db = getSupabase();
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' }));
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const { data, error } = await db
    .from('daily_assignments')
    .select('assignment_date')
    .in('assignment_date', dates);

  if (error) {
    console.error('getDaysCoverage error:', error.message);
    return dates.map(d => ({ date: d, count: 0 }));
  }

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

export async function deleteAssignment(id: string): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), 'ADMIN'); } catch { return { error: 'Acces interzis' }; }

  const { error } = await getSupabase()
    .from('daily_assignments')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/assignments');
  return {};
}

export async function copyAssignments(
  sourceDate: string,
  targetDate: string
): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), 'ADMIN'); } catch { return { error: 'Acces interzis' }; }

  const db = getSupabase();

  const { data: source, error: srcErr } = await db
    .from('daily_assignments')
    .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur, retur_route_id')
    .eq('assignment_date', sourceDate);

  if (srcErr) return { error: `Eroare citire: ${srcErr.message}` };
  if (!source || source.length === 0) {
    return { error: 'Nu există programări pentru data sursă' };
  }

  const { error: delErr } = await db
    .from('daily_assignments')
    .delete()
    .eq('assignment_date', targetDate);

  if (delErr) return { error: `Eroare ștergere: ${delErr.message}` };

  const { error } = await db
    .from('daily_assignments')
    .insert(
      source.map((s: any) => ({
        crm_route_id: s.crm_route_id,
        driver_id: s.driver_id,
        vehicle_id: s.vehicle_id,
        vehicle_id_retur: s.vehicle_id_retur,
        retur_route_id: s.retur_route_id,
        assignment_date: targetDate,
      }))
    );

  if (error) return { error: `Eroare copiere: ${error.message}` };
  revalidatePath('/assignments');
  return {};
}
