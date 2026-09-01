// Identificarea cursei și a șoferului după ce știe clientul (rută + zi + oră,
// numărul mașinii, numele șoferului). Codul a trăit până la 01.09 în route-ul
// find-past-trip; e mutat aici pentru că reclamațiile au nevoie de ACEEAȘI
// identificare (Ion 01.09: «trebuie clar să identificăm cine este vinovatul»),
// dar de alt răspuns: la lucruri uitate numărul șoferului se dă clientului, la
// reclamații nu se dă niciodată.
//
// Modulul întoarce DOAR candidați și motivul pentru care n-a putut identifica.
// Frazele rostite le compune fiecare route în parte — ele diferă pe caz.
import { searchTrips } from '../trips-search';
import { getSupabase } from '../supabase';
import { localitiesToRo, type Suggestion } from '../voice-locality';
import { resolveVoiceDatePast } from '../date-spoken';
import { parseTimeLabel } from '../assignments';

// Lucruri uitate: obiectul nu mai stă la șofer după două săptămâni.
export const MAX_DAYS_BACK = 14;
// Reclamații: aici limita nu e a obiectului, ci a datelor — atribuirile zilei
// spun cine a condus cât timp există rândul. Cel mai vechi e din aprilie, deci
// o reclamație de acum trei săptămâni ARE vinovat identificabil (audit 01.09:
// refuzul la 14 zile spunea o imposibilitate tehnică inexistentă).
export const COMPLAINT_MAX_DAYS_BACK = 90;
// Clientul ține minte ora aproximativ («pe la cinci») — fereastra prinde cursa
// fără să înghită jumătate de orar.
export const DEPARTURE_WINDOW_MIN = 75;
// 3 cifre de plăcuță = zeci de mașini + enumerare ieftină a registrului
// (security M3); 4 caractere restrâng real. Numele rămâne la 3.
export const MIN_PLATE = 4;
export const MIN_NAME = 3;

export type Candidate = {
  driver_id: string | null;
  departure: string | null;
  route_ro: string | null;
  route_ru: string | null;
  driver: string | null;
  phone: string | null;
  plate: string | null;
};

export const normPlate = (s: string) => s.toUpperCase().replace(/[^A-ZĂÂÎȘȚ0-9]/gu, '');
export const normName = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function nowMinutes(): number {
  const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
  return Number(now.slice(0, 2)) * 60 + Number(now.slice(3, 5));
}

