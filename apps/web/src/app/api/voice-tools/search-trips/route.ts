import { NextRequest, NextResponse } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { searchTrips } from '@/app/(public)/actions';

export async function POST(req: NextRequest) {
  const authError = validateVoiceApiKey(req);
  if (authError) return authError;

  const body = await req.json();
  const { from, to, date } = body as { from?: string; to?: string; date?: string };

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing "from" or "to" parameter' }, { status: 400 });
  }

  const tripDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });

  const trips = await searchTrips(from, to, tripDate);

  return NextResponse.json({
    count: trips.length,
    date: tripDate,
    trips: trips.map(t => ({
      departure: t.time,
      arrival: t.arrivalTime || null,
      price: t.price,
      original_price: t.originalPrice,
      driver: t.driver,
      phone: t.phone,
    })),
  });
}
