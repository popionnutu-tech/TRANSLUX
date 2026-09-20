'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { OUR_OPERATOR } from '@/lib/anta/names';

// Concurența pe direcție (ION-12): cine circulă prin două puncte, din graficul ANTA importat
// (anta_courses / anta_course_stops, migr. 382) plus cursele noastre (source='tlx').

export interface AntaStop {
  seq: number;
  name: string;
  note: string;
  km_tur: number;
  time_tur: string | null;
  time_retur: string | null;
  km_retur: number;
  district: string | null;
}

export interface AntaCourse {
  id: number;
  source: 'anta' | 'tlx';
  code: string;
  route_name: string;
  operator: string;
  dep_tur: string | null;
  dep_retur: string | null;
  stops: AntaStop[];
}

export interface Place { name: string; district: string | null; n: number }
export interface Founder { name: string; share: string | null }
/** O firmă din graficul ANTA cu ce e public despre ea (ION-13): fondatori + administrator, nu beneficiari efectivi. */
export interface Company {
  company: string;
  idno: string | null;
  official_name: string | null;
  administrator: string | null;
  founders: Founder[];
  source: string | null;
  note: string | null;
}
export interface Operator { operator: string; n: number }
export interface TariffRate { value: number; from: string }

export interface ConcurentaInit {
  places: Place[];
  operators: Operator[];
  companies: Company[];
  rate: TariffRate | null;
  ourOperator: string;
  counts: { courses: number; ours: number };
}



/** Tariful interraional în vigoare (rate_interurban_long), cu fallback pe ultima perioadă începută. */
async function currentRate(): Promise<TariffRate | null> {
  const db = getSupabase();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const { data: cur } = await db
    .from('tariff_periods').select('rate_interurban_long, period_start')
    .lte('period_start', today).gte('period_end', today)
    .order('period_start', { ascending: false }).limit(1).maybeSingle();
  const row = cur ?? (await db
    .from('tariff_periods').select('rate_interurban_long, period_start')
    .lte('period_start', today).order('period_start', { ascending: false }).limit(1).maybeSingle()).data;
  if (!row) return null;
  const [y, m, d] = String(row.period_start).split('-');
  return { value: Number(row.rate_interurban_long), from: `${d}.${m}.${y}` };
}

export async function getConcurentaInit(): Promise<ConcurentaInit> {
  requireRole(await verifySession(), 'ADMIN');
  const db = getSupabase();
  // anta_places / anta_operators întorc jsonb într-un singur rând (PostgREST ar tăia un set la 1000).
  const [placesR, opsR, compR, rate, total, ours] = await Promise.all([
    db.rpc('anta_places'),
    db.rpc('anta_operators'),
    db.rpc('anta_companies_json'),
    currentRate(),
    db.from('anta_courses').select('id', { count: 'exact', head: true }),
    db.from('anta_courses').select('id', { count: 'exact', head: true }).eq('source', 'tlx'),
  ]);
  if (placesR.error) throw new Error(placesR.error.message);
  if (opsR.error) throw new Error(opsR.error.message);
  if (compR.error) throw new Error(compR.error.message);
  return {
    places: (placesR.data ?? []) as Place[],
    operators: (opsR.data ?? []) as Operator[],
    companies: (compR.data ?? []) as Company[],
    rate,
    ourOperator: OUR_OPERATOR,
    counts: { courses: total.count ?? 0, ours: ours.count ?? 0 },
  };
}

export interface PlaceKey { name: string; district: string | null }

/** Cursele care trec prin `from` (și prin `to`, dacă e dat), cu toate opririle. Direcția o alege clientul. */
export async function searchCourses(from: PlaceKey, to: PlaceKey | null): Promise<AntaCourse[]> {
  requireRole(await verifySession(), 'ADMIN');
  if (!from?.name) return [];
  const db = getSupabase();
  const { data, error } = await db.rpc('anta_search', {
    p_from: from.name, p_from_district: from.district,
    p_to: to?.name ?? null, p_to_district: to?.district ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AntaCourse[];
}
