import { NextRequest, NextResponse } from 'next/server';
import { cheieBotValida } from '@/lib/bilete/bot-auth';
import { stareOferta } from '@/lib/bilete/retur-bot';

// GET /api/bilete/retur/stare?oferta_id=&telegram_id= — starea reală a returnării (ION-244, tabelul 16′/16″).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!cheieBotValida(req.headers.get('authorization'))) return NextResponse.json({ ok: false, eroare: 'neautorizat' }, { status: 401 });
  const q = req.nextUrl.searchParams;
  try {
    return NextResponse.json(await stareOferta(q.get('telegram_id'), q.get('oferta_id')), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[bilete/retur/stare]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, eroare: 'eroare internă' }, { status: 500 });
  }
}
