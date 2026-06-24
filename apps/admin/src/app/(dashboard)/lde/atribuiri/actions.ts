'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import type {
  LdeActiveAssignment,
  LdeShiftNumber,
  LdeFactoryRoute,
  LdeUzina,
  Driver,
  Vehicle,
} from '@translux/db';

// ── Tipuri compoziție pentru UI ───────────────────────────────────────────────

export type AssignmentRow = LdeActiveAssignment & {
  driver_full_name: string;
  vehicle_plate: string;
  route_number: number | null;
  route_uzina_id: string | null;
};

export type AssignmentFilters = {
  uzina_id?: string;
  vehicle_id?: string;
  driver_id?: string;
  active_only?: boolean;
};

export type CreateOptions = {
  drivers: Driver[];
  vehicles: Vehicle[];
  factory_routes: Array<LdeFactoryRoute & { uzina_display_name: string }>;
  uzine: LdeUzina[];
};

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getAssignments(filters?: AssignmentFilters): Promise<AssignmentRow[]> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  let q = sb
    .from('lde_active_assignments')
    .select(`
      id, driver_id, vehicle_id, route_id, shift_number,
      valid_from, valid_to, notes, created_at,
      drivers!inner ( full_name ),
      vehicles!inner ( plate_number ),
      lde_factory_routes ( route_number, uzina_id )
    `);

  if (filters?.active_only) q = q.is('valid_to', null);
  if (filters?.driver_id) q = q.eq('driver_id', filters.driver_id);
  if (filters?.vehicle_id) q = q.eq('vehicle_id', filters.vehicle_id);

  const { data, error } = await q
    .order('valid_to', { ascending: true, nullsFirst: true })
    .order('valid_from', { ascending: false });

  if (error) throw new Error(error.message);

  let rows: AssignmentRow[] = (data || []).map((r: any) => ({
    id: r.id,
    driver_id: r.driver_id,
    vehicle_id: r.vehicle_id,
    route_id: r.route_id,
    shift_number: r.shift_number,
    valid_from: r.valid_from,
    valid_to: r.valid_to,
    notes: r.notes,
    created_at: r.created_at,
    driver_full_name: r.drivers?.full_name ?? '—',
    vehicle_plate: r.vehicles?.plate_number ?? '—',
    route_number: r.lde_factory_routes?.route_number ?? null,
    route_uzina_id: r.lde_factory_routes?.uzina_id ?? null,
  }));

  // Filtru uzina pe rezultat (route-ul poate fi NULL, deci filtrăm post-JOIN)
  if (filters?.uzina_id) {
    rows = rows.filter((r) => r.route_uzina_id === filters.uzina_id);
  }

  return rows;
}

export async function getCreateOptions(): Promise<CreateOptions> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const [
    { data: drivers, error: dErr },
    { data: vehicles, error: vErr },
    { data: routes, error: rErr },
    { data: uzine, error: uErr },
  ] = await Promise.all([
    sb.from('drivers').select('*').eq('active', true).order('full_name'),
    sb.from('vehicles').select('*').eq('active', true).order('plate_number'),
    sb
      .from('lde_factory_routes')
      .select('*, lde_uzine!inner ( display_name )')
      .eq('active', true)
      .order('uzina_id')
      .order('route_number'),
    sb.from('lde_uzine').select('*').eq('active', true).order('display_name'),
  ]);

  if (dErr) throw new Error(dErr.message);
  if (vErr) throw new Error(vErr.message);
  if (rErr) throw new Error(rErr.message);
  if (uErr) throw new Error(uErr.message);

  const routesEnriched = (routes || []).map((r: any) => ({
    id: r.id,
    uzina_id: r.uzina_id,
    route_number: r.route_number,
    stops_in_order: r.stops_in_order,
    total_passengers: r.total_passengers,
    has_shift1: r.has_shift1,
    has_shift2: r.has_shift2,
    has_shift3: r.has_shift3,
    rotation_note: r.rotation_note,
    active: r.active,
    created_at: r.created_at,
    uzina_display_name: r.lde_uzine?.display_name ?? r.uzina_id,
  }));

  return {
    drivers: (drivers || []) as Driver[],
    vehicles: (vehicles || []) as Vehicle[],
    factory_routes: routesEnriched,
    uzine: (uzine || []) as LdeUzina[],
  };
}

// ── Write ─────────────────────────────────────────────────────────────────────

export type CreateAssignmentData = {
  driver_id: string;
  vehicle_id: string;
  route_id?: string | null;
  shift_number?: LdeShiftNumber | null;
  valid_from?: string; // YYYY-MM-DD, default today
  notes?: string | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function createAssignment(data: CreateAssignmentData) {
  requireRole(await verifySession(), 'ADMIN');
  if (!data.driver_id) throw new Error('Șoferul este obligatoriu');
  if (!data.vehicle_id) throw new Error('Mașina este obligatorie');

  const row = {
    driver_id: data.driver_id,
    vehicle_id: data.vehicle_id,
    route_id: data.route_id || null,
    shift_number: data.shift_number ?? null,
    valid_from: data.valid_from || todayIso(),
    valid_to: null,
    notes: data.notes?.trim() || null,
  };

  const { error } = await getSupabase().from('lde_active_assignments').insert(row);
  if (error) {
    // Unique partial: uq_lde_active_assignments_one_per_driver / one_per_vehicle_shift
    if (error.code === '23505') {
      throw new Error(
        'Atribuire duplicată: șoferul are deja o atribuire activă, sau mașina+schimbul sunt deja ocupate. Încheie atribuirea veche întâi.',
      );
    }
    throw new Error(error.message);
  }
  revalidatePath('/lde/atribuiri');
}

export async function endAssignment(id: string, valid_to?: string) {
  requireRole(await verifySession(), 'ADMIN');
  if (!id) throw new Error('id lipsește');

  const { error } = await getSupabase()
    .from('lde_active_assignments')
    .update({ valid_to: valid_to || todayIso() })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/lde/atribuiri');
}

export async function deleteAssignment(id: string) {
  requireRole(await verifySession(), 'ADMIN');
  if (!id) throw new Error('id lipsește');

  const { error } = await getSupabase().from('lde_active_assignments').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/atribuiri');
}
