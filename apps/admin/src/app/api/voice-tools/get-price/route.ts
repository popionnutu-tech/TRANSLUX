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

  // Get km from interurban_v2 view (calculează preț = km × rate curent)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const { data: period } = await supabase
    .from('tariff_periods')
    .select('rate_interurban_long')
    .lte('period_start', today)
    .gte('period_end', today)
    .order('period_start', { ascending: false })
    .limit(1)
    .single();
  const rate = period ? Number(period.rate_interurban_long) : null;

  const [{ data: kmPairsA }, { data: kmPairsB }] = await Promise.all([
    supabase.from('v_interurban_v2_km_pairs').select('km').eq('from_stop', fromNorm).eq('to_stop', toNorm).order('km', { ascending: true }).limit(1),
    supabase.from('v_interurban_v2_km_pairs').select('km').eq('from_stop', toNorm).eq('to_stop', fromNorm).order('km', { ascending: true }).limit(1),
  ]);
  const kmPairs = [...(kmPairsA || []), ...(kmPairsB || [])];

  const kmVal = kmPairs && kmPairs.length > 0 ? Number((kmPairs[0] as any).km) : 0;
  const basePrice = (rate && kmVal > 0 && kmVal < 1000) ? Math.round(kmVal * rate) : null;
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
