import { NextRequest, NextResponse } from 'next/server';
import { cheieBotValida } from '@/lib/bilete/bot-auth';
import { cereOferta } from '@/lib/bilete/retur-bot';

// POST /api/bilete/retur/oferta {telegram_id, cod, cifre?} — suma din grilă ca ofertă valabilă 15 min (ION-244).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!cheieBotValida(req.headers.get('authorization'))) return NextResponse.json({ ok: false, eroare: 'neautorizat' }, { status: 401 });
  const body = await req.json().catch(() => null) as { telegram_id?: unknown; cod?: unknown; cifre?: unknown } | null;
  try {
    return NextResponse.json(await cereOferta(body?.telegram_id, body?.cod, body?.cifre), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[bilete/retur/oferta]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, cod: 'indisponibil' }, { status: 500 });
  }
}
