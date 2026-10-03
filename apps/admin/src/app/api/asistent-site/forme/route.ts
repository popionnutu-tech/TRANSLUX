import { NextRequest, NextResponse } from 'next/server';
import { routeShapes, type LatLon } from '@/lib/site-assistant/static-cache';

// Linia pe drum a rutelor de pe harta «Acum» (ION-206). Ion, 03.10: formele (route_shapes, migr. 392)
// plecau cu fiecare poll de 60 s — 46 KB din 48. Acum /acum trimite doar amprenta `v` a fiecărei
// linii, iar clientul cere o singură dată, de aici, `?ids=10:ab12cd34ef,13:…`. Amprenta e în URL,
// deci răspunsul poate fi immutable: CDN-ul Vercel îl ține o zi (s-maxage), browserul o oră;
// linia refăcută pe VPS = altă amprentă = alt URL. Linia e geometrie publică (drumul autobuzului),
// fără nimic de ascuns, deci răspunde oricui (`*`) — fără `Vary: Origin`, ca CDN-ul să țină UN rând.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

/** Cel mult atâtea rute într-o cerere (harta arată NOW_SHOWN = 5 curse). */
const MAX_IDS = 20;
const OPEN = { 'Access-Control-Allow-Origin': '*' } as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...OPEN, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' } });
}

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, MAX_IDS);
  const ids = [...new Set(raw.map((x) => Number(x.split(':')[0])).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return NextResponse.json({ error: 'bad request' }, { status: 400, headers: { ...OPEN, 'Cache-Control': 'no-store' } });
  if (limited()) return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { ...OPEN, 'Cache-Control': 'no-store' } });
  try {
    const rows = await routeShapes(ids);
    const shapes: Record<number, LatLon[]> = {};
    const v: Record<number, string> = {};
    for (const r of rows) { shapes[r.crm_route_id] = r.shape; v[r.crm_route_id] = r.v; }
    // Rută lipsă (id greșit sau încă fără linie): răspunsul nu are voie să stea o zi în CDN.
    const complete = rows.length === ids.length;
    return NextResponse.json({ shapes, v }, {
      headers: { ...OPEN, 'Cache-Control': complete ? 'public, max-age=3600, s-maxage=86400, immutable' : 'public, max-age=60' },
    });
  } catch (err) {
    console.error('asistent-site/forme:', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: { ...OPEN, 'Cache-Control': 'no-store' } });
  }
}
