import { NextRequest, NextResponse } from 'next/server';
import { cheieSiteValida } from '@/lib/bilete/site-auth';
import { confirmaAnulare, ofertaAnulare } from '@/lib/bilete/anulare-site';

// POST /api/bilete/anulare — anularea biletului de pe site (557): { cod, cifre, actiune: 'oferta' | 'confirma', suma }.
// Public în middleware (cale EXACTĂ), apărat prin BILETE_API_KEY; identificarea = codul biletului + 4 cifre.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!cheieSiteValida(req.headers.get('authorization'))) return NextResponse.json({ ok: false, eroare: 'neautorizat' }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, eroare: 'JSON nevalid' }, { status: 400 }); }
  try {
    if (b?.actiune === 'confirma') return NextResponse.json(await confirmaAnulare(b.cod, b.cifre, b.suma, b.sursa === 'asistent' ? 'asistent' : 'site'));
    return NextResponse.json(await ofertaAnulare(b?.cod, b?.cifre));
  } catch (e) {
    console.error('[bilete/anulare]', e);
    return NextResponse.json({ ok: false, cod: 'indisponibil' }, { status: 500 });
  }
}
