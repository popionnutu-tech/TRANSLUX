import { NextRequest, NextResponse } from 'next/server';
import { ComandaError, cotaPret, statusPentru } from '@/lib/bilete/comenzi';
import { cheieSiteValida } from '@/lib/bilete/site-auth';

// POST /api/bilete/pret — cota de preț a site-ului pe Bălți ⇄ Chișinău (migr. 546): prețul cu reducerea cerută (cod de
// retur / jeton de student). Public în middleware (cale EXACTĂ), apărat prin BILETE_API_KEY; nu creează nimic.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!cheieSiteValida(req.headers.get('authorization'))) return NextResponse.json({ ok: false, eroare: 'neautorizat' }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, eroare: 'JSON nevalid' }, { status: 400 }); }
  if (!b || typeof b !== 'object') return NextResponse.json({ ok: false, eroare: 'corp lipsă' }, { status: 400 });
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
  const cod = s(b.codRetur, 64), jeton = s(b.studentJeton, 64);
  try {
    const r = await cotaPret({
      tripDate: s(b.tripDate, 10), crmRouteId: Number(b.crmRouteId), goingNorth: b.goingNorth === true,
      fromRo: s(b.fromRo, 80), toRo: s(b.toRo, 80), seats: Math.max(1, Math.min(8, Number(b.seats) || 1)),
      phone: s(b.phone, 32), passengerName: s(b.passengerName, 80),
      codRetur: /^[0-9a-f]{64}$/.test(cod) ? cod : (cod ? 'x' : null),
      studentJeton: /^[A-Za-z0-9_-]{20,64}$/.test(jeton) ? jeton : (jeton ? 'x' : null),
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ComandaError) return NextResponse.json({ ok: false, cod: e.cod, eroare: e.message }, { status: statusPentru(e) });
    console.error('[bilete/pret]', e);
    return NextResponse.json({ ok: false, eroare: 'eroare internă' }, { status: 500 });
  }
}
