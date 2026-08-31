'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

export interface MappingRow {
  trip_id: string;
  departure_time: string;
  direction: string;
  crm_route_id: number | null;
  active: boolean;
}

export interface CrmRouteOption {
  id: number;
  time_chisinau: string;
  dest_to_ro: string;
}

export async function getMappings(): Promise<MappingRow[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  // Rolul, nu doar sesiunea: Next dispecerizează acțiunile server după un id
  // GLOBAL, deci un rol îngust (UZINE, DISPECER…) le poate invoca de pe calea LUI.
  // Middleware-ul filtrează calea, nu acțiunea (security review 31.08).
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');
  const { data } = await getSupabase()
    .from('trips')
    .select('id, departure_time, direction, crm_route_id, active')
    .eq('direction', 'CHISINAU_BALTI')
    .eq('active', true)
    .order('departure_time', { ascending: true });
  return (data || []).map((t: any) => ({
    trip_id: t.id,
    departure_time: t.departure_time,
    direction: t.direction,
    crm_route_id: t.crm_route_id,
    active: t.active,
  }));
}

export async function getCrmRoutes(): Promise<CrmRouteOption[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  // Rolul, nu doar sesiunea: Next dispecerizează acțiunile server după un id
  // GLOBAL, deci un rol îngust (UZINE, DISPECER…) le poate invoca de pe calea LUI.
  // Middleware-ul filtrează calea, nu acțiunea (security review 31.08).
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');
  const { data } = await getSupabase()
    .from('crm_routes')
    .select('id, time_chisinau, dest_to_ro')
    .eq('active', true)
    .order('id', { ascending: true });
  return (data || []) as CrmRouteOption[];
}

export async function updateMapping(tripId: string, crmRouteId: number | null) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  // Rolul, nu doar sesiunea: Next dispecerizează acțiunile server după un id
  // GLOBAL, deci un rol îngust (UZINE, DISPECER…) le poate invoca de pe calea LUI.
  // Middleware-ul filtrează calea, nu acțiunea (security review 31.08).
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');
  const { error } = await getSupabase()
    .from('trips')
    .update({ crm_route_id: crmRouteId })
    .eq('id', tripId);
  if (error) throw new Error(error.message);
  revalidatePath('/mapping');
}
