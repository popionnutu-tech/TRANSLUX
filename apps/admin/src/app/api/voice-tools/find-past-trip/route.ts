import { NextRequest, NextResponse, after } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { unknownLocalityResponse } from '@/lib/voice-locality';
import { logUnknownLocalities } from '@/lib/voice-unknown';
import { phoneSpoken } from '@/lib/phone-spoken';
import { timeSpoken } from '@/lib/time-spoken';
import { dateSpoken } from '@/lib/date-spoken';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { driverFirstName, driverFirstNameRu } from '@/lib/driver-name';
import { COMPANY_PHONE } from '@/lib/company-phone';
import {
  identifyTrip, normPlate, normName, toMinutes, uniqueDrivers,
  MAX_DAYS_BACK, type Candidate,
} from '@/lib/voice/trip-identify';

// Identificarea șoferului pentru LUCRURI UITATE (decizia lui Ion, 30.08: «rolul
// agentului împreună cu călătorul să identifice șoferul corect ca să ofere din
// baza de date numărul»). Tool SEPARAT de search_trips: acela vinde și ascunde
// intenționat cursele plecate (apel 24.08, «prima cursă» = 18:10); aici cursele
// plecate sunt exact ce căutăm. Datele se rezolvă ÎNAPOI (resolveVoiceDatePast).
// Fără scriere nicăieri — scopul e să dăm clientului datele, nu să căutăm obiectul.
// Căutarea propriu-zisă stă în lib/voice/trip-identify.ts (mutată acolo 01.09,
// fără schimbare de comportament): reclamațiile folosesc aceeași identificare,
// dar NU dau numărul șoferului clientului.

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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  // Un șofer pe două curse (tur+retur) = UN singur om, nu doi candidați (audit L5):
  // count numără telefoane distincte, altfel numărul legitim ar fi refuzat.
  const { withPhone, uniquePhones } = uniqueDrivers(candidates.filter((c) => phoneSpoken(c.phone)));
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
  const outcome = await identifyTrip({ from, to, date, departure, plate, driverName, today });

  switch (outcome.kind) {
    // Formele need_more NU poartă count și NICI fraza companiei (round 2 Critical:
    // «count=0 → citește company_phone_line» ar închide apelul în loc de întrebare).
    case 'need_day':
      return NextResponse.json({
        need_more: true,
        result_ro: 'Nu am înțeles ziua. Întreabă clientul: azi, ieri, alaltăieri sau ce dată?',
        result_ru: 'День не понят. Спроси клиента: сегодня, вчера, позавчера или какое число?',
      });
    case 'too_old':
      return NextResponse.json({
        count: 0, date: outcome.tripDate, too_old: true,
        ...companyLine(
          `Cursa e mai veche de ${MAX_DAYS_BACK} zile — nu mai pot identifica șoferul. Sunați compania la ${phoneSpoken(COMPANY_PHONE)?.ro}.`,
          `Рейс старше ${MAX_DAYS_BACK} дней — водителя уже не определить. Позвоните в компанию по ${phoneSpoken(COMPANY_PHONE)?.ru}.`,
        ),
      });
    // FĂRĂ fraza companiei aici (delta-audit M4): unknown_locality poartă
    // propriul mesaj «întreabă clientul care localitate» — două ordine
    // doslovene contradictorii ar închide apelul în loc să-l clarifice.
    case 'unknown_locality':
      after(() => logUnknownLocalities('find-past-trip', outcome.unknown, outcome.suggestions));
      return NextResponse.json({
        count: 0, date: outcome.tripDate, candidates: [],
        ...unknownLocalityResponse(outcome.unknown, outcome.suggestions),
      });
    case 'need_route':
      return NextResponse.json({
        date: outcome.tripDate, need_more: true,
        result_ro: 'Pentru căutare am nevoie de rută (de unde și până unde), sau de numărul mașinii, sau de numele șoferului.',
        result_ru: 'Для поиска нужен маршрут (откуда и куда), или номер машины, или имя водителя.',
      });
    default:
      return buildResponse(outcome.candidates, outcome.tripDate, today, outcome.depMin);
  }
}
