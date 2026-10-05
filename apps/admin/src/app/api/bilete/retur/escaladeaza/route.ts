import { NextRequest, NextResponse } from 'next/server';
import { cheieBotValida } from '@/lib/bilete/bot-auth';
import { escaladeaza } from '@/lib/bilete/retur-bot';

// POST /api/bilete/retur/escaladeaza {telegram_id, cod?, text, motiv} — cererea ajunge la dispecer (alerta retur_cerere).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!cheieBotValida(req.headers.get('authorization'))) return NextResponse.json({ ok: false, eroare: 'neautorizat' }, { status: 401 });
  const body = await req.json().catch(() => null) as { telegram_id?: unknown; cod?: unknown; text?: unknown; motiv?: unknown } | null;
  const tg = Number(body?.telegram_id);
  if (!Number.isSafeInteger(tg) || tg <= 0) return NextResponse.json({ ok: false, eroare: 'telegram_id' }, { status: 400 });
  try {
    const ok = await escaladeaza(body?.telegram_id, body?.cod, body?.text, body?.motiv);
    return NextResponse.json({ ok }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[bilete/retur/escaladeaza]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
