import { NextRequest, NextResponse } from 'next/server';
import { BazaIndisponibilaError, biletPublic, plafonPublic, sincronizeazaComandaDupaCod } from '@/lib/bilete/public';

// GET /api/bilete/public/<cod> — biletul pasagerului, cu codul din link ca secret (128 de biți). Public în
// middleware (prefix /api/bilete/public/, listat exhaustiv în public-paths.test.ts). Fără cache, fără referrer.
// Plafon pe IP (60/min, în bază); «nu există» = 404, «baza nu răspunde» = 503 (nu un 404 fals).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANTETE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

export async function GET(req: NextRequest, { params }: { params: Promise<{ cod: string }> }) {
  const { cod } = await params;
  if (!/^[0-9a-f]{32}$/i.test(cod)) return NextResponse.json({ ok: false }, { status: 404, headers: ANTETE });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || null;
  if (!(await plafonPublic(ip))) return NextResponse.json({ ok: false, eroare: 'prea multe cereri' }, { status: 429, headers: ANTETE });
  try {
    // Comanda încă deschisă → un drum la maib (callback-ul poate întârzia); emite și biletele dacă plata e executată.
    await sincronizeazaComandaDupaCod(cod);
    const c = await biletPublic(cod);
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
