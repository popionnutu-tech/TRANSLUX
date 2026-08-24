import { NextRequest, NextResponse } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { searchTrips } from '@/lib/trips-search';
import { localitiesToRo, unknownLocalityResponse } from '@/lib/voice-locality';
import { phoneSpoken } from '@/lib/phone-spoken';
import { timeSpoken } from '@/lib/time-spoken';
import { dateSpoken, resolveVoiceDate } from '@/lib/date-spoken';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { driverFirstName, driverFirstNameRu } from '@/lib/driver-name';


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
  // Fără prenume real (inițiale/gol) — fraza dă DOAR numărul (Ion: nu se spune numele).
  const singleLine = single && phoneSpoken(single.phone) ? (firstName ? {
    driver_line_ro: `Șoferul cursei de ${timeSpoken(single.time)?.ro ?? single.time} este ${firstName}. Numărul lui: ${phoneSpoken(single.phone)?.ro}.`,
    driver_line_ru: `Водитель рейса ${timeSpoken(single.time)?.ru ?? single.time} — ${firstNameRu}. Его номер: ${phoneSpoken(single.phone)?.ru}.`,
  } : {
    driver_line_ro: `Numărul șoferului cursei de ${timeSpoken(single.time)?.ro ?? single.time}: ${phoneSpoken(single.phone)?.ro}.`,
    driver_line_ru: `Номер водителя рейса ${timeSpoken(single.time)?.ru ?? single.time}: ${phoneSpoken(single.phone)?.ru}.`,
  }) : {};

  // Enumerarea orelor GATA de citit, în ordine: «cea mai apropiată» = PRIMUL element.
  // Apel 24.08: modelul anunța «ближайший 07:10» deși prima cursă era 04:00.
  truncation = { only_remaining_today: departedCount > 0 };

  const departures = {
    departures_ro: trips.map((t) => timeSpoken(t.time)?.ro ?? t.time).join(', '),
    departures_ru: trips.map((t) => timeSpoken(t.time)?.ru ?? t.time).join(', '),
  };

  return NextResponse.json({
    count: trips.length,
    date: tripDate,
    ...dateLabels,
    ...truncation,
    ...departures,
    ...singleLine,
    trips: trips.map(t => ({
      departure: t.time,
      departure_spoken_ro: timeSpoken(t.time)?.ro ?? null,
      departure_spoken_ru: timeSpoken(t.time)?.ru ?? null,
      arrival: t.arrivalTime || null,
      arrival_spoken_ro: timeSpoken(t.arrivalTime)?.ro ?? null,
      arrival_spoken_ru: timeSpoken(t.arrivalTime)?.ru ?? null,
      price: t.price,
      original_price: t.originalPrice,
      driver: t.driver,
      phone: t.phone,
      phone_spoken_ru: phoneSpoken(t.phone)?.ru ?? null,
      phone_spoken_ro: phoneSpoken(t.phone)?.ro ?? null,
    })),
  });
}
