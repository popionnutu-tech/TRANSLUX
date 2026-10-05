import { NextRequest, NextResponse } from 'next/server';
import { cheieBotValida } from '@/lib/bilete/bot-auth';
import { bileteleMele } from '@/lib/bilete/retur-bot';

// POST /api/bilete/retur/bilete {telegram_id} — biletele active legate de contul Telegram (ION-244, doar botul).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!cheieBotValida(req.headers.get('authorization'))) return NextResponse.json({ ok: false, eroare: 'neautorizat' }, { status: 401 });
  const body = await req.json().catch(() => null) as { telegram_id?: unknown } | null;
  try {
    return NextResponse.json({ ok: true, bilete: await bileteleMele(body?.telegram_id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[bilete/retur/bilete]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, eroare: 'eroare internă' }, { status: 500 });
  }
}
