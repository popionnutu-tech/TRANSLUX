'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import type {
  LdeFactoryRoute,
  LdeFactoryRouteShift,
  LdeUzina,
  Vehicle,
} from '@translux/db';

export type CursaDetail = {
  route: LdeFactoryRoute;
  shifts: LdeFactoryRouteShift[];
  vehicles: Array<{
    route_shift_id: string;
    shift_number: 1 | 2 | 3;
    vehicle_id: string;
    plate_number: string;
    is_primary: boolean;
    rotation_note: string | null;
  }>;
};

export async function getUzinas(): Promise<LdeUzina[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data, error } = await getSupabase()
    .from('lde_uzine')
    .select('*')
    .eq('active', true)
    .order('display_name');
  if (error) throw new Error(error.message);
  return (data || []) as LdeUzina[];
}

export async function getCurse(uzina_id?: string): Promise<LdeFactoryRoute[]> {
  requireRole(await verifySession(), 'ADMIN');
  let q = getSupabase()
    .from('lde_factory_routes')
    .select('*')
    .eq('active', true);
  if (uzina_id) q = q.eq('uzina_id', uzina_id);
  const { data, error } = await q
    .order('uzina_id')
    .order('route_number');
  if (error) throw new Error(error.message);
  return (data || []) as LdeFactoryRoute[];
}

export async function getCursaDetail(route_id: string): Promise<CursaDetail> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const [{ data: route, error: rErr }, { data: shifts, error: sErr }] = await Promise.all([
    sb.from('lde_factory_routes').select('*').eq('id', route_id).single(),
    sb.from('lde_factory_route_shifts').select('*').eq('route_id', route_id).order('shift_number'),
  ]);
  if (rErr) throw new Error(rErr.message);
  if (sErr) throw new Error(sErr.message);

  const shiftIds = (shifts || []).map((s: LdeFactoryRouteShift) => s.id);

  let vehicles: CursaDetail['vehicles'] = [];
  if (shiftIds.length > 0) {
    const { data: rv, error: vErr } = await sb
      .from('lde_factory_route_vehicles')
      .select('route_shift_id, vehicle_id, is_primary, rotation_note')
      .in('route_shift_id', shiftIds);
    if (vErr) throw new Error(vErr.message);

    const vehicleIds = Array.from(new Set((rv || []).map((r: any) => r.vehicle_id)));
    let plateMap = new Map<string, string>();
    if (vehicleIds.length > 0) {
      const { data: vData, error: vDataErr } = await sb
        .from('vehicles')
        .select('id, plate_number')
        .in('id', vehicleIds);
      if (vDataErr) throw new Error(vDataErr.message);
      plateMap = new Map(
        (vData || []).map((v: Pick<Vehicle, 'id' | 'plate_number'>) => [v.id, v.plate_number]),
      );
    }

    const shiftNumberById = new Map(
      (shifts || []).map((s: LdeFactoryRouteShift) => [s.id, s.shift_number]),
    );

    vehicles = (rv || []).map((r: any) => ({
      route_shift_id: r.route_shift_id,
      shift_number: shiftNumberById.get(r.route_shift_id) as 1 | 2 | 3,
      vehicle_id: r.vehicle_id,
      plate_number: plateMap.get(r.vehicle_id) || '—',
      is_primary: r.is_primary,
      rotation_note: r.rotation_note,
    }));
  }

  return {
    route: route as LdeFactoryRoute,
    shifts: (shifts || []) as LdeFactoryRouteShift[],
    vehicles,
  };
}
