import { NextRequest, NextResponse } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { searchTrips } from '@/lib/trips-search';
import { localitiesToRo, unknownLocalityResponse } from '@/lib/voice-locality';


// Телефон прописью — детерминированно на сервере: Haiku, переводя цифры в слова сам,
// перевирал номер (069241599 → «ноль шестьдесят восемь… тысяча пятьсот…»). Модель
// обязана читать phone_spoken_* дословно.
const RU_DIGITS = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const RO_DIGITS = ['zero', 'unu', 'doi', 'trei', 'patru', 'cinci', 'șase', 'șapte', 'opt', 'nouă'];
function spellPhone(raw: string, dict: string[]): string {
  const local = raw.replace(/\D/g, '').replace(/^373/, '0');
  const groups = local.length === 9 ? [local.slice(0, 3), local.slice(3, 6), local.slice(6)] : [local];
  return groups.map((g) => g.split('').map((d) => dict[+d]).join(' ')).join(', ');
}

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
      arrival: t.arrivalTime || null,
      price: t.price,
      original_price: t.originalPrice,
      driver: t.driver,
      phone: t.phone,
      phone_spoken_ru: t.phone ? spellPhone(String(t.phone), RU_DIGITS) : null,
      phone_spoken_ro: t.phone ? spellPhone(String(t.phone), RO_DIGITS) : null,
    })),
  });
}
