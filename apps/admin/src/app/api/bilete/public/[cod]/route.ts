import { NextRequest, NextResponse } from 'next/server';
import { BazaIndisponibilaError, biletPublicDinCitire, citesteComandaPagina, plafonPublic, ipPentruPlafon } from '@/lib/bilete/public';

// GET /api/bilete/public/<cod> — biletul pasagerului, cu codul din link ca secret (128 de biți). Public în
// middleware (prefix /api/bilete/public/, listat exhaustiv în public-paths.test.ts). Fără cache, fără referrer.
// Plafon pe IP (60/min, în bază); «nu există» = 404, «baza nu răspunde» = 503 (nu un 404 fals).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANTETE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

export async function GET(req: NextRequest, { params }: { params: Promise<{ cod: string }> }) {
  const { cod } = await params;
  if (!/^[0-9a-f]{32}$/i.test(cod)) return NextResponse.json({ ok: false }, { status: 404, headers: ANTETE });
  const ip = ipPentruPlafon(req.headers);
  // Plafonul și rândul comenzii deodată (Ion, 10.10.2026: «ultra fast»): citirea nu schimbă nimic, deci poate porni
  // înaintea verdictului; plafonul refuzat → tot 429, fără sincronizare cu maib și fără răspuns din rând.
  const [voie, citita] = await Promise.all([
    plafonPublic(ip),
    citesteComandaPagina(cod).catch((e: unknown) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } })),
  ]);
  if (!voie) return NextResponse.json({ ok: false, eroare: 'prea multe cereri' }, { status: 429, headers: ANTETE });
  try {
    // Comanda încă deschisă → un drum la maib (callback-ul poate întârzia); emite și biletele dacă plata e executată.
    const c = await biletPublicDinCitire(cod, citita);
    if (!c) return NextResponse.json({ ok: false }, { status: 404, headers: ANTETE });
    return NextResponse.json({ ok: true, comanda: c }, { headers: ANTETE });
  } catch (e) {
    if (e instanceof BazaIndisponibilaError) {
      console.error('[bilete/public] baza indisponibilă:', e.message);
      return NextResponse.json({ ok: false, eroare: 'temporar indisponibil' }, { status: 503, headers: { ...ANTETE, 'Retry-After': '5' } });
    }
    throw e;
  }
}
