import { NextRequest, NextResponse } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { searchTrips } from '@/lib/trips-search';
import { localitiesToRo, unknownLocalityResponse } from '@/lib/voice-locality';
import { phoneSpoken } from '@/lib/phone-spoken';
import { timeSpoken } from '@/lib/time-spoken';


export async function POST(req: NextRequest) {
  const authError = validateVoiceApiKey(req);
  if (authError) return authError;

  const body = await req.json();
  const { from, to, date, departure } = body as { from?: string; to?: string; date?: string; departure?: string };

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing "from" or "to" parameter' }, { status: 400 });
  }

  const tripDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });

  const { values: [fromRo, toRo], unknown } = await localitiesToRo([from, to]);
  if (unknown.length > 0) {
    return NextResponse.json({ count: 0, date: tripDate, trips: [], ...unknownLocalityResponse(unknown) });
  }
  let trips = await searchTrips(fromRo as string, toRo as string, tripDate);
  // Один рейс по точному времени: агент ОБЯЗАН перезапросить так перед выдачей
  // водителя/номера — модель путала строки в длинном списке (24.08: «7:30» получил
  // водителя рейса 05:25). Одна строка = нечего перепутать.
  if (departure) {
    const norm = departure.trim().padStart(5, '0');
    trips = trips.filter((t) => t.time.padStart(5, '0') === norm);
  }

  // O singură cursă (recherea cu departure) => frază GATA de citit dosloven:
  // modelul nu mai asamblează nimic — numele și numărul nu se pot amesteca.
  // Doar prenumele (Ion, 24.08): formatul din DB e «Nume Prenume» → ultimul cuvânt.
  const single = trips.length === 1 ? trips[0] : null;
  const firstName = single ? single.driver.trim().split(/\s+/).pop() : null;
  const singleLine = single && phoneSpoken(single.phone) ? {
    driver_line_ro: `Șoferul cursei de ${timeSpoken(single.time)?.ro ?? single.time} este ${firstName}. Numărul lui: ${phoneSpoken(single.phone)?.ro}.`,
    driver_line_ru: `Водитель рейса ${timeSpoken(single.time)?.ru ?? single.time} — ${firstName}. Его номер: ${phoneSpoken(single.phone)?.ru}.`,
  } : {};

  // Enumerarea orelor GATA de citit, în ordine: «cea mai apropiată» = PRIMUL element.
  // Apel 24.08: modelul anunța «ближайший 07:10» deși prima cursă era 04:00.
  const departures = {
    departures_ro: trips.map((t) => timeSpoken(t.time)?.ro ?? t.time).join(', '),
    departures_ru: trips.map((t) => timeSpoken(t.time)?.ru ?? t.time).join(', '),
  };

  return NextResponse.json({
    count: trips.length,
    date: tripDate,
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