export function toMinutes(t: string): number | null {
  // «11.20», «11 20» sau «11:20» — clientul le rostește la fel (audit L4).
  const m = t.trim().replace(/[.\s]+/, ':').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Calea B — fără rută: căutare în atribuirile zilei după numărul mașinii /
// numele șoferului. Fiecare criteriu TRANSMIS trebuie să se potrivească (ȘI, nu
// SAU — review High 1: un SAU lărgea selecția la fiecare detaliu nou și putea
// scoate numărul unui om străin pe potrivire de nume când mașina NU se potrivea).
async function searchByPlateOrDriver(tripDate: string, plate: string, driverName: string, depMin: number | null, today: string): Promise<Candidate[]> {
  const supabase = getSupabase();
  const { data: assignments } = await supabase
    .from('daily_assignments')
    .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur, driver_id_retur, retur_route_id')
    .eq('assignment_date', tripDate);
  const rows = (assignments || []) as {
    crm_route_id: number; driver_id: string; vehicle_id: string | null;
    vehicle_id_retur: string | null; driver_id_retur: string | null; retur_route_id: number | null;
  }[];
  const driverIds = [...new Set(rows.flatMap((a) => [a.driver_id, a.driver_id_retur].filter(Boolean)))] as string[];
  const vehicleIds = [...new Set(rows.flatMap((a) => [a.vehicle_id, a.vehicle_id_retur].filter(Boolean)))] as string[];
  const routeIds = [...new Set(rows.flatMap((a) => [a.crm_route_id, a.retur_route_id].filter(Boolean)))] as number[];
  const [{ data: drivers }, { data: vehicles }, { data: routes }] = await Promise.all([
    driverIds.length ? supabase.from('drivers').select('id, full_name, phone').in('id', driverIds) : Promise.resolve({ data: [] }),
    vehicleIds.length ? supabase.from('vehicles').select('id, plate_number').in('id', vehicleIds) : Promise.resolve({ data: [] }),
    routeIds.length ? supabase.from('crm_routes').select('id, dest_to_ro, dest_to_ru, dest_from_ro, dest_from_ru, time_nord, time_chisinau, retur_ascuns').in('id', routeIds) : Promise.resolve({ data: [] }),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const driverMap = new Map(((drivers || []) as any[]).map((d) => [d.id, d]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vehicleMap = new Map(((vehicles || []) as any[]).map((v) => [v.id, v]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routeMap = new Map(((routes || []) as any[]).map((r) => [r.id, r]));

  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  // O singură citire a ceasului pe tot pasajul — nu câte una pe fiecare «picior».
  const nowMin = tripDate === today ? nowMinutes() : null;
  for (const a of rows) {
    const legs = [
      // Tur = Nord → Chișinău (pleacă după time_nord), retur = Chișinău → Nord.
      { driverId: a.driver_id, vehicleId: a.vehicle_id, routeId: a.crm_route_id, dir: 'tur' as const },
      { driverId: a.driver_id_retur ?? a.driver_id, vehicleId: a.vehicle_id_retur ?? a.vehicle_id, routeId: a.retur_route_id ?? a.crm_route_id, dir: 'retur' as const },
    ];
    for (const leg of legs) {
      const driver = driverMap.get(leg.driverId);
      const vehicle = leg.vehicleId ? vehicleMap.get(leg.vehicleId) : null;
      if (!driver?.phone) continue;
      const plateNorm = vehicle?.plate_number ? normPlate(vehicle.plate_number) : '';
      const nameNorm = normName(driver.full_name ?? '');
      // ȘI: criteriul transmis care nu se potrivește ELIMINĂ candidatul.
      if (plate.length >= MIN_PLATE && !plateNorm.includes(plate)) continue;
      if (driverName.length >= MIN_NAME && !nameNorm.includes(driverName)) continue;
      const key = `${leg.driverId}|${leg.vehicleId ?? ''}|${leg.dir}|${leg.routeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const route = routeMap.get(leg.routeId);
      // Plecarea din Chișinău ascunsă (migr. 284) nu se operează — nici aici
      // candidat (round 2 Minor 11, aceeași regulă ca în searchTrips).
      if (leg.dir === 'retur' && route?.retur_ascuns) continue;
      // dest_to_* = capătul de nord, dest_from_* = capătul de sud (trips-search).
      const depRaw = route ? parseTimeLabel(leg.dir === 'tur' ? route.time_nord || '' : route.time_chisinau || '') : '';
      const departure = /^\d{2}:\d{2}$/.test(depRaw) && depRaw !== '00:00' ? depRaw : null;
      const legMin = departure ? toMinutes(departure) : null;
      // Aceleași reguli ca pe calea A (delta-audit M3): ora spusă de client
      // filtrează fereastra ±75 min, iar pe AZI cursa care încă n-a plecat nu
      // e candidat — în ea nu s-a putut uita nimic. Ora necunoscută rămâne
      // candidat: mai bine un candidat în plus decât șoferul adevărat eliminat.
      if (depMin !== null && legMin !== null && Math.abs(legMin - depMin) > DEPARTURE_WINDOW_MIN) continue;
      if (nowMin !== null && legMin !== null && legMin > nowMin) continue;
      candidates.push({
        driver_id: leg.driverId ?? null,
        departure,
        route_ro: route ? (leg.dir === 'tur' ? `${route.dest_to_ro} – ${route.dest_from_ro}` : `${route.dest_from_ro} – ${route.dest_to_ro}`) : null,
        route_ru: route ? (leg.dir === 'tur' ? `${route.dest_to_ru} – ${route.dest_from_ru}` : `${route.dest_from_ru} – ${route.dest_to_ru}`) : null,
        driver: driver.full_name ?? null, phone: driver.phone ?? null,
        plate: vehicle?.plate_number ?? null,
      });
    }
  }
  // Ora exactă bate fereastra — aceeași regulă ca pe calea A (round 3 Minor 5).
  if (depMin !== null) {
    const exact = candidates.filter((c) => c.departure && toMinutes(c.departure) === depMin);
    if (exact.length === 1) return exact;
  }
  return candidates;
}

export interface IdentifyInput {
  from: string;
  to: string;
  date: string;
  departure: string;
  plate: string;
  driverName: string;
  today: string;
  /** Câte zile în urmă are voie să caute; implicit fereastra lucrurilor uitate. */
  maxDaysBack?: number;
}

// Motivele sunt separate fiindcă fiecare cere ALT lucru de la agent: ziua
// neînțeleasă se reîntreabă, cursa veche se închide, localitatea necunoscută se
// clarifică. Un singur «n-am găsit» ar șterge diferența.
export type IdentifyOutcome =
  | { kind: 'need_day' }
  | { kind: 'too_old'; tripDate: string }
  | { kind: 'unknown_locality'; tripDate: string; unknown: string[]; suggestions: Record<string, Suggestion[]> }
  | { kind: 'need_route'; tripDate: string }
  | { kind: 'candidates'; tripDate: string; candidates: Candidate[]; depMin: number | null };

export async function identifyTrip(input: IdentifyInput): Promise<IdentifyOutcome> {
  const { from, to, date, departure, plate, driverName, today } = input;
  const maxDaysBack = input.maxDaysBack ?? MAX_DAYS_BACK;
  const tripDate = resolveVoiceDatePast(date, today);
  // null = clientul a spus O zi, dar n-am înțeles-o. «Azi» tăcut aici ar găsi
  // cursa de azi a aceleiași linii și ar arăta alt șofer (audit H2).
  if (tripDate === null) return { kind: 'need_day' };
  const daysBack = Math.round((Date.parse(today) - Date.parse(tripDate)) / 86_400_000);
  if (daysBack > maxDaysBack) return { kind: 'too_old', tripDate };

  // Calea A — clientul știe ruta: aceleași curse ca la vânzare, dar cu cele
  // PLECATE vizibile (keepDeparted) — cursa căutată a plecat mereu.
  if (from && to) {
    const { values: [fromRo, toRo], unknown, suggestions } = await localitiesToRo([from, to]);
    if (unknown.length > 0) return { kind: 'unknown_locality', tripDate, unknown, suggestions };
    let trips = await searchTrips(fromRo as string, toRo as string, tripDate, { keepDeparted: true, skipLog: true });
    // Pe AZI doar cursele plecate: cursa care n-a plecat n-are ce reclamație
    // și n-are ce obiect uitat.
    if (tripDate === today) trips = trips.filter((t) => t.isDeparted);
    const depMin = toMinutes(departure);
    let matched = trips;
    if (depMin !== null) {
      matched = trips.filter((t) => {
        const m = toMinutes(t.time);
        return m !== null && Math.abs(m - depMin) <= DEPARTURE_WINDOW_MIN;
      });
      // Ora exactă bate fereastra: la «11:20» cu două curse în fereastră, cea de 11:20 e cursa.
      const exact = matched.filter((t) => toMinutes(t.time) === depMin);
      if (exact.length === 1) matched = exact;
    }
    if (plate.length >= MIN_PLATE) matched = matched.filter((t) => t.vehicle_plate && normPlate(t.vehicle_plate).includes(plate));
    if (driverName.length >= MIN_NAME) matched = matched.filter((t) => t.driver && normName(t.driver).includes(driverName));
    const candidates: Candidate[] = matched.map((t) => ({
      driver_id: t.driver_id ?? null,
      departure: t.time,
      route_ro: `${fromRo} – ${t.destination_ro}`,
      route_ru: `${fromRo} – ${t.destination_ru}`,
      driver: t.driver, phone: t.phone, plate: t.vehicle_plate,
    }));
    // Ruta n-a dat nimic, dar clientul știe mașina/șoferul? Nu-l lăsăm cu zero:
    // ruta putea fi ținută minte greșit, plăcuța nu (audit L3).
    if (candidates.length === 0 && (plate.length >= MIN_PLATE || driverName.length >= MIN_NAME)) {
      return { kind: 'candidates', tripDate, depMin, candidates: await searchByPlateOrDriver(tripDate, plate, driverName, depMin, today) };
    }
    return { kind: 'candidates', tripDate, candidates, depMin };
  }

  if (plate.length < MIN_PLATE && driverName.length < MIN_NAME) return { kind: 'need_route', tripDate };
  const depMinB = toMinutes(departure);
  return { kind: 'candidates', tripDate, depMin: depMinB, candidates: await searchByPlateOrDriver(tripDate, plate, driverName, depMinB, today) };
}

// Un șofer pe două curse (tur+retur) = UN singur om, nu doi candidați (audit L5):
// unicitatea se numără pe telefon, altfel candidatul legitim ar fi refuzat.
export function uniqueDrivers(candidates: Candidate[]): { withPhone: Candidate[]; uniquePhones: string[] } {
  const withPhone = candidates.filter((c) => c.phone);
  return { withPhone, uniquePhones: [...new Set(withPhone.map((c) => c.phone as string))] };
}
