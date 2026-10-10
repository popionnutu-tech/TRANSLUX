import 'server-only';
import { type RawAssignment } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { chisinauInstantIso, chisinauTimeOf, chisinauTodayIso } from '@/lib/chisinau-time';
import { CAPACITATE_AUTOBUZ, alegeCurenta, cheieCursa, curseDinAtribuiri, hhmm, minute, numeCursei, parseazaInterval } from './sofer-reguli';
import { creeazaCacheNomenclator, type NomenclatorRuta, type OprireRand, type RutaRand } from './sofer-nomenclator';

// Datele mini app-ului șoferului (ION-239, contractul ION-190 pașii 7–8): cursele zilei din daily_assignments (tur =
// crm_route_id, retur = retur_route_id cu override IN/OUT — ACELEAȘI funcții ca la validarea comenzii, BL-4), opririle
// și orele din crm_stop_fares (hour_from_nord pe tur, hour_from_chisinau pe retur), coordonatele din route_shapes.stops,
// pasagerii = bilete_comenzi «platita» ale cursei cu biletele valid + urcat. Comenzile de probă (test) nu ajung la
// șofer (SEC-4, ca în digest). Toate citirile prin service_role (tabelele biletelor sunt închise RLS).
//
// ION-273 («Telegram ultrafast» P4): de la 5 hopuri secvențiale (drivers → plafon → atribuiri → [rute ∥ opriri ∥ forme ∥
// comenzi] → bilete, repetate pentru «mâine») la 3: [drivers ∥ plafon] (sofer-auth) → atribuirile pe AMBELE zile într-o
// interogare → comenzile cu biletele încorporate; nomenclatorul (rute, opriri, forme) stă în memoria instanței PE RUTĂ,
// 10 min (sofer-nomenclator), deci costă un hop doar la rece. Harta tur/retur rămâne în JS, din rândurile tuturor șoferilor.

export interface OprireApi { stop_order: number; nume: string; ora: string | null; lat: number | null; lon: number | null }
export interface BiletApi { cod_qr: string; nr: number; loc_nr: number | null; status: 'valid' | 'urcat'; urcat_at: string | null }
export interface PasagerApi {
  comanda: string; nume: string; telefon: string; de_la_order: number; de_la: string; pana_la: string; locuri: number; bilete: BiletApi[];
  /** 546: reducere de student → șoferul cere carnetul la urcare. */
  student?: boolean;
}
export interface CursaApi {
  cheie: string; crm_route_id: number; going_north: boolean; ruta: string; plecare: string | null; sosire: string | null;
  opriri: OprireApi[]; pasageri: PasagerApi[]; capacitate: number;
}

interface ShapeStop { name?: string; lat?: number; lon?: number; stop_order?: number }
type AtribuireRand = RawAssignment & { assignment_date: string };

type Db = ReturnType<typeof getSupabase>;

/** Rândurile COMPLETE din daily_assignments pe zilele date (câteva zeci), o singură interogare; grupate pe zi. */
export async function atribuirileZilelor(db: Db, zile: string[]): Promise<Map<string, RawAssignment[]>> {
  const { data, error } = await db.from('daily_assignments')
    .select('assignment_date, crm_route_id, driver_id, vehicle_id, vehicle_id_retur, driver_id_retur, retur_route_id')
    .in('assignment_date', zile);
  if (error) throw new Error(`daily_assignments: ${error.message}`);
  const out = new Map<string, RawAssignment[]>(zile.map((z) => [z, []]));
  for (const r of (data || []) as AtribuireRand[]) out.get(r.assignment_date)?.push(r);
  return out;
}

/**
 * Cursele șoferului de probă (migr. 532, Ion 08.10: «pui Iura unic șofer»): fără atribuiri în grafic — cursele (rută +
 * sens) care au comenzi de probă plătite în ziua dată.
 */
