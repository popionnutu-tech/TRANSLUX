import 'server-only';
import { buildReturAssignmentMap, buildTurAssignmentMap, type RawAssignment } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import type { ComandaPlangere, RandPlangere, RepoPlangeri, SoferCursa } from './plangere';

// Accesul la bază pentru plângerile din botul Telegram (ION-252). Toate prin service_role (voice_complaints și
// bilete_comenzi au RLS deny-all). O eroare a bazei aruncă: ruta răspunde 503, iar botul îi spune clientului să retrimită.

const UNIQUE_VIOLATION = '23505';

async function plangeriDeLa(telegramId: number, deLa: string): Promise<number> {
  const { count, error } = await getSupabase().from('voice_complaints')
    .select('id', { count: 'exact', head: true })
    .eq('telegram_id', telegramId)
    .gte('created_at', deLa);
  if (error) throw new Error(`voice_complaints plafon: ${error.message}`);
  return count ?? 0;
}

async function comanda(cod: string): Promise<ComandaPlangere | null> {
  const { data, error } = await getSupabase().from('bilete_comenzi')
    .select('id, telegram_id, trip_date, crm_route_id, going_north, from_name, to_name, departure_at, passenger_name, phone, test')
    .eq('cod', cod).maybeSingle();
  if (error) throw new Error(`bilete_comenzi: ${error.message}`);
  if (!data) return null;
  return { ...data, telegram_id: data.telegram_id == null ? null : Number(data.telegram_id) } as ComandaPlangere;
}

/** Aceleași reguli ca mini app-ul șoferului (sofer.ts) și botul: going_north=false → tur, true → retur. */
async function soferulCursei(c: Pick<ComandaPlangere, 'trip_date' | 'crm_route_id' | 'going_north'>): Promise<SoferCursa | null> {
  const db = getSupabase();
  const { data, error } = await db.from('daily_assignments')
    .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur, driver_id_retur, retur_route_id')
    .eq('assignment_date', c.trip_date);
  if (error) throw new Error(`daily_assignments: ${error.message}`);
  const toate = ((data ?? []) as RawAssignment[]).filter((a) => a.crm_route_id != null && a.driver_id);
  const atribuire = (c.going_north ? buildReturAssignmentMap(toate) : buildTurAssignmentMap(toate)).get(c.crm_route_id);
  if (!atribuire?.driver_id) return null;
  const [rS, rV] = await Promise.all([
    db.from('drivers').select('full_name').eq('id', atribuire.driver_id).maybeSingle(),
    atribuire.vehicle_id
      ? db.from('vehicles').select('plate_number').eq('id', atribuire.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (rS.error) throw new Error(`drivers: ${rS.error.message}`);
  if (rV.error) throw new Error(`vehicles: ${rV.error.message}`);
  return {
    driver_id: atribuire.driver_id,
    driver_name: (rS.data as { full_name: string | null } | null)?.full_name ?? null,
    plate: (rV.data as { plate_number: string | null } | null)?.plate_number ?? null,
  };
}

async function insereaza(r: RandPlangere): Promise<'inserata' | 'dubla'> {
  const { error } = await getSupabase().from('voice_complaints').insert(r);
  if (!error) return 'inserata';
  if (error.code === UNIQUE_VIOLATION) return 'dubla';
  throw new Error(`voice_complaints insert: ${error.message}`);
}

export const repoPlangeri: RepoPlangeri = { plangeriDeLa, comanda, soferulCursei, insereaza };
