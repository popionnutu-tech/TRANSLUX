import 'server-only';
import { buildReturAssignmentMap, buildTurAssignmentMap, type RawAssignment } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { chisinauInstantIso, chisinauTimeOf, chisinauTodayIso } from '@/lib/chisinau-time';
import { CAPACITATE_AUTOBUZ, alegeCurenta, cheieCursa, hhmm, minute, parseazaInterval } from './sofer-reguli';

// Datele mini app-ului șoferului (ION-239, contractul ION-190 pașii 7–8): cursele zilei din daily_assignments (tur =
// crm_route_id, retur = retur_route_id cu override IN/OUT — ACELEAȘI funcții ca la validarea comenzii, BL-4), opririle
// și orele din crm_stop_fares (hour_from_nord pe tur, hour_from_chisinau pe retur), coordonatele din route_shapes.stops,
// pasagerii = bilete_comenzi «platita» ale cursei cu biletele valid + urcat. Comenzile de probă (test) nu ajung la
// șofer (SEC-4, ca în digest). Toate citirile prin service_role (tabelele biletelor sunt închise RLS).

export interface OprireApi { stop_order: number; nume: string; ora: string | null; lat: number | null; lon: number | null }
export interface BiletApi { cod_qr: string; nr: number; loc_nr: number | null; status: 'valid' | 'urcat'; urcat_at: string | null }
export interface PasagerApi {
  comanda: string; nume: string; telefon: string; de_la_order: number; de_la: string; pana_la: string; locuri: number; bilete: BiletApi[];
}
export interface CursaApi {
  cheie: string; crm_route_id: number; going_north: boolean; ruta: string; plecare: string | null; sosire: string | null;
  opriri: OprireApi[]; pasageri: PasagerApi[]; capacitate: number;
}

interface RutaRand { id: number; dest_from_ro: string; dest_to_ro: string; time_nord: string | null; time_chisinau: string | null }
interface OprireRand { crm_route_id: number; stop_order: number; name_ro: string | null; hour_from_nord: string | null; hour_from_chisinau: string | null }
interface ShapeStop { name?: string; lat?: number; lon?: number; stop_order?: number }

type Db = ReturnType<typeof getSupabase>;

/** Cursele (rută + sens) ale șoferului în ziua dată, din atribuiri — fără opriri și pasageri. */
export async function curseleSoferului(db: Db, driverId: string, zi: string): Promise<Array<{ crm_route_id: number; going_north: boolean }>> {
  const { data, error } = await db.from('daily_assignments')
    .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur, driver_id_retur, retur_route_id')
    .eq('assignment_date', zi);
  if (error) throw new Error(`daily_assignments: ${error.message}`);
  const all = ((data || []) as RawAssignment[]).filter((a) => a.crm_route_id != null && a.driver_id);
  const out: Array<{ crm_route_id: number; going_north: boolean }> = [];
  for (const [rid, d] of buildTurAssignmentMap(all)) if (d.driver_id === driverId) out.push({ crm_route_id: rid, going_north: false });
  for (const [rid, d] of buildReturAssignmentMap(all)) if (d.driver_id === driverId) out.push({ crm_route_id: rid, going_north: true });
  return out;
}

function numeRuta(r: RutaRand | undefined, goingNorth: boolean, id: number): string {
  if (!r) return `ruta ${id}`;
  return goingNorth ? `${r.dest_to_ro} – ${r.dest_from_ro}` : `${r.dest_from_ro} – ${r.dest_to_ro}`;
}

function oraOprire(o: OprireRand, goingNorth: boolean): string | null {
  const v = goingNorth ? o.hour_from_chisinau : o.hour_from_nord;
  const m = minute(v);
  return m == null ? null : hhmm(m);
}