export async function curseleProbei(db: Db, zi: string): Promise<Array<{ crm_route_id: number; going_north: boolean }>> {
  const { data, error } = await db.from('bilete_comenzi').select('crm_route_id, going_north')
    .eq('trip_date', zi).eq('status', 'platita').eq('proba_fizica', true);
  if (error) throw new Error(`bilete_comenzi: ${error.message}`);
  const vazute = new Map<string, { crm_route_id: number; going_north: boolean }>();
  for (const r of (data || []) as Array<{ crm_route_id: number; going_north: boolean }>) vazute.set(`${r.crm_route_id}|${r.going_north}`, r);
  return [...vazute.values()];
}

/** Cursele (rută + sens) ale șoferului în ziua dată, din atribuiri (șoferul de probă: din comenzile de probă) — fără opriri și pasageri. */
export async function curseleSoferului(db: Db, driverId: string, zi: string, proba = false): Promise<Array<{ crm_route_id: number; going_north: boolean }>> {
  if (proba) return curseleProbei(db, zi);
  const pe = await atribuirileZilelor(db, [zi]);
  return curseDinAtribuiri(pe.get(zi) ?? [], driverId);
}

// Nomenclatorul pe rută, în memoria instanței: o cerere `in(ids)` pentru rutele lipsă, trei tabele în paralel.
async function incarcaNomenclator(ids: number[]): Promise<Map<number, NomenclatorRuta>> {
  const db = getSupabase();
  const [rR, rO, rS] = await Promise.all([
    db.from('crm_routes').select('id, dest_from_ro, dest_to_ro, time_nord, time_chisinau').in('id', ids),
    db.from('crm_stop_fares').select('crm_route_id, stop_order, name_ro, hour_from_nord, hour_from_chisinau').in('crm_route_id', ids).order('stop_order'),
    db.from('route_shapes').select('crm_route_id, stops').in('crm_route_id', ids),
  ]);
  for (const r of [rR, rO, rS]) if (r.error) throw new Error(r.error.message);
  const out = new Map<number, NomenclatorRuta>(ids.map((id) => [id, { ruta: null, opriri: [], coord: new Map() }]));
  for (const r of (rR.data || []) as RutaRand[]) { const n = out.get(r.id); if (n) n.ruta = r; }
  for (const o of (rO.data || []) as OprireRand[]) out.get(o.crm_route_id)?.opriri.push(o);
  for (const s of (rS.data || []) as Array<{ crm_route_id: number; stops: ShapeStop[] | null }>) {
    const n = out.get(s.crm_route_id); if (!n) continue;
    for (const st of s.stops || []) if (typeof st.stop_order === 'number' && typeof st.lat === 'number' && typeof st.lon === 'number') n.coord.set(st.stop_order, { lat: st.lat, lon: st.lon });
  }
  return out;
}
const nomenclator = creeazaCacheNomenclator(incarcaNomenclator);

function numeRuta(r: RutaRand | null, goingNorth: boolean, id: number): string {
  if (!r) return `ruta ${id}`;
  return numeCursei(r.dest_from_ro, r.dest_to_ro, goingNorth);
}

function oraOprire(o: OprireRand, goingNorth: boolean): string | null {
  const v = goingNorth ? o.hour_from_chisinau : o.hour_from_nord;
  const m = minute(v);
  return m == null ? null : hhmm(m);
}

interface ComandaRand {
  id: string; crm_route_id: number; going_north: boolean; passenger_name: string; phone: string; from_stop_order: number;
  from_name: string; to_name: string; seats: number; reducere_tip?: string | null;
  bilete: Array<{ cod_qr: string; nr: number; loc_nr: number | null; status: string; urcat_at: string | null }> | null;
}

/**
 * Cursele zilei cu opriri, ore și pasageri — forma din contract. `atribuiri` = rândurile zilei deja citite (altfel se citesc).
 * `proba` = șoferul de probă (532): cursele din comenzile de probă și DOAR pasagerii lor; șoferii reali nu văd comenzi test.
 */
