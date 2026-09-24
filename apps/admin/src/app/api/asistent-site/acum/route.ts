import { NextRequest, NextResponse } from 'next/server';
import { cors } from '@/lib/site-assistant/cors';
import { nextTrips, MAX_AGE_MIN, NOW_SHOWN, hhmmToMin, nowMinChisinau } from '@/lib/site-assistant/bus-location';
import { estimateOnLine, type TimedStop } from '@/lib/site-assistant/bus-estimate';
import { getSupabase } from '@/lib/supabase';
import { realEta, routePasses, typicalOffset, type GeoStop } from '@/lib/site-assistant/bus-eta';
import { chisinauTodayIso } from '@/lib/chisinau-time';

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

/** Cursa plecată după grafic de peste atâtea minute, fără punct și fără istoric, iese din listă. */
const STALE_MIN = 30;
/** Cât de vechi poate fi punctul ca mașina să apară totuși pe hartă (oprită, trimite rar). */
const SHOW_MAX_AGE_MIN = 30;

const normPlate = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** «Chișinău» și «Chisinau» sunt aceeași oprire. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[şș]/g, 's').replace(/[ţț]/g, 't').trim();

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
    const plates = [...new Set(r.trips.filter((t) => t.on_road || t.coming).map((t) => normPlate(t.plate)).filter(Boolean))];
    const pos = new Map<string, { lat: number; lon: number; near: string | null; at: string; atIso: string; fresh: boolean }>();
    if (plates.length) {
      const { data } = await getSupabase().from('bus_live_positions').select('plate, lat, lon, at, near').in('plate', plates);
      for (const p of data ?? []) {
        // Mașina oprită la gară, cu motorul stins, trimite rar (24.09, 07:35: 18 din 42 cu punctul
        // mai vechi de 5 min; 828 MLN la Autogara Bălți, ultimul la 07:28) — pe hartă se vede
        // punctul până la SHOW_MAX_AGE_MIN; ora estimată și «passed» primesc doar punctul proaspăt.
        const age = (Date.now() - Date.parse(p.at as string)) / 60_000;
        if (age > SHOW_MAX_AGE_MIN) continue;
        pos.set(p.plate as string, {
          fresh: age <= MAX_AGE_MIN,
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
    // Opririle cu coordonate și stop_order, pentru ora reală (nu pleacă spre site).
    const geo: Record<number, { shape: [number, number][]; stops: GeoStop[] }> = {};
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
        geo[s.crm_route_id as number] = { shape: s.shape as [number, number][], stops: (s.stops ?? []) as GeoStop[] };
      }
    }
    // Orele opririlor din grafic, pentru poziția orientativă a mașinilor fără GPS.
    const hours = new Map<string, { nord: number | null; chis: number | null }>();
    if (rids.length) {
      const { data } = await getSupabase().from('crm_stop_fares').select('crm_route_id, stop_order, hour_from_nord, hour_from_chisinau').in('crm_route_id', rids);
      for (const h of data ?? []) hours.set(`${h.crm_route_id}:${h.stop_order}`, { nord: hhmmToMin(h.hour_from_nord as string), chis: hhmmToMin(h.hour_from_chisinau as string) });
    }
    // Autobuzul care a trecut deja de oprirea omului nu mai e al lui — iese din listă,
    // chiar dacă după grafic ar mai fi pe drum (nextTrips ține și cursele întârziate).
    const trips = (await Promise.all(r.trips.map(async (t) => {
        const any = pos.get(normPlate(t.plate));
        const p = t.on_road && any?.fresh ? any : undefined;
        // Mașina cursei care încă n-a început: doar punctul pe hartă, fără ora estimată și fără
        // «passed» — poate fi pe cursa de dinainte, pe sens invers (ION-43, 24.09).
        const seen = t.on_road || t.coming ? any : undefined;
        // Ora reală: pe drum din GPS, altfel din trecerile reale ale zilelor trecute.
        const g = t.route_id != null ? geo[t.route_id] : undefined;
        const e = g && r.fromRo && r.toRo
          ? await realEta({ routeId: t.route_id!, shape: g.shape, stops: g.stops, fromName: r.fromRo, toName: r.toRo, scheduled: t.departure, pos: p ?? null, today: chisinauTodayIso() }).catch(() => null)
          : null;
        // Fără GPS (Ion, 24.09: «pune la el orientativ pe traseu mașina, și la toate care lipsesc»):
        // pe linie, după ora tipică REALĂ pe opriri (grafic + abaterea mediană din route_stop_passes;
        // graficul gol unde istoria e prea puțină). Nu intră în eta și nici în «passed».
        if (!seen && t.on_road && g && t.route_id != null) {
          const passes = await routePasses(t.route_id, t.going_north).catch(() => []);
          const today = chisinauTodayIso();
          const timed: TimedStop[] = [];
          for (const s of g.stops) {
            const h = hours.get(`${t.route_id}:${s.stop_order}`);
            const sched = h ? (t.going_north ? h.chis : h.nord) : null;
            if (sched == null) continue;
            timed.push({ stop_order: s.stop_order, lat: s.lat, lon: s.lon, minute: sched + (typicalOffset(passes, s.stop_order, today) ?? 0) });
          }
          const est = estimateOnLine(g.shape, timed, t.going_north, nowMinChisinau());
          if (est) return { ...t, lat: est[0], lon: est[1], estimated: true, ...(e ?? {}) };
        }
        return { ...t, ...(seen ?? {}), ...(e ?? {}) };
      }))).filter((t) => {
        if ('passed' in t && t.passed) return false;
        // O cursă plecată după grafic de peste jumătate de oră rămâne doar cu o oră estimată
        // spre localitatea omului. Punctul singur nu ajunge: 24.09, 07:25, Bălți → Chișinău,
        // cursa de 05:10 stătea deja la Chișinău (Ciocana), fără eta și fără «passed», și ieșea
        // prima în listă cu «acum» (Ion: «arată greșit chiar acum»).
        return 'eta' in t || t.minutes_until >= -STALE_MIN;
      }).slice(0, NOW_SHOWN); // plafonul abia după ce ies cursele trecute
    // Lista golită de filtru are nevoie de aceeași frază ca lista goală din start.
    const none = trips.length === 0;
    return NextResponse.json({
      from: r.fromRo ?? null,
      to: r.toRo ?? null,
      routes,
      trips,
      line_ro: none ? ((r.result.line_ro ?? r.result.result_ro) as string | undefined) ?? `Acum nu mai vine nicio cursă ${r.fromRo} → ${r.toRo}. Apăsați «Mai târziu» și alegeți altă zi.` : null,
      line_ru: none ? ((r.result.line_ru ?? r.result.result_ru) as string | undefined) ?? `Сейчас больше нет рейсов ${r.fromRo} → ${r.toRo}. Нажмите «Позже» и выберите другой день.` : null,
    }, { headers });
  } catch (err) {
    console.error('asistent-site/acum:', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers });
  }
}
