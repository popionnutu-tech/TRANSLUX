import { NextRequest, NextResponse } from 'next/server';
import { BazaIndisponibilaError, biletPublic, plafonPublic, ipPentruPlafon } from '@/lib/bilete/public';
import { imagineBilet } from '@/lib/bilete/bilet-imagine';
import { cheieImagine, creeazaCacheImagini } from '@/lib/bilete/cache-imagini';

// ION-276 (P11): poza desenată o dată se ține pe instanță (cheia: cod, loc, starea locului, ziua Chișinăului).
const imagini = creeazaCacheImagini();

// GET /api/bilete/public/<cod>/imagine?nr=N — imaginea PNG a biletului (cardul de pe site, ION-248), pentru chatul
// Telegram. Același secret ca pagina biletului (codul din link), același plafon pe IP; doar comandă plătită, loc valabil.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANTETE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

export async function GET(req: NextRequest, { params }: { params: Promise<{ cod: string }> }) {
  const { cod } = await params;
  const nr = Number(req.nextUrl.searchParams.get('nr') ?? '1');
  if (!/^[0-9a-f]{32}$/i.test(cod) || !Number.isInteger(nr) || nr < 1 || nr > 10) return NextResponse.json({ ok: false }, { status: 404, headers: ANTETE });
  const ip = ipPentruPlafon(req.headers);
  if (!(await plafonPublic(ip))) return NextResponse.json({ ok: false, eroare: 'prea multe cereri' }, { status: 429, headers: ANTETE });
  try {
    const c = await biletPublic(cod);
    const loc = c?.bilete.find((b) => b.nr === nr);
    const cheie = c && loc && c.status === 'platita' ? cheieImagine(cod, nr, loc.status, Date.now()) : null;
    let png = cheie ? imagini.get(cheie) : null;
    if (!png) {
      png = c ? await imagineBilet(c, nr) : null;
      if (png && cheie) imagini.set(cheie, png);
    }
    if (!png) return NextResponse.json({ ok: false }, { status: 404, headers: ANTETE });
    return new NextResponse(new Uint8Array(png), { headers: { ...ANTETE, 'Content-Type': 'image/png' } });
  } catch (e) {
    if (e instanceof BazaIndisponibilaError) return NextResponse.json({ ok: false }, { status: 503, headers: { ...ANTETE, 'Retry-After': '5' } });
    throw e;
  }
}