export async function curseCuPasageri(db: Db, driverId: string, zi: string, atribuiri?: RawAssignment[], proba = false): Promise<CursaApi[]> {
  const curse = proba ? await curseleProbei(db, zi) : atribuiri ? curseDinAtribuiri(atribuiri, driverId) : await curseleSoferului(db, driverId, zi);
  if (!curse.length) return [];
  const ids = [...new Set(curse.map((c) => c.crm_route_id))];
  // Nomenclatorul (cache) și comenzile cu biletele încorporate (FK unică bilete.comanda_id, migr. 483) — în paralel.
  const [nom, rC] = await Promise.all([
    nomenclator.pentru(ids),
    db.from('bilete_comenzi')
      .select('id, crm_route_id, going_north, passenger_name, phone, from_stop_order, from_name, to_name, seats, reducere_tip, bilete(cod_qr, nr, loc_nr, status, urcat_at)')
      .eq('trip_date', zi).eq('status', 'platita').eq(proba ? 'proba_fizica' : 'test', proba).in('crm_route_id', ids)
      .order('nr', { referencedTable: 'bilete', ascending: true }),
  ]);
  if (rC.error) throw new Error(`bilete_comenzi: ${rC.error.message}`);
  const comenzi = (rC.data || []) as unknown as ComandaRand[];
  // Filtrarea biletelor vii (valid/urcat) în JS, nu cu `!inner`: comanda fără bilet viu dispare mai jos, nu din embed.
  const bilete = new Map<string, BiletApi[]>();
  for (const k of comenzi) {
    const vii = (k.bilete ?? []).filter((b) => b.status === 'valid' || b.status === 'urcat')
      .sort((a, b) => a.nr - b.nr)
      .map((b) => ({ cod_qr: b.cod_qr, nr: b.nr, loc_nr: b.loc_nr ?? null, status: b.status as 'valid' | 'urcat', urcat_at: b.urcat_at }));
    if (vii.length) bilete.set(k.id, vii);
  }

  return curse.map((c) => {
    const n = nom.get(c.crm_route_id);
    const r = n?.ruta ?? null;
    const interval = parseazaInterval(c.going_north ? r?.time_chisinau : r?.time_nord);
    const ale = n?.opriri ?? [];
    // Tur = stop_order crescător (nordul e primul); retur = de la Chișinău înapoi, deci ordinea inversă.
    const ordonate = c.going_north ? [...ale].reverse() : ale;
    const opririApi: OprireApi[] = ordonate.map((o) => ({
      stop_order: o.stop_order, nume: o.name_ro ?? `oprirea ${o.stop_order}`, ora: oraOprire(o, c.going_north),
      lat: n?.coord.get(o.stop_order)?.lat ?? null, lon: n?.coord.get(o.stop_order)?.lon ?? null,
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
        locuri: k.seats, bilete: bilete.get(k.id) ?? [], student: k.reducere_tip === 'student',
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
  sofer: { id: string; nume: string; is_test?: boolean };
  zi: string;
  acum: string;
  curse: CursaApi[];
  curenta: string | null;
  motiv_curenta: 'orar';
  maine?: CursaApi[];
}

/** GET /api/bilete-sofer/azi: cursele de azi + cursa curentă (C1, v1 fără GPS → «orar»); fără cursă azi → și «maine». */
export async function raspunsAzi(sofer: { id: string; nume: string; is_test?: boolean }, now = new Date()): Promise<RaspunsAzi> {
  const db = getSupabase();
  const zi = chisinauTodayIso();
  const maine = ziUrmatoare(zi);
  const ora = chisinauTimeOf(now.toISOString());
  const atribuiri = await atribuirileZilelor(db, [zi, maine]);
  const proba = sofer.is_test === true;
  const curse = await curseCuPasageri(db, sofer.id, zi, atribuiri.get(zi) ?? [], proba);
  const curenta = alegeCurenta(curse.filter((c) => c.plecare).map((c) => ({ cheie: c.cheie, plecare: c.plecare as string, sosire: c.sosire })), ora);
  const r: RaspunsAzi = { sofer, zi, acum: chisinauInstantIso(zi, ora), curse, curenta, motiv_curenta: 'orar' };
  // Fără cursă curentă sau viitoare azi (nicio atribuire, sau toate au trecut) → ziua următoare, cu aceeași formă (atribuirile sunt deja citite).
  if (!curenta) r.maine = await curseCuPasageri(db, sofer.id, maine, atribuiri.get(maine) ?? [], proba);
  return r;
}
