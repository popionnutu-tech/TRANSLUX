// Citirea unei zile pentru neconformitățile Mejgorod (ION-246): cursele interurbane din grafic și trecerile GPS.
// Comună pentru mesajul zilnic din grupă (/api/cron/mejgorod-neconformitati) și analiza săptămânală Sîngerei
// pentru Ion (/api/cron/mejgorod-singerei-saptamana), ca ambele să judece aceleași curse.

import { getSupabase } from '../supabase';
import { curseleZilei, gasesteNeconformitati, type Atribuire, type Cursa, type Neconformitate, type Trecere } from './neconformitati';

// O zi are ~25 de treceri × ~60 de curse, peste plafonul PostgREST de 1000 de rânduri: pe pagini.
// vranesti_s (migr. 527): dacă coloana încă lipsește (42703), se citește fără ea — excepția Vrănești
// nu se aplică, restul merge.
const COLOANE = 'crm_route_id, going_north, stop_name, scheduled, passed_at, offset_min, distance_m, centru_m, vehicle_id';
export async function trecerileZilei(date: string, cuVranesti = true): Promise<Trecere[]> {
  const out: Trecere[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase()
      .from('route_stop_passes')
      .select(cuVranesti ? `${COLOANE}, vranesti_s` : COLOANE)
      .eq('date', date)
      .order('crm_route_id').order('going_north').order('stop_order')
      .range(from, from + 999);
    if (error) {
      if (cuVranesti && error.code === '42703') return trecerileZilei(date, false);
      throw new Error(error.message);
    }
    out.push(...((data ?? []) as unknown as Trecere[]));
    if (!data || data.length < 1000) return out;
  }
}

export interface ZiuaMejgorod {
  date: string;
  treceri: Trecere[];
  /** cursele din grafic, fără cele anulate și sensurile ascunse */
  curse: Cursa[];
  rezultat: { lista: Neconformitate[]; faraGps: Cursa[] };
}

/** Cursele zilei + trecerile + neconformitățile, exact ca mesajul zilnic. */
export async function citesteZiua(date: string): Promise<ZiuaMejgorod> {
  const sb = getSupabase();
  const [routesRes, asgRes, treceri, cancelRes] = await Promise.all([
    sb.from('crm_routes').select('id, tur_ascuns, retur_ascuns').eq('route_type', 'interurban').eq('active', true),
    sb.from('daily_assignments').select('crm_route_id, retur_route_id, driver_id, driver_id_retur, vehicle_id, vehicle_id_retur').eq('assignment_date', date),
    trecerileZilei(date),
    sb.from('route_cancellations').select('crm_route_id').eq('ziua', date),
  ]);
  const err = routesRes.error || asgRes.error || cancelRes.error;
  if (err) throw new Error(err.message);
  const rute = new Map((routesRes.data ?? []).map((r) => [r.id as number, r]));
  const anulate = new Set((cancelRes.data ?? []).map((c) => c.crm_route_id as number));
  const curse = curseleZilei((asgRes.data ?? []) as Atribuire[]).filter((c) => {
    const r = rute.get(c.ruta);
    return r && !anulate.has(c.ruta) && !(c.retur ? r.retur_ascuns : r.tur_ascuns);
  });
  return { date, treceri, curse, rezultat: gasesteNeconformitati(treceri, curse) };
}

/** Numele șoferilor și numerele mașinilor (pentru texte). */
export async function citesteNume(): Promise<{ sofer: Map<string, string>; masina: Map<string, string>; locuri: Map<string, number | null> }> {
  const sb = getSupabase();
  const [driversRes, vehiclesRes] = await Promise.all([
    sb.from('drivers').select('id, full_name'),
    sb.from('vehicles').select('id, plate_number, passenger_seats'),
  ]);
  const err = driversRes.error || vehiclesRes.error;
  if (err) throw new Error(err.message);
  return {
    sofer: new Map((driversRes.data ?? []).map((d) => [d.id as string, d.full_name as string])),
    masina: new Map((vehiclesRes.data ?? []).map((v) => [v.id as string, v.plate_number as string])),
    locuri: new Map((vehiclesRes.data ?? []).map((v) => [v.id as string, (v.passenger_seats as number | null) ?? null])),
  };
}
