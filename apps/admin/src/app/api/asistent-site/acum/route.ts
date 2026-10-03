import { NextRequest, NextResponse } from 'next/server';
import { cors } from '@/lib/site-assistant/cors';
import { nextTrips, MAX_AGE_MIN, NOW_SHOWN, hhmmToMin, nowMinChisinau } from '@/lib/site-assistant/bus-location';
import { estimateOnLine, type TimedStop } from '@/lib/site-assistant/bus-estimate';
import { getSupabase } from '@/lib/supabase';
import { realEta, routePasses, typicalOffset, lateMin, notAfterSchedule, preloadEtaCache, etaKeys, NOT_ON_TRIP_LATE_MIN, type GeoStop } from '@/lib/site-assistant/bus-eta';
import { routeShapes, stopHours, type LatLon } from '@/lib/site-assistant/static-cache';
import { chisinauTodayIso } from '@/lib/chisinau-time';

// Butonul «Acum» de pe prima pagină a translux.md (ION-43). Ion, 23.09: omul alege
// «de unde → încotro» și apasă «Acum» sau «Mai târziu»; fără geolocația lui.
// «Acum» = următoarele plecări de azi din localitatea omului (nextTrips), fiecare cu
// șoferul, mașina și numărul lui; punctul autobuzului doar cât cursa e pe drum după
// grafic și poziția e proaspătă — aceeași poartă ca în chat. Fără model.
//
// ION-206 (Ion, 03.10, «site ultrafast»): GET cu query `?from=&to=&lang=` = cerere «simplă», fără
// preflight CORS; răspunsul ușor — pozițiile, ora estimată și AMPRENTA liniei fiecărei rute (`v`),
// nu linia (46 KB din 48 la fiecare poll de 60 s). Linia o cere clientul o dată, de la /forme, pe
// amprentă (immutable). POST-ul vechi, cu linia în răspuns, rămâne până trece deploy-ul site-ului.
// `lang` nu se folosește: line_ro/line_ru sunt ambele mici, clientul alege.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Fereastra de pe site cere o dată pe minut, cât e deschisă. Abuzul îl taie Vercel Firewall (ION-209): 30 de cereri
// pe minut pe IP, la marginea rețelei. Contorul din memorie de aici era pe instanță și pentru toți vizitatorii laolaltă:
// nu oprea abuzul și la vârf putea refuza clienți adevărați.

/** Cursa plecată după grafic de peste atâtea minute, fără punct și fără istoric, iese din listă. */
const STALE_MIN = 30;
/** Cât de vechi poate fi punctul ca mașina să apară totuși pe hartă (oprită, trimite rar). */
const SHOW_MAX_AGE_MIN = 30;

const normPlate = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** «Chișinău» și «Chisinau» sunt aceeași oprire. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[şș]/g, 's').replace(/[ţț]/g, 't').trim();

/** Gările / opririle principale ale rutelor, unde rutiera stă (Ion, 24.09: «punct de gară sau oprire principală ca în Edineț»). */
const MAIN_STOPS = new Set(['chisinau', 'balti', 'edinet', 'briceni', 'lipcani', 'ocnita', 'riscani', 'otaci', 'soroca']);
/** Orașele scrise pe harta «Acum» (Ion, 27.09, ION-100: «denumirile la locații să fie vizibile, special
 *  locațiile principale prin care noi trecem… nu se înțelege unde este Bălți»). Plăcile OSM decolorate
 *  nu arată numele orașelor la zoom mic; le scriem noi, din opririle rutelor din listă. */
const MAP_PLACES = new Set([...MAIN_STOPS, 'orhei', 'singerei', 'cupcini', 'drochia', 'falesti', 'glodeni', 'donduseni', 'floresti', 'straseni', 'criva']);
/** Atât de aproape de punctul peronului = mașina e acolo. */
const AT_STOP_KM = 0.3;

function km(a: [number, number], b: [number, number]): number {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180, dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(s));
}

