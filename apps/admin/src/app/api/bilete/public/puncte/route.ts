import { NextResponse, type NextRequest } from 'next/server';
import { puncteActive } from '@/lib/bilete/puncte';
import { catrePublic, puncteLocalitate } from '@/lib/bilete/puncte-reguli';

// GET /api/bilete/public/puncte?de=<name_ro> — punctele de urcare ale unei localități, cu perechile (rută, sens) pe
// care se oferă (ION-198). Date publice (locurile unde opresc autobuzele), fără cheie. Fără plafon pe IP: site-ul
// cere de pe server (IP-ul Vercel ar împărți găleata cu pagina biletului); răspunsul vine din memorie.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const de = req.nextUrl.searchParams.get('de') ?? '';
  if (!de.trim() || de.length > 80) return NextResponse.json({ ok: false, eroare: 'parametrul de lipsește sau e prea lung' }, { status: 400 });
  try {
    const puncte = puncteLocalitate(await puncteActive(), de).map(catrePublic);
    return NextResponse.json({ ok: true, puncte }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
  } catch (e) {
    console.error('[bilete/puncte]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, eroare: 'indisponibil' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
