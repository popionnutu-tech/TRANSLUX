import { NextRequest, NextResponse, after } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { searchTrips } from '@/lib/trips-search';
import { localitiesToRo, unknownLocalityResponse } from '@/lib/voice-locality';
import { logUnknownLocalities } from '@/lib/voice-unknown';
import { phoneSpoken } from '@/lib/phone-spoken';
import { timeSpoken } from '@/lib/time-spoken';
import { dateSpoken, resolveVoiceDate } from '@/lib/date-spoken';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { driverFirstName, driverFirstNameRu } from '@/lib/driver-name';
import type { TripResult } from '@/lib/trips-search';

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Cuvântul pe care modelul îl trimite în «date» ca să ajungă EXACT la ziua asta:
// «mâine»/«poimâine» când se poate, altfel zi.lună — ambele rezolvate de server
// (resolveVoiceDate). Ziua săptămânii nu: la exact 7 zile ar sări la săptămâna următoare.
function dateWord(iso: string, today: string): { ro: string; ru: string } {
  const diff = Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (diff === 1) return { ro: 'mâine', ru: 'завтра' };
  if (diff === 2) return { ro: 'poimâine', ru: 'послезавтра' };
  const dm = `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
  return { ro: dm, ru: dm };
}

const NEXT_DAY_HORIZON = 7;

// Ziua cerută n-are curse? Serverul caută SINGUR următoarea zi cu curse (până la 7
// zile) și o dă gata de citit. Apel 07.09, Chișinău→Bălți la 21:09: tool-ul a întors
// corect 0 curse pe azi, promptul cerea recăutarea pe «mâine», iar modelul a sărit
// peste tool și a inventat «patru și douăzeci» și «șase și jumătate» (prima cursă
// reală de a doua zi: 06:55). Un al doilea apel de tool e un pas pe care modelul îl
// poate sări; un câmp în răspuns nu. Sondările nu intră în search_log (skipLog).
async function nextDayWithTrips(fromRo: string, toRo: string, fromDate: string): Promise<{ date: string; trips: TripResult[] } | null> {
  for (let i = 1; i <= NEXT_DAY_HORIZON; i++) {
    const date = addDays(fromDate, i);
    const trips = await searchTrips(fromRo, toRo, date, { skipLog: true });
    if (trips.length > 0) return { date, trips };
  }
  return null;
}


export async function POST(req: NextRequest) {
  const authError = validateVoiceApiKey(req);
  if (authError) return authError;

  const body = await req.json();
  const { from, to, date, departure } = body as { from?: string; to?: string; date?: string; departure?: string };

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing "from" or "to" parameter' }, { status: 400 });
  }

  const today = chisinauTodayIso();
  // Ziua o hotărăște serverul din cuvântul rostit («mâine», «в субботу», «30.08»):
  // modelul nu știe ce zi e azi și un an inventat de el ar da 0 curse tăcut.
  const tripDate = resolveVoiceDate(date, today);
  // Ziua GATA de rostit: modelul a anunțat cursele de AZI drept «mâine» și apoi
  // le-a negat la «сегодня» (apel 24.08, Bălți→Ocnița).
  const label = dateSpoken(tripDate, today);
  // Fără etichetă nu trimitem câmpul deloc — promptul cere citire dosloven, iar o
  // dată brută citită dosloven e exact ce evită schema asta.
  const dateLabels = {
    is_today: tripDate === today,
    ...(label ? { date_label_ro: label.ro, date_label_ru: label.ru } : {}),
  };
  // Completat după căutare (unknown_locality iese mai devreme, fără listă).
  let truncation = { only_remaining_today: false };

  const { values: [fromRo, toRo], unknown, suggestions } = await localitiesToRo([from, to]);
  if (unknown.length > 0) {
    after(() => logUnknownLocalities('search-trips', unknown, suggestions));
    return NextResponse.json({ count: 0, date: tripDate, ...dateLabels, ...truncation, trips: [], ...unknownLocalityResponse(unknown, suggestions) });
  }
  // Lista de AZI e trunchiată de server (cursele plecate dispar). Le cerem marcate,
  // ca să putem SPUNE modelului că ziua a avut și curse mai devreme — altfel el
  // anunță drept «prima cursă a zilei» prima rămasă (apel 24.08, 17:30: «prima» = 18:10).
  const allTrips = await searchTrips(fromRo as string, toRo as string, tripDate, { keepDeparted: true });
  const departedCount = allTrips.filter((t) => t.isDeparted).length;
  let trips = allTrips.filter((t) => !t.isDeparted);
  // Один рейс по точному времени: агент ОБЯЗАН перезапросить так перед выдачей
  // водителя/номера — модель путала строки в длинном списке (24.08: «7:30» получил
  // водителя рейса 05:25). Одна строка = нечего перепутать.
  if (departure) {
    const norm = departure.trim().padStart(5, '0');
    trips = trips.filter((t) => t.time.padStart(5, '0') === norm);
  }

  // O singură cursă (recherea cu departure) => frază GATA de citit dosloven:
  // modelul nu mai asamblează nimic — numele și numărul nu se pot amesteca.
  const single = trips.length === 1 ? trips[0] : null;
  const firstName = driverFirstName(single?.driver);
  // Fraza rusească primește numele în chirilice: latina dintr-o frază rusească
  // e citită de TTS cu fonetică engleză («Vladimir» → «Влэдаймер»).
  const firstNameRu = driverFirstNameRu(single?.driver);
  // Cursa e în orar, dar șoferul nu e încă repartizat (graficul zilei următoare se
  // completează abia după-amiaza). Ion, 25.08: «dacă nu este șoferul, el trebuie să
  // spună că ruta va fi, dar datele șoferului mai târziu». Fraza vine gata, ca toate
  // celelalte — modelul n-are ce improviza.
  const awaitingLine = single?.isAwaitingDriver ? {
    driver_line_ro: `Cursa de ${timeSpoken(single.time)?.ro ?? single.time} circulă, dar șoferul nu e încă repartizat. Datele lui apar mai aproape de ziua plecării.`,
    driver_line_ru: `Рейс в ${timeSpoken(single.time)?.ru ?? single.time} будет, но водитель ещё не назначен. Его данные появятся ближе ко дню отправления.`,
  } : null;

  // Fără prenume real (inițiale/gol) — fraza dă DOAR numărul (Ion: nu se spune numele).
  const singleLine = awaitingLine ?? (single && phoneSpoken(single.phone) ? (firstName ? {
    driver_line_ro: `Șoferul cursei de ${timeSpoken(single.time)?.ro ?? single.time} este ${firstName}. Numărul lui: ${phoneSpoken(single.phone)?.ro}.`,
    driver_line_ru: `Водитель рейса ${timeSpoken(single.time)?.ru ?? single.time} — ${firstNameRu}. Его номер: ${phoneSpoken(single.phone)?.ru}.`,
  } : {
    driver_line_ro: `Numărul șoferului cursei de ${timeSpoken(single.time)?.ro ?? single.time}: ${phoneSpoken(single.phone)?.ro}.`,
    driver_line_ru: `Номер водителя рейса ${timeSpoken(single.time)?.ru ?? single.time}: ${phoneSpoken(single.phone)?.ru}.`,
  }) : {});

  // Enumerarea orelor GATA de citit, în ordine: «cea mai apropiată» = PRIMUL element.
  // Apel 24.08: modelul anunța «ближайший 07:10» deși prima cursă era 04:00.
  truncation = { only_remaining_today: departedCount > 0 };
  // Cursele din orar cărora încă nu li s-a repartizat șofer. Există DOAR pentru zile
  // viitoare: cursa se anunță, numărul șoferului nu.
  const asteaptaSofer = trips.filter((t) => t.isAwaitingDriver).length;

  const departures = {
    departures_ro: trips.map((t) => timeSpoken(t.time)?.ro ?? t.time).join(', '),
    departures_ru: trips.map((t) => timeSpoken(t.time)?.ru ?? t.time).join(', '),
  };

  const tripJson = (t: TripResult) => ({
    departure: t.time,
    // true = cursa circulă, dar șoferul nu e încă repartizat: NU cere numărul.
    awaiting_driver: !!t.isAwaitingDriver,
    departure_spoken_ro: timeSpoken(t.time)?.ro ?? null,
    departure_spoken_ru: timeSpoken(t.time)?.ru ?? null,
    // arrival_* scoase (Ion 28.08: doar ora plecării) — ce nu e în date nu se rostește.
    price: t.price,
    original_price: t.originalPrice,
    driver: t.driver,
    phone: t.phone,
    phone_spoken_ru: phoneSpoken(t.phone)?.ru ?? null,
    phone_spoken_ro: phoneSpoken(t.phone)?.ro ?? null,
  });

  // 0 curse pe ziua cerută (fără filtru de oră): următoarea zi cu curse + fraza gata
  // de citit. Cu «departure» lipsa înseamnă doar «nu e cursă la ora asta» — lista
  // zilei o are deja modelul din apelul anterior.
  let nextDay: Record<string, unknown> = {};
  if (trips.length === 0 && !departure) {
    const next = await nextDayWithTrips(fromRo as string, toRo as string, tripDate);
    const noTripsRo = tripDate === today
      ? `Azi nu ${departedCount > 0 ? 'mai ' : ''}sunt curse.`
      : `${cap(label?.ro ?? tripDate)}, nu sunt curse.`;
    const noTripsRu = tripDate === today
      ? `Сегодня рейсов ${departedCount > 0 ? 'больше ' : ''}нет.`
      : `${cap(label?.ru ?? tripDate)}, рейсов нет.`;
    if (next) {
      const nextLabel = dateSpoken(next.date, today);
      const word = dateWord(next.date, today);
      const spokenRo = next.trips.map((t) => timeSpoken(t.time)?.ro ?? t.time);
      const spokenRu = next.trips.map((t) => timeSpoken(t.time)?.ru ?? t.time);
      const firstRo = spokenRo.length === 1 ? `singura cursă e la ${spokenRo[0]}` : `prima cursă e la ${spokenRo[0]}, apoi la ${spokenRo[1]}`;
      const firstRu = spokenRu.length === 1 ? `единственный рейс в ${spokenRu[0]}` : `первый рейс в ${spokenRu[0]}, потом в ${spokenRu[1]}`;
      nextDay = {
        no_trips_line_ro: `${noTripsRo} Următoarea zi cu curse e ${nextLabel?.ro ?? next.date}: ${firstRo}.`,
        no_trips_line_ru: `${noTripsRu} Следующий день с рейсами — ${nextLabel?.ru ?? next.date}: ${firstRu}.`,
        next_day: {
          date: next.date,
          ...(nextLabel ? { date_label_ro: nextLabel.ro, date_label_ru: nextLabel.ru } : {}),
          // Cuvântul de trimis în «date» dacă clientul vrea șoferul unei curse din ziua asta.
          date_word_ro: word.ro,
          date_word_ru: word.ru,
          count: next.trips.length,
          trips_awaiting_driver: next.trips.filter((t) => t.isAwaitingDriver).length,
          departures_ro: spokenRo.join(', '),
          departures_ru: spokenRu.join(', '),
          trips: next.trips.map(tripJson),
        },
      };
    } else {
      nextDay = {
        no_trips_line_ro: `${noTripsRo} În următoarele șapte zile nu sunt curse pe această rută.`,
        no_trips_line_ru: `${noTripsRu} В ближайшие семь дней рейсов по этому маршруту нет.`,
        next_day: null,
      };
    }
  }

  return NextResponse.json({
    count: trips.length,
    date: tripDate,
    ...dateLabels,
    ...truncation,
    trips_awaiting_driver: asteaptaSofer,
    ...departures,
    ...singleLine,
    ...nextDay,
    trips: trips.map(tripJson),
  });
}
