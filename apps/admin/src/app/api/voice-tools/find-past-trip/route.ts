import { NextRequest, NextResponse, after } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { searchTrips } from '@/lib/trips-search';
import { getSupabase } from '@/lib/supabase';
import { localitiesToRo, unknownLocalityResponse } from '@/lib/voice-locality';
import { logUnknownLocalities } from '@/lib/voice-unknown';
import { phoneSpoken } from '@/lib/phone-spoken';
import { timeSpoken } from '@/lib/time-spoken';
import { dateSpoken, resolveVoiceDatePast } from '@/lib/date-spoken';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { driverFirstName, driverFirstNameRu } from '@/lib/driver-name';
import { parseTimeLabel } from '@/lib/assignments';
import { COMPANY_PHONE } from '@/lib/company-phone';

// Identificarea șoferului pentru LUCRURI UITATE (decizia lui Ion, 30.08: «rolul
// agentului împreună cu călătorul să identifice șoferul corect ca să ofere din
// baza de date numărul»). Tool SEPARAT de search_trips: acela vinde și ascunde
// intenționat cursele plecate (apel 24.08, «prima cursă» = 18:10); aici cursele
// plecate sunt exact ce căutăm. Datele se rezolvă ÎNAPOI (resolveVoiceDatePast).
// Fără scriere nicăieri — scopul e să dăm clientului datele, nu să căutăm obiectul.

const MAX_DAYS_BACK = 14;
// Clientul ține minte ora aproximativ («pe la cinci») — fereastra prinde cursa
// fără să înghită jumătate de orar.
const DEPARTURE_WINDOW_MIN = 75;
// 3 cifre de plăcuță = zeci de mașini + enumerare ieftină a registrului
// (security M3); 4 caractere restrâng real. Numele rămâne la 3.
const MIN_PLATE = 4;
const MIN_NAME = 3;

// Cel mai scump voice-tool (până la ~20 SELECT-uri pe apel) — limită pe
// instanță, același tipar ca proxy-ul voice-llm (security High 2). Un apel
// telefonic real cheamă tool-ul de 1-3 ori; 30/min taie doar abuzul.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
let rateWindowStart = Date.now();
let rateCount = 0;
function rateLimited(): boolean {
  const now = Date.now();
  if (now - rateWindowStart > RATE_WINDOW_MS) { rateWindowStart = now; rateCount = 0; }
  rateCount += 1;
  return rateCount > RATE_MAX;
}

// Numele câmpului e ACELAȘI în toate formele cu count=0 (audit M3): promptul cere
// «count = 0 → citește DOSLOVEN company_phone_line_*», deci câmpul trebuie să existe
// mereu — un câmp lipsă = improvizație de model, exact ce evită schema frazelor gata.
const companyLine = (ro: string, ru: string) => ({
  company_phone_line_ro: ro,
  company_phone_line_ru: ru,
});
const NOT_FOUND_LINE = companyLine(
  `Nu am putut identifica exact cursa. Vă rog să mai aflați detalii — ziua, ora plecării, numărul mașinii — și să ne sunați din nou la ${phoneSpoken(COMPANY_PHONE)?.ro}.`,
  `Не удалось точно определить рейс. Уточните детали — день, время отправления, номер машины — и перезвоните нам по ${phoneSpoken(COMPANY_PHONE)?.ru}.`,
);

const normPlate = (s: string) => s.toUpperCase().replace(/[^A-ZĂÂÎȘȚ0-9]/gu, '');
const normName = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function nowMinutes(): number {
  const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
  return Number(now.slice(0, 2)) * 60 + Number(now.slice(3, 5));
}