/** Gara sau oprirea omului în care stă acum mașina; `mine` = chiar oprirea omului. */
function stopAt(p: [number, number], stops: GeoStop[], from: string | undefined): { name: string; mine: boolean } | null {
  let best: { name: string; mine: boolean; d: number } | null = null;
  for (const s of stops) {
    const mine = !!from && fold(s.name) === fold(from);
    if (!mine && !MAIN_STOPS.has(fold(s.name))) continue;
    const d = km(p, [s.lat, s.lon]);
    if (d <= AT_STOP_KM && (!best || d < best.d)) best = { name: s.name, mine, d };
  }
  return best ? { name: best.name, mine: best.mine } : null;
}

interface PosRow { plate: string; lat: number; lon: number; at: string; near: string | null }

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

/** Clientul nou (ION-206): răspuns ușor, fără linia rutei — doar amprenta ei. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const s = (v: string | null) => (v ?? '').slice(0, 80);
  return handle(req, s(q.get('from')), s(q.get('to')), { light: true });
}

/** Clientul vechi (până la deploy-ul site-ului): linia rutei în răspuns, ca înainte. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* validat mai jos */ }
  const s = (v: unknown) => (typeof v === 'string' ? v.slice(0, 80) : '');
  return handle(req, s(body.from), s(body.to), { light: false });
}