/** Cursele zilei cu opriri, ore și pasageri — forma din contract. */
export async function curseCuPasageri(db: Db, driverId: string, zi: string): Promise<CursaApi[]> {
  const curse = await curseleSoferului(db, driverId, zi);
  if (!curse.length) return [];
  const ids = [...new Set(curse.map((c) => c.crm_route_id))];
  const [rR, rO, rS, rC] = await Promise.all([
    db.from('crm_routes').select('id, dest_from_ro, dest_to_ro, time_nord, time_chisinau').in('id', ids),
    db.from('crm_stop_fares').select('crm_route_id, stop_order, name_ro, hour_from_nord, hour_from_chisinau').in('crm_route_id', ids).order('stop_order'),
    db.from('route_shapes').select('crm_route_id, stops').in('crm_route_id', ids),
    db.from('bilete_comenzi').select('id, crm_route_id, going_north, passenger_name, phone, from_stop_order, from_name, to_name, seats')
      .eq('trip_date', zi).eq('status', 'platita').eq('test', false).in('crm_route_id', ids),
  ]);
  for (const r of [rR, rO, rS, rC]) if (r.error) throw new Error(r.error.message);
  const rute = new Map((rR.data as RutaRand[]).map((r) => [r.id, r]));
  const opriri = rO.data as OprireRand[];
  const coord = new Map<string, { lat: number; lon: number }>();
  for (const s of (rS.data || []) as Array<{ crm_route_id: number; stops: ShapeStop[] | null }>) {
    for (const st of s.stops || []) {
      if (typeof st.stop_order === 'number' && typeof st.lat === 'number' && typeof st.lon === 'number') coord.set(`${s.crm_route_id}:${st.stop_order}`, { lat: st.lat, lon: st.lon });
    }
  }
  const comenzi = (rC.data || []) as Array<{ id: string; crm_route_id: number; going_north: boolean; passenger_name: string; phone: string; from_stop_order: number; from_name: string; to_name: string; seats: number }>;
  const bilete = new Map<string, BiletApi[]>();
  if (comenzi.length) {
    const { data, error } = await db.from('bilete').select('comanda_id, cod_qr, nr, loc_nr, status, urcat_at')
      .in('comanda_id', comenzi.map((c) => c.id)).in('status', ['valid', 'urcat']).order('nr');
    if (error) throw new Error(`bilete: ${error.message}`);
    for (const b of (data || []) as Array<BiletApi & { comanda_id: string }>) {
      const l = bilete.get(b.comanda_id) ?? [];
      l.push({ cod_qr: b.cod_qr, nr: b.nr, loc_nr: b.loc_nr ?? null, status: b.status, urcat_at: b.urcat_at });
      bilete.set(b.comanda_id, l);
    }
  }

  return curse.map((c) => {
    const r = rute.get(c.crm_route_id);
    const interval = parseazaInterval(c.going_north ? r?.time_chisinau : r?.time_nord);
    const ale = opriri.filter((o) => o.crm_route_id === c.crm_route_id);
    // Tur = stop_order crescător (nordul e primul); retur = de la Chișinău înapoi, deci ordinea inversă.
    const ordonate = c.going_north ? [...ale].reverse() : ale;
    const opririApi: OprireApi[] = ordonate.map((o) => ({
      stop_order: o.stop_order, nume: o.name_ro ?? `oprirea ${o.stop_order}`, ora: oraOprire(o, c.going_north),
      lat: coord.get(`${c.crm_route_id}:${o.stop_order}`)?.lat ?? null, lon: coord.get(`${c.crm_route_id}:${o.stop_order}`)?.lon ?? null,
    }));
    const plecare = interval.plecare ?? opririApi.find((o) => o.ora)?.ora ?? null;
    const sosire = interval.sosire ?? [...opririApi].reverse().find((o) => o.ora)?.ora ?? null;
    // Pasagerii în ordinea de mers (oprirea de urcare), apoi după nume; doar comenzile cu cel puțin un bilet viu.
    const sens = c.going_north ? -1 : 1;
    const pasageri: PasagerApi[] = comenzi
      .filter((k) => k.crm_route_id === c.crm_route_id && k.going_north === c.going_north && (bilete.get(k.id)?.length ?? 0) > 0)
      .sort((a, b) => sens * (a.from_stop_order - b.from_stop_order) || a.passenger_name.localeCompare(b.passenger_name, 'ro'))
      .map((k) => ({
        comanda: k.id, nume: k.passenger_name, telefon: k.phone, de_la_order: k.from_stop_order, de_la: k.from_name, pana_la: k.to_name,
        locuri: k.seats, bilete: bilete.get(k.id) ?? [],
      }));
    return {
      cheie: cheieCursa(zi, c.crm_route_id, c.going_north), crm_route_id: c.crm_route_id, going_north: c.going_north,
      ruta: numeRuta(r, c.going_north, c.crm_route_id), plecare, sosire, opriri: opririApi, pasageri, capacitate: CAPACITATE_AUTOBUZ,
    };
  }).sort((a, b) => (minute(a.plecare) ?? 9999) - (minute(b.plecare) ?? 9999));
}

function ziUrmatoare(zi: string): string {
  const d = new Date(`${zi}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface RaspunsAzi {
  sofer: { id: string; nume: string };
  zi: string;
  acum: string;
  curse: CursaApi[];
  curenta: string | null;
  motiv_curenta: 'orar';
  maine?: CursaApi[];
}

/** GET /api/bilete-sofer/azi: cursele de azi + cursa curentă (C1, v1 fără GPS → «orar»); fără cursă azi → și «maine». */
export async function raspunsAzi(sofer: { id: string; nume: string }, now = new Date()): Promise<RaspunsAzi> {
  const db = getSupabase();
  const zi = chisinauTodayIso();
  const ora = chisinauTimeOf(now.toISOString());
  const curse = await curseCuPasageri(db, sofer.id, zi);
  const curenta = alegeCurenta(curse.filter((c) => c.plecare).map((c) => ({ cheie: c.cheie, plecare: c.plecare as string, sosire: c.sosire })), ora);
  const r: RaspunsAzi = { sofer, zi, acum: chisinauInstantIso(zi, ora), curse, curenta, motiv_curenta: 'orar' };
  // Fără cursă curentă sau viitoare azi (nicio atribuire, sau toate au trecut) → ziua următoare, cu aceeași formă.
  if (!curenta) r.maine = await curseCuPasageri(db, sofer.id, ziUrmatoare(zi));
  return r;
}
