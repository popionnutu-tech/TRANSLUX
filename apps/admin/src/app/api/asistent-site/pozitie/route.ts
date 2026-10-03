import { NextRequest, NextResponse } from 'next/server';
import { cors } from '@/lib/site-assistant/cors';
import { busLocation } from '@/lib/site-assistant/bus-location';
import { busCard } from '@/lib/site-assistant/cards';

// Harta autobuzului din chatul site-ului se actualizează singură (ION-39, Ion 23.09:
// «hartă interactivă mai interesantă» — fără traseu). Widget-ul cere aici, o dată pe
// minut cât cardul e deschis, punctul ACELEIAȘI curse. Fără model, fără istorie: aceeași
// poartă ca în chat — o singură cursă, doar în orele ei din grafic, fără viteză.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cronul de pe VPS scrie o dată pe minut; un client cere tot o dată pe minut.
// Plafonul pe instanță taie doar abuzul.
const WINDOW_MS = 60_000;
const MAX = 300;
let start = Date.now();
let count = 0;
function limited(): boolean {
  const now = Date.now();
  if (now - start > WINDOW_MS) { start = now; count = 0; }
  count += 1;
  return count > MAX;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

/** GET cu query (ION-206): cerere «simplă», fără preflight CORS la fiecare minut. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const s = (v: string | null) => (v ?? '').slice(0, 80);
  return handle(req, s(q.get('from')), s(q.get('to')), s(q.get('departure')));
}

/** POST-ul vechi rămâne până trece deploy-ul site-ului. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* validat mai jos */ }
  const s = (v: unknown) => (typeof v === 'string' ? v.slice(0, 80) : '');
  return handle(req, s(body.from), s(body.to), s(body.departure));
}

async function handle(req: NextRequest, from: string, to: string, departure: string) {
  // Punctul e de acum: GET-ul nu are voie să rămână în CDN.
  const headers: Record<string, string> = { ...cors(req), 'Cache-Control': 'no-store' };
  if (!headers['Access-Control-Allow-Origin']) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (limited()) return NextResponse.json({ error: 'rate limited' }, { status: 429, headers });
  if (!from || !to || !/^\d{1,2}:\d{2}$/.test(departure)) return NextResponse.json({ error: 'bad request' }, { status: 400, headers });

  try {
    const r = await busLocation(from, to, departure);
    // Cursa a ieșit din orele ei sau autobuzul tace: widget-ul oprește actualizarea
    // și spune de ce, cu fraza serverului.
    if (!r.point) {
      return NextResponse.json({
        live: false,
        line_ro: (r.result.line_ro as string | undefined) ?? null,
        line_ru: (r.result.line_ru as string | undefined) ?? null,
      }, { headers });
    }
    return NextResponse.json({ live: true, card: busCard(r.point) }, { headers });
  } catch (err) {
    console.error('asistent-site/pozitie:', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers });
  }
}
