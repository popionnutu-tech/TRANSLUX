import { NextRequest, NextResponse } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { getActiveOffers } from '@/app/(public)/actions';

export async function POST(req: NextRequest) {
  const authError = validateVoiceApiKey(req);
  if (authError) return authError;

  const offers = await getActiveOffers();

  return NextResponse.json({
    count: offers.length,
    offers: offers.map(o => ({
      from: o.from_locality,
      to: o.to_locality,
      price: o.offer_price,
      original_price: o.original_price,
      currency: 'MDL',
    })),
  });
}