function toMinutes(t: string): number | null {
  // «11.20», «11 20» sau «11:20» — clientul le rostește la fel (audit L4).
  const m = t.trim().replace(/[.\s]+/, ':').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

type Candidate = {
  departure: string | null;
  route_ro: string | null;
  route_ru: string | null;
  driver: string | null;
  phone: string | null;
  plate: string | null;
};

// Fraza GATA de rostit — același tipar ca driver_line din search-trips: modelul
// nu asamblează nimic, deci nu poate amesteca nume și numere (incident 29.08:
// numărul șoferului ALTEI curse, dat unei cliente cu geanta uitată).
function singleLine(c: Candidate) {
  const spoken = phoneSpoken(c.phone);
  if (!spoken) return {};
  const firstName = driverFirstName(c.driver);
  const firstNameRu = driverFirstNameRu(c.driver);
  const oraRo = c.departure ? ` de ${timeSpoken(c.departure)?.ro ?? c.departure}` : '';
  const oraRu = c.departure ? ` ${timeSpoken(c.departure)?.ru ?? c.departure}` : '';
  return firstName ? {
    driver_line_ro: `Șoferul cursei${oraRo} este ${firstName}. Numărul lui: ${spoken.ro}. Sunați-l și spuneți-i ce ați uitat în mașină.`,
    driver_line_ru: `Водитель рейса${oraRu} — ${firstNameRu}. Его номер: ${spoken.ru}. Позвоните ему и скажите, что вы забыли в машине.`,
  } : {
    driver_line_ro: `Numărul șoferului cursei${oraRo}: ${spoken.ro}. Sunați-l și spuneți-i ce ați uitat în mașină.`,
    driver_line_ru: `Номер водителя рейса${oraRu}: ${spoken.ru}. Позвоните ему и скажите, что вы забыли в машине.`,
  };
}

function buildResponse(candidates: Candidate[], dateIso: string, today: string, depMin: number | null = null) {
  const label = dateSpoken(dateIso, today);
  const dateLabels = label ? { date_label_ro: label.ro, date_label_ru: label.ru } : {};
  const withPhone = candidates.filter((c) => phoneSpoken(c.phone));
  // Un șofer pe două curse (tur+retur) = UN singur om, nu doi candidați (audit L5):
  // count numără telefoane distincte, altfel numărul legitim ar fi refuzat.
  const uniquePhones = [...new Set(withPhone.map((c) => c.phone))];
  // Un telefon pe DOUĂ plecări (tur+retur): numărul e cert, ora nu. Clientul a
  // spus ora → plecarea cea mai apropiată de ea; altfel fraza merge fără oră —
  // ora celuilalt sens rostită dosloven = spoken_time_mismatch la controlor
  // (delta-audit M2, round 2 Important 4).
  const closestByTime = (list: Candidate[]) => {
    if (depMin === null) return null;
    let best: Candidate | null = null;
    let bestDiff = Infinity;
    for (const c of list) {
      const m = c.departure ? toMinutes(c.departure) : null;
      if (m === null) continue;
      const diff = Math.abs(m - depMin);
      if (diff < bestDiff) { best = c; bestDiff = diff; }
    }
    return best;
  };
  const single = uniquePhones.length === 1
    ? (withPhone.length === 1 ? withPhone[0] : closestByTime(withPhone) ?? { ...withPhone[0], departure: null })
    : null;
  return NextResponse.json({
    count: uniquePhones.length,
    date: dateIso,
    ...dateLabels,
    // Fraza companiei DOAR la zero: la count>1 promptul cere enumerarea candidaților,
    // iar un câmp «nu am putut identifica» prezent ar fi citit dosloven (audit M1).
    ...(single ? singleLine(single) : uniquePhones.length === 0 ? NOT_FOUND_LINE : {}),
    candidates: withPhone.slice(0, 6).map((c) => ({
      departure: c.departure,
      departure_spoken_ro: c.departure ? timeSpoken(c.departure)?.ro ?? null : null,
      departure_spoken_ru: c.departure ? timeSpoken(c.departure)?.ru ?? null : null,
      route_ro: c.route_ro,
      route_ru: c.route_ru,
      // Prenumele și coada plăcuței ajung pentru ALEGERE; ФИО întreg + numărul
      // întreg ar face din listă un registru enumerabil (security M3).
      driver: driverFirstName(c.driver) ?? null,
      plate: c.plate ? '…' + normPlate(c.plate).slice(-3) : null,
      // Numărul apare DOAR când șoferul e unic — la mai mulți, clientul întâi
      // alege, apoi agentul recheamă tool-ul cu detaliul care îl face unic.
      ...(single ? { phone: single.phone } : {}),
    })),
  });
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

export async function POST(req: NextRequest) {
  const authError = validateVoiceApiKey(req);
  if (authError) return authError;
  if (rateLimited()) return NextResponse.json({ error: 'rate limited' }, { status: 429 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* body opțional */ }
  const from = typeof body.from === 'string' ? body.from : '';
  const to = typeof body.to === 'string' ? body.to : '';
  const date = typeof body.date === 'string' ? body.date : '';
  const departure = typeof body.departure === 'string' ? body.departure : '';
  const plate = typeof body.plate === 'string' ? normPlate(body.plate) : '';
  const driverName = typeof body.driver_name === 'string' ? normName(body.driver_name) : '';

  const today = chisinauTodayIso();
  const tripDate = resolveVoiceDatePast(date, today);
  // null = clientul a spus O zi, dar n-am înțeles-o. «Azi» tăcut aici ar găsi
  // cursa de azi a aceleiași linii și ar dicta numărul altui șofer (audit H2).
  // Formele need_more NU poartă count și NICI fraza companiei (round 2 Critical:
  // «count=0 → citește company_phone_line» ar închide apelul în loc de întrebare).
  if (tripDate === null) {
    return NextResponse.json({
      need_more: true,
      result_ro: 'Nu am înțeles ziua. Întreabă clientul: azi, ieri, alaltăieri sau ce dată?',
      result_ru: 'День не понят. Спроси клиента: сегодня, вчера, позавчера или какое число?',
    });
  }
  const daysBack = Math.round((Date.parse(today) - Date.parse(tripDate)) / 86_400_000);
  if (daysBack > MAX_DAYS_BACK) {
    return NextResponse.json({
      count: 0, date: tripDate, too_old: true,
      ...companyLine(
        `Cursa e mai veche de ${MAX_DAYS_BACK} zile — nu mai pot identifica șoferul. Sunați compania la ${phoneSpoken(COMPANY_PHONE)?.ro}.`,
        `Рейс старше ${MAX_DAYS_BACK} дней — водителя уже не определить. Позвоните в компанию по ${phoneSpoken(COMPANY_PHONE)?.ru}.`,
      ),
    });
  }

  // Calea A — clientul știe ruta: aceleași curse ca la vânzare, dar cu cele
  // PLECATE vizibile (keepDeparted) — cursa cu obiectul uitat a plecat mereu.
  if (from && to) {
    const { values: [fromRo, toRo], unknown, suggestions } = await localitiesToRo([from, to]);
    if (unknown.length > 0) {
      after(() => logUnknownLocalities('find-past-trip', unknown, suggestions));
      // FĂRĂ fraza companiei aici (delta-audit M4): unknown_locality poartă
      // propriul mesaj «întreabă clientul care localitate» — două ordine
      // doslovene contradictorii ar închide apelul în loc să-l clarifice.
      return NextResponse.json({ count: 0, date: tripDate, candidates: [], ...unknownLocalityResponse(unknown, suggestions) });
    }
    let trips = await searchTrips(fromRo as string, toRo as string, tripDate, { keepDeparted: true, skipLog: true });
    // Pe AZI doar cursele plecate: într-o cursă care n-a plecat încă nu s-a putut uita nimic.
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
      departure: t.time,
      route_ro: `${fromRo} – ${t.destination_ro}`,
      route_ru: `${fromRo} – ${t.destination_ru}`,
      driver: t.driver, phone: t.phone, plate: t.vehicle_plate,
    }));
    // Ruta n-a dat nimic, dar clientul știe mașina/șoferul? Nu-l lăsăm cu zero:
    // ruta putea fi ținută minte greșit, plăcuța nu (audit L3).
    if (candidates.length === 0 && (plate.length >= MIN_PLATE || driverName.length >= MIN_NAME)) {
      return buildResponse(await searchByPlateOrDriver(tripDate, plate, driverName, depMin, today), tripDate, today, depMin);
    }
    return buildResponse(candidates, tripDate, today, depMin);
  }

  if (plate.length < MIN_PLATE && driverName.length < MIN_NAME) {
    return NextResponse.json({
      date: tripDate, need_more: true,
      result_ro: 'Pentru căutare am nevoie de rută (de unde și până unde), sau de numărul mașinii, sau de numele șoferului.',
      result_ru: 'Для поиска нужен маршрут (откуда и куда), или номер машины, или имя водителя.',
    });
  }
  const depMinB = toMinutes(departure);
  return buildResponse(await searchByPlateOrDriver(tripDate, plate, driverName, depMinB, today), tripDate, today, depMinB);
}
