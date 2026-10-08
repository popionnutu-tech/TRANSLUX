import { NextRequest, NextResponse } from 'next/server';
import { autentificaSofer } from '@/lib/bilete/sofer-auth';
import { raspunsAzi } from '@/lib/bilete/sofer';

// GET /api/bilete-sofer/azi — cursele de azi ale șoferului cu pasagerii și biletele lor (ION-239, contractul ION-190
// pașii 7–8). Public în middleware (prefix /api/bilete-sofer/, listat în public-paths.test.ts); se apără singur prin
// antetul X-Telegram-Init-Data (HMAC + drivers.telegram_id). Fără cache: date personale (telefoanele pasagerilor).
// Plafon pe telegram_id: 60/min, în bază.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const ANTETE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

export async function GET(req: NextRequest) {
  // ION-273: identitatea și plafonul într-un singur hop (în paralel).
  const auth = await autentificaSofer(req.headers.get('x-telegram-init-data'));
  if (!auth.ok) return NextResponse.json({ eroare: auth.eroare }, { status: auth.status, headers: ANTETE });
  try {
    const r = await raspunsAzi({ id: auth.sofer.id, nume: auth.sofer.nume, is_test: auth.sofer.is_test });
    return NextResponse.json(r, { headers: ANTETE });
  } catch (e) {
    console.error('[bilete-sofer/azi]', e instanceof Error ? e.message : e);
    return NextResponse.json({ eroare: 'temporar indisponibil' }, { status: 503, headers: { ...ANTETE, 'Retry-After': '5' } });
  }
}
