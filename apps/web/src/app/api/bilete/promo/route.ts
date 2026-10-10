import { NextResponse } from 'next/server';
import { configBilete } from '@/lib/bilete-api';

// GET /api/bilete/promo — procentul reducerii la retur (546 `bilete_promo_pct`) pentru prețul arătat în tur-retur, citit
// din browser în locul acțiunii procentRetur (Ion, 10.10.2026: «vezi cum de făcut ultra fast toată procedura»; acțiunile
// de server merg la coadă). Prețul e doar informativ — suma o recalculează panoul la comandă. 60 s în cache-ul
// browserului, cât ține și configurația în memoria serverului.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const c = await configBilete();
  const pct = c.promo?.activ ? Number(c.promo.pct) || 20 : 0;
  return NextResponse.json({ pct }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
