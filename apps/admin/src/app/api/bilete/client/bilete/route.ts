import { NextRequest, NextResponse } from 'next/server';
import { bileteleClientului } from '@/lib/bilete/client-bilete';
import { repoBileteClient } from '@/lib/bilete/client-repo';
import { BazaIndisponibilaError } from '@/lib/bilete/public';
import { cheieSiteValida } from '@/lib/bilete/site-auth';

// POST /api/bilete/client/bilete — biletele active ale clientului pentru mini app-ul Telegram de pe translux.md
// (ION-249). Public în middleware (cale EXACTĂ, public-paths.test.ts); se apără de două ori: BILETE_API_KEY (doar
// serverul site-ului o are) și antetul X-Telegram-Init-Data = Telegram.WebApp.initData, verificat HMAC cu tokenul
// botului (identitatea clientului). Fără cache, fără referrer: răspunsul are numele, telefonul și codurile QR.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const ANTETE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

export async function POST(req: NextRequest) {
  if (!cheieSiteValida(req.headers.get('authorization'))) {
    return NextResponse.json({ ok: false, eroare: 'neautorizat' }, { status: 401, headers: ANTETE });
  }
  try {
    const r = await bileteleClientului({
      initData: req.headers.get('x-telegram-init-data'),
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      acumMs: Date.now(),
    }, repoBileteClient);
    if (!r.ok) return NextResponse.json({ ok: false, eroare: r.eroare }, { status: r.status, headers: ANTETE });
    return NextResponse.json({ ok: true, bilete: r.bilete, contact: r.contact, istoric: r.istoric }, { headers: ANTETE });
  } catch (e) {
    if (!(e instanceof BazaIndisponibilaError)) throw e;
    console.error('[bilete/client] baza indisponibilă:', e.message);
    return NextResponse.json({ ok: false, eroare: 'indisponibil' }, { status: 503, headers: { ...ANTETE, 'Retry-After': '5' } });
  }
}
