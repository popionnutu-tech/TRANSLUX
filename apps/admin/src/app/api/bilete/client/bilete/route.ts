import { NextRequest, NextResponse } from 'next/server';
import { bileteleClientului } from '@/lib/bilete/client-bilete';
import { repoBileteClient } from '@/lib/bilete/client-repo';
import { BazaIndisponibilaError } from '@/lib/bilete/public';
import { cheieSiteValida } from '@/lib/bilete/site-auth';
import { cors } from '@/lib/site-assistant/cors';

// POST /api/bilete/client/bilete — biletele active ale clientului pentru mini app-ul Telegram de pe translux.md
// (ION-249). Public în middleware (cale EXACTĂ, public-paths.test.ts). Identitatea = initData-ul Telegram, verificat HMAC cu
// tokenul botului (bileteleClientului). Fără cache, fără referrer: răspunsul are numele, telefonul și codurile QR.
//
// Două căi de intrare:
//  1. serverul site-ului (server action): `Authorization: Bearer BILETE_API_KEY` + antet `X-Telegram-Init-Data` — rezerva.
//  2. ION-275 («Telegram ultrafast» P6): direct din browserul paginii /telegram, pornită înaintea JS-ului — cerere «simplă»
//     (Content-Type text/plain, initData în CORP, fără antete personalizate → fără preflight; niciodată în URL, ar ajunge
//     în jurnale), DOAR din originile site-ului (lib/site-assistant/cors.ts), fără credențiale. Nu lărgește suprafața:
//     server action-ul primea deja initData din browser, iar cheia site-ului nu apăra nimic în fața deținătorului lui.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const ANTETE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const INIT_DATA_MAX = 4096;

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: { ...ANTETE, ...cors(req) } });
}

export async function POST(req: NextRequest) {
  const c = cors(req);
  const dinBrowser = Boolean(c['Access-Control-Allow-Origin']);
  const antete = { ...ANTETE, ...c };
  let initData: string | null;
  if (cheieSiteValida(req.headers.get('authorization'))) {
    initData = req.headers.get('x-telegram-init-data');
  } else if (dinBrowser) {
    const corp = await req.text().catch(() => '');
    initData = corp && corp.length <= INIT_DATA_MAX ? corp.trim() : null;
  } else {
    return NextResponse.json({ ok: false, eroare: 'neautorizat' }, { status: 401, headers: antete });
  }
  try {
    const r = await bileteleClientului({ initData, botToken: process.env.TELEGRAM_BOT_TOKEN, acumMs: Date.now() }, repoBileteClient);
    if (!r.ok) return NextResponse.json({ ok: false, eroare: r.eroare }, { status: r.status, headers: antete });
    return NextResponse.json({ ok: true, bilete: r.bilete, contact: r.contact, istoric: r.istoric }, { headers: antete });
  } catch (e) {
    if (!(e instanceof BazaIndisponibilaError)) throw e;
    console.error('[bilete/client] baza indisponibilă:', e.message);
    return NextResponse.json({ ok: false, eroare: 'indisponibil' }, { status: 503, headers: { ...antete, 'Retry-After': '5' } });
  }
}
