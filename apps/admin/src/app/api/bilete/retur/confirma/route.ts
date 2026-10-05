import { NextRequest, NextResponse } from 'next/server';
import { cheieBotValida } from '@/lib/bilete/bot-auth';
import { confirmaOferta } from '@/lib/bilete/retur-bot';

// POST /api/bilete/retur/confirma {telegram_id, oferta_id} — consumă oferta și pornește returnarea (ION-244).
// Banca poate răspunde încet: bugetul ca la comandă; botul nu retrimite, citește /stare.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!cheieBotValida(req.headers.get('authorization'))) return NextResponse.json({ ok: false, eroare: 'neautorizat' }, { status: 401 });
  const body = await req.json().catch(() => null) as { telegram_id?: unknown; oferta_id?: unknown } | null;
  try {
    return NextResponse.json(await confirmaOferta(body?.telegram_id, body?.oferta_id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[bilete/retur/confirma]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, eroare: 'eroare internă' }, { status: 500 });
  }
}