async function handle(req: NextRequest, from: string, to: string, { light }: { light: boolean }) {
  // GET-ul nu are voie să rămână în CDN: pozițiile sunt de acum.
  const headers: Record<string, string> = { ...cors(req), 'Cache-Control': 'no-store' };
  if (!headers['Access-Control-Allow-Origin']) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!from || !to) return NextResponse.json({ error: 'bad request' }, { status: 400, headers });

  try {
    const r = await nextTrips(from, to);
    // Punctul doar pentru autobuzul care e deja pe drum după grafic (poarta ION-39).
    const plates = [...new Set(r.trips.filter((t) => t.on_road || t.coming).map((t) => normPlate(t.plate)).filter(Boolean))];
    const rids = [...new Set(r.trips.map((t) => t.route_id).filter((x): x is number => x != null))];
    // Cele patru citiri nu depind una de alta: în paralel (ION-206). Pozițiile din bază; linia rutei și
    // orele opririlor din Data Cache (static-cache, 1 h); ritmul și trecerile din site_eta_cache
    // (migr. 490), scrise noaptea de cronul site-eta-cache — fără ele s-ar calcula aici, ca înainte.
    const [posRows, shapeRows, hourRows] = await Promise.all([
      plates.length
        ? getSupabase().from('bus_live_positions').select('plate, lat, lon, at, near').in('plate', plates).then((x) => (x.data ?? []) as PosRow[])
        : Promise.resolve([] as PosRow[]),
      routeShapes(rids).catch((e) => { console.error('asistent-site/acum route_shapes:', e); return []; }),
      stopHours(rids).catch((e) => { console.error('asistent-site/acum crm_stop_fares:', e); return []; }),
      preloadEtaCache([etaKeys.pace(null), ...rids.flatMap((id) => [etaKeys.pace(id), etaKeys.passes(id, true), etaKeys.passes(id, false)])]).catch(() => 0),
    ]);

    const pos = new Map<string, { lat: number; lon: number; near: string | null; at: string; atIso: string; fresh: boolean }>();
    for (const p of posRows) {
      // Mașina oprită la gară, cu motorul stins, trimite rar (24.09, 07:35: 18 din 42 cu punctul
      // mai vechi de 5 min; 828 MLN la Autogara Bălți, ultimul la 07:28) — pe hartă se vede
      // punctul până la SHOW_MAX_AGE_MIN; ora estimată și «passed» primesc doar punctul proaspăt.
      const age = (Date.now() - Date.parse(p.at)) / 60_000;
      if (age > SHOW_MAX_AGE_MIN) continue;
      pos.set(p.plate, {
        fresh: age <= MAX_AGE_MIN,
        lat: p.lat, lon: p.lon, near: p.near ?? null, atIso: p.at,
        at: new Date(p.at).toLocaleTimeString('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false }),
      });
    }
    // Linia pe drum a fiecărei rute din listă (route_shapes, migr. 392) și, pe ea, unde
    // sunt localitatea omului și destinația lui. Ion, 23.09: «pune totuși linia de traseu
    // pe care merge mașina, fină să fie». Clientului nou îi pleacă doar amprenta `v` (ION-206).
    const routes: Record<number, { v: string; shape?: LatLon[]; from: LatLon | null; to: LatLon | null }> = {};
    const places = new Map<string, { name: string; lat: number; lon: number; end: boolean }>();
    // Opririle cu coordonate și stop_order, pentru ora reală (nu pleacă spre site).
    const geo: Record<number, { shape: LatLon[]; stops: GeoStop[] }> = {};
    const same = (a: string, b: string | undefined) => !!b && fold(a) === fold(b);
    for (const s of shapeRows) {
      const stops = s.stops;
      const at = (name: string | undefined) => {
        const st = stops.find((x) => same(x.name, name));
        return st ? [st.lat, st.lon] as LatLon : null;
      };
      routes[s.crm_route_id] = { v: s.v, ...(light ? {} : { shape: s.shape }), from: at(r.fromRo), to: at(r.toRo) };
      geo[s.crm_route_id] = { shape: s.shape, stops };
      for (const st of stops) {
        const k = fold(st.name);
        const end = same(st.name, r.fromRo) || same(st.name, r.toRo);
        if (!places.has(k) && (end || MAP_PLACES.has(k))) places.set(k, { name: st.name, lat: st.lat, lon: st.lon, end });
      }
    }
    // Orele opririlor din grafic, pentru poziția orientativă a mașinilor fără GPS.
    const hours = new Map<string, { nord: number | null; chis: number | null }>();
    for (const h of hourRows) hours.set(`${h.crm_route_id}:${h.stop_order}`, { nord: hhmmToMin(h.hour_from_nord), chis: hhmmToMin(h.hour_from_chisinau) });
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
        // În gară sau în oprirea omului: pe hartă semnal «e aici acum», nu ora (Ion, 24.09).
        const atStop = seen && g ? stopAt([seen.lat, seen.lon], g.stops, r.fromRo) : null;
        return { ...t, ...(seen ?? {}), ...(e ?? {}), ...(atStop ? { at_stop: atStop } : {}) };
      }))).filter((t) => {
        if ('passed' in t && t.passed) return false;
        // Mașina văzută de GPS cu peste o oră în urmă față de grafic nu face cursa (ION-129, 28.09:
        // 759LYY stătea la Briceni din 13:06, harta arăta cursa de 20:15 din Bălți «1 h 57 min»).
        // Doar ETA din GPS: cea «istoric» e graficul corectat, nu spune unde e mașina.
        if ('eta_source' in t && t.eta_source === 'gps' && 'eta' in t && typeof t.eta === 'string') {
          const late = lateMin(t.departure, t.eta);
          if (late != null && late > NOT_ON_TRIP_LATE_MIN) return false;
        }
        // O cursă plecată după grafic de peste jumătate de oră rămâne doar cu o oră estimată
        // spre localitatea omului. Punctul singur nu ajunge: 24.09, 07:25, Bălți → Chișinău,
        // cursa de 05:10 stătea deja la Chișinău (Ciocana), fără eta și fără «passed», și ieșea
        // prima în listă cu «acum» (Ion: «arată greșit chiar acum»).
        return 'eta' in t || t.minutes_until >= -STALE_MIN;
      }).slice(0, NOW_SHOWN) // plafonul abia după ce ies cursele trecute
      // Ora arătată omului nu trece de grafic (ION-141); filtrul de mai sus a judecat pe ETA-ul brut.
      .map((t) => notAfterSchedule(t as typeof t & { eta?: string; eta_min?: number }));
    // Lista golită de filtru are nevoie de aceeași frază ca lista goală din start.
    const none = trips.length === 0;
    return NextResponse.json({
      from: r.fromRo ?? null,
      to: r.toRo ?? null,
      routes,
      places: [...places.values()],
      trips,
      line_ro: none ? ((r.result.line_ro ?? r.result.result_ro) as string | undefined) ?? `Acum nu mai vine nicio cursă ${r.fromRo} → ${r.toRo}. Apăsați «Mai târziu» și alegeți altă zi.` : null,
      line_ru: none ? ((r.result.line_ru ?? r.result.result_ru) as string | undefined) ?? `Сейчас больше нет рейсов ${r.fromRo} → ${r.toRo}. Нажмите «Позже» и выберите другой день.` : null,
    }, { headers });
  } catch (err) {
    console.error('asistent-site/acum:', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers });
  }
}
