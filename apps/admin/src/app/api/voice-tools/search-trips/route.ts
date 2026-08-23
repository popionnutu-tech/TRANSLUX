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
  const { from, to, date } = body as { from?: string; to?: string; date?: string };

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing "from" or "to" parameter' }, { status: 400 });
  }

  const tripDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });

  const { values: [fromRo, toRo], unknown } = await localitiesToRo([from, to]);
  if (unknown.length > 0) {
    return NextResponse.json({ count: 0, date: tripDate, trips: [], ...unknownLocalityResponse(unknown) });
  }
  const trips = await searchTrips(fromRo as string, toRo as string, tripDate);

  return NextResponse.json({
    count: trips.length,
    date: tripDate,
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
