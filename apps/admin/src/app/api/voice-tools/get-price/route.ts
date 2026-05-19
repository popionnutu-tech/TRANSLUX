import { NextRequest, NextResponse } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { getSupabase } from '@/lib/supabase';

function normalizeStop(name: string): string {
  let n = name.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  n = n.replace(/\s*translux$/i, '');
  n = n.replace(/\s+ga$/i, '');
  n = n.replace(/\(sat\)$/i, '');
  n = n.replace(/^ret\s+/i, '');
  n = n.replace(/^sl\.\s*/i, 'slobozia ');
  n = n.replace(/^-\//, '');
  n = n.replace(/\/-$/, '');

  const aliases: Record<string, string> = {
    'coteala': 'cotelea',
    'hlinaia': 'hlina',
    'criva vama': 'criva',
    'gordinestii noi': 'gordinesti',
    'intersectia tabani': 'tabani',
    'intersectia trestieni': 'halahora de sus',
    'intersectia riscani': 'riscani',
    'petrom riscani': 'riscani',
    'beleavinti': 'larga',
    'beleavinti/larga': 'larga',
    'berlinti/cotiujeni': 'cotiujeni',
    'caracusenii noi/-': 'caracusenii noi',
  };

  n = n.trim();
  return aliases[n] || n;
}

export async function POST(req: NextRequest) {
  const authError = validateVoiceApiKey(req);
  if (authError) return authError;

  const body = await req.json();
  const { from, to } = body as { from?: string; to?: string };

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing "from" or "to" parameter' }, { status: 400 });
  }

  const fromNorm = normalizeStop(from).replace(/[(),."'\\]/g, '');
  const toNorm = normalizeStop(to).replace(/[(),."'\\]/g, '');

  const supabase = getSupabase();

  // Check for active offers first
  const { data: offers } = await supabase
    .from('offers')
    .select('original_price, offer_price')
    .eq('active', true)
    .ilike('from_locality', from)
    .ilike('to_locality', to);

  // Get km from interurban_v2 view; preț = km × rate (suburban dacă ambele
  // opriri în raionul de start al rutei, altfel interurban lung)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const { data: period } = await supabase
    .from('tariff_periods')
    .select('rate_interurban_long, rate_suburban')
    .lte('period_start', today)
    .gte('period_end', today)
    .order('period_start', { ascending: false })
    .limit(1)
    .single();
  const rateLong = period ? Number(period.rate_interurban_long) : null;
  const rateSub = period ? Number(period.rate_suburban) : null;

  const [{ data: kmPairsA }, { data: kmPairsB }] = await Promise.all([
    supabase.from('v_interurban_v2_km_pairs').select('km, from_district, to_district, start_district').eq('from_stop', fromNorm).eq('to_stop', toNorm).order('km', { ascending: true }).limit(1),
    supabase.from('v_interurban_v2_km_pairs').select('km, from_district, to_district, start_district').eq('from_stop', toNorm).eq('to_stop', fromNorm).order('km', { ascending: true }).limit(1),
  ]);
  const kmPairs = [...(kmPairsA || []), ...(kmPairsB || [])];

  const kmRow = kmPairs && kmPairs.length > 0 ? (kmPairs[0] as any) : null;
  const kmVal = kmRow ? Number(kmRow.km) : 0;
  let basePrice: number | null = null;
  if (rateLong && rateSub && kmVal > 0 && kmVal < 1000) {
    const inDistrict = kmRow.start_district
      && kmRow.from_district === kmRow.start_district
      && kmRow.to_district === kmRow.start_district;
    basePrice = Math.round(kmVal * (inDistrict ? rateSub : rateLong));
  }
  const offer = offers && offers.length > 0 ? offers[0] as any : null;

  if (!basePrice && !offer) {
    return NextResponse.json({
      found: false,
      message: `Nu am găsit prețul pentru ruta ${from} — ${to}`,
    });
  }

  return NextResponse.json({
    found: true,
    from,
    to,
    price: offer ? offer.offer_price : basePrice,
    original_price: offer ? basePrice || offer.original_price : null,
    has_offer: !!offer,
    currency: 'MDL',
  });
}
