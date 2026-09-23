import { NextRequest, NextResponse } from 'next/server';
import { cors } from '@/lib/site-assistant/cors';
import { nextTrips, MAX_AGE_MIN } from '@/lib/site-assistant/bus-location';
import { getSupabase } from '@/lib/supabase';
import { etaFrom, remainingKm, routePace } from '@/lib/site-assistant/bus-eta';

// Butonul «Acum» de pe prima pagină a translux.md (ION-43). Ion, 23.09: omul alege
// «de unde → încotro» și apasă «Acum» sau «Mai târziu»; fără geolocația lui.
// «Acum» = următoarele plecări de azi din localitatea omului (nextTrips), fiecare cu
// șoferul, mașina și numărul lui; punctul autobuzului doar cât cursa e pe drum după
// grafic și poziția e proaspătă — aceeași poartă ca în chat. Fără model.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Fereastra de pe site cere o dată pe minut, cât e deschisă. Plafonul taie abuzul.
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

const normPlate = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** «Chișinău» și «Chisinau» sunt aceeași oprire. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[şș]/g, 's').replace(/[ţț]/g, 't').trim();

/**
 * Ora orientativă la care autobuzul ajunge în localitatea omului (Ion, 23.09: «ora
 * exactă orientativ când ajunge rutiera, nu cea din engine, în baza la GPS din trecut»).
 * Doar pentru autobuzul care e pe drum și are punct: km rămași pe linia rutei × minutele
 * pe km ale rutei din istoric (lib/site-assistant/bus-eta.ts). `passed` = a trecut deja.
 */
async function etaFor(
  routeId: number | null,
  p: { lat: number; lon: number; atIso: string },
  routes: Record<number, { shape: [number, number][]; from: [number, number] | null; to: [number, number] | null }>,
): Promise<{ eta?: string; eta_min?: number; passed?: boolean }> {
  const rt = routeId != null ? routes[routeId] : undefined;
  if (!rt?.from || !rt.to) return {};
  const rem = remainingKm(rt.shape, [p.lat, p.lon], rt.from, rt.to);
  if (!rem) return {};
  if (rem.passed) return { passed: true };
  const pace = await routePace(routeId!);
  if (!pace) return {};
  return etaFrom(rem.km, pace, p.atIso);
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  if (!headers['Access-Control-Allow-Origin']) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (limited()) return NextResponse.json({ error: 'rate limited' }, { status: 429, headers });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* validat mai jos */ }
  const s = (v: unknown) => (typeof v === 'string' ? v.slice(0, 80) : '');
  const from = s(body.from), to = s(body.to);
  if (!from || !to) return NextResponse.json({ error: 'bad request' }, { status: 400, headers });

  try {
    const r = await nextTrips(from, to);
    // Punctul doar pentru autobuzul care e deja pe drum după grafic (poarta ION-39).
    const plates = [...new Set(r.trips.filter((t) => t.on_road).map((t) => normPlate(t.plate)).filter(Boolean))];
    const pos = new Map<string, { lat: number; lon: number; near: string | null; at: string; atIso: string }>();
    if (plates.length) {
      const { data } = await getSupabase().from('bus_live_positions').select('plate, lat, lon, at, near').in('plate', plates);
      for (const p of data ?? []) {
        // Un punct mai vechi nu mai e «acum»: cursa rămâne în listă, fără punct.
        if ((Date.now() - Date.parse(p.at as string)) / 60_000 > MAX_AGE_MIN) continue;
        pos.set(p.plate as string, {
          lat: p.lat as number, lon: p.lon as number, near: (p.near as string | null) ?? null, atIso: p.at as string,
          at: new Date(p.at as string).toLocaleTimeString('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false }),
        });
      }
    }
    // Linia pe drum a fiecărei rute din listă (route_shapes, migr. 392) și, pe ea, unde
    // sunt localitatea omului și destinația lui. Ion, 23.09: «pune totuși linia de traseu
    // pe care merge mașina, fină să fie».
    const rids = [...new Set(r.trips.map((t) => t.route_id).filter((x): x is number => x != null))];
    const routes: Record<number, { shape: [number, number][]; from: [number, number] | null; to: [number, number] | null }> = {};
    if (rids.length) {
      const { data } = await getSupabase().from('route_shapes').select('crm_route_id, shape, stops').in('crm_route_id', rids);
      const same = (a: string, b: string | undefined) => !!b && fold(a) === fold(b);
      for (const s of data ?? []) {
        const stops = (s.stops ?? []) as { name: string; lat: number; lon: number }[];
        const at = (name: string | undefined) => {
          const st = stops.find((x) => same(x.name, name));
          return st ? [st.lat, st.lon] as [number, number] : null;
        };
        routes[s.crm_route_id as number] = { shape: s.shape as [number, number][], from: at(r.fromRo), to: at(r.toRo) };
      }
    }
    return NextResponse.json({
      from: r.fromRo ?? null,
      to: r.toRo ?? null,
      routes,
      // Autobuzul care a trecut deja de oprirea omului nu mai e al lui — iese din listă,
      // chiar dacă după grafic ar mai fi pe drum (nextTrips ține și cursele întârziate).
      trips: (await Promise.all(r.trips.map(async (t) => {
        const p = t.on_road ? pos.get(normPlate(t.plate)) : undefined;
        return { ...t, ...(p ?? {}), ...(p ? await etaFor(t.route_id, p, routes) : {}) };
      }))).filter((t) => !('passed' in t && t.passed)),
      line_ro: r.trips.length ? null : ((r.result.line_ro ?? r.result.result_ro) as string | undefined) ?? null,
      line_ru: r.trips.length ? null : ((r.result.line_ru ?? r.result.result_ru) as string | undefined) ?? null,
    }, { headers });
  } catch (err) {
    console.error('asistent-site/acum:', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers });
  }
}
