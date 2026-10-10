import { NextRequest, NextResponse } from 'next/server';
import { cheieSiteValida } from '@/lib/bilete/site-auth';
import { gasesteBilete } from '@/lib/bilete/sms';

// POST /api/bilete/gaseste — «Găsește biletul meu» (552): linkurile biletelor viitoare pleacă prin SMS pe acel număr;
// pe ecran nu se arată nimic. Public în middleware (cale EXACTĂ), apărat prin BILETE_API_KEY; plafoanele sunt în bază.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!cheieSiteValida(req.headers.get('authorization'))) return NextResponse.json({ ok: false, eroare: 'neautorizat' }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, eroare: 'JSON nevalid' }, { status: 400 }); }
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
  const telefon = s(b?.phone, 32), ip = s(b?.ipHash, 64), lang = b?.lang === 'ru' ? 'ru' : 'ro';
  if (!telefon || !ip) return NextResponse.json({ ok: false, eroare: 'telefon și ip_hash sunt obligatorii' }, { status: 400 });
  try {
    return NextResponse.json(await gasesteBilete(telefon, ip, lang));
  } catch (e) {
    console.error('[bilete/gaseste]', e);
    return NextResponse.json({ ok: false, eroare: 'eroare internă' }, { status: 500 });
  }
}
