import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSupabase } from '@/lib/supabase';
import { pozitiiLiveCached } from '@/lib/wialon';
import { normalizeazaPlaca } from '@/lib/lde/parc';
import { pozitieRecenta } from '@/lib/lde/camioane';
import { asazaInBenzi, camioaneInBanda, esteInCursa, segmentInFereastra, undeEste } from '@/lib/lde/banda';
import { chisinauDayBounds, chisinauTodayIso } from '@/lib/chisinau-time';

// Flota de camioane pentru mini app-ul TLX (Ion, 01.09: «чтобы было не отдельное,
// а в мини-апп, там где уже есть доступ к котировкам»).
//
// Mini app-ul trăiește în ALT proiect și ALTĂ bază. Ca să nu se nască un al doilea
// calcul al benzii acolo, ruta asta întoarce datele DEJA prelucrate: stări, rute,
// poziții, segmente. Cealaltă parte doar le desenează.
//
// DOAR CITIRE și doar cu cheia comună. Nu ies: telefonul șoferului, clientul
// cursei, notele dispecerului, motivele de anulare — decizia machetei aprobate.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ZILE_IMPLICIT = 7;
const ZILE_MAX = 14;

// Ancorat și case-insensitive: «bearer» cu minusculă e legal (RFC 7235), iar un
// `.replace('Bearer ', '')` accepta și cheia goală, fără schemă.
const BEARER_RE = /^Bearer\s+(.+)$/i;

function cheieValida(req: NextRequest): boolean {
  const asteptat = process.env.CAMIOANE_API_KEY;
  if (!asteptat) {
    console.error('[extern/camioane] CAMIOANE_API_KEY lipsește');
    return false;
  }
  const primit = BEARER_RE.exec(req.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  if (!primit) return false;
  const a = Buffer.from(primit);
  const b = Buffer.from(asteptat);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Fiecare apel costă 5 interogări Supabase. Cheia e de 256 de biți, deci nu se
// ghicește — plafonul apără sarcina, nu secretul. Tiparul e cel din voice-tools.
const FEREASTRA_MS = 60_000;
const MAX_PE_FEREASTRA = 60;
let fereastraStart = Date.now();
let apeluri = 0;
function preaDes(): boolean {
  const acum = Date.now();
  if (acum - fereastraStart > FEREASTRA_MS) { fereastraStart = acum; apeluri = 0; }
  apeluri += 1;
  return apeluri > MAX_PE_FEREASTRA;
}

type StareCamion = 'in_cursa' | 'liber' | 'reparatie' | 'odihna';

export async function GET(req: NextRequest) {
  if (!cheieValida(req)) {
    return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
  }
  if (preaDes()) {
    return NextResponse.json({ error: 'Prea multe cereri' }, { status: 429 });
  }

  const cerut = Number(new URL(req.url).searchParams.get('zile'));
  const nrZile = Math.min(ZILE_MAX, Math.max(3, Math.floor(Number.isFinite(cerut) && cerut > 0 ? cerut : ZILE_IMPLICIT)));

  try {
    const sb = getSupabase();
    const azi = chisinauTodayIso();
    const zile: string[] = [];
    const d = new Date(`${azi}T12:00:00Z`);
    for (let i = 0; i < nrZile; i++) {
      zile.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    const fromIso = chisinauDayBounds(zile[0]).fromIso;
    const toIso = chisinauDayBounds(zile[zile.length - 1]).toIso;

    const [vehRes, legRes, curseRes, stariRes, puncteRes] = await Promise.all([
      sb.from('vehicles')
        .select('id, plate_number, lde_truck_profile ( fleet_type )')
        .eq('active', true).eq('is_lde', true).contains('directions', ['camioane'])
        .order('plate_number'),
      sb.from('lde_active_assignments')
        .select('vehicle_id, drivers:driver_id ( full_name )').is('valid_to', null),
      sb.from('lde_truck_trips')
        .select(`id, vehicle_id, cargo, status, load_planned_at, unload_planned_at,
                 load_point:load_point_id ( name ), unload_point:unload_point_id ( name )`)
        .lt('load_planned_at', toIso).gte('unload_planned_at', fromIso)
        .neq('status', 'anulata').order('load_planned_at').limit(1000),
      sb.from('lde_truck_day_states')
        .select('vehicle_id, date, state, reason, expected_end')
        .gte('date', zile[0]).lte('date', zile[zile.length - 1])
        .order('date').order('vehicle_id').limit(1000),
      sb.from('lde_dispatch_points').select('name, lat, lng').eq('active', true),
    ]);
    for (const r of [vehRes, legRes, curseRes, stariRes, puncteRes]) {
      if (r.error) { console.error('[extern/camioane]', r.error.message); throw new Error('citire eșuată'); }
    }

    const unu = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);

    type Leg = { vehicle_id: string; drivers: { full_name: string } | { full_name: string }[] | null };
    // Atribuirea EXISTĂ chiar dacă join-ul pe nume tace: camionul rămâne în bandă,
    // doar numele lipsește. Altfel mini app-ul arăta altă flotă decât calculatorul.
    const soferPeCamion = new Map<string, string | null>();
    for (const l of (legRes.data ?? []) as Leg[]) {
      soferPeCamion.set(l.vehicle_id, unu(l.drivers)?.full_name ?? null);
    }

    type Veh = { id: string; plate_number: string; lde_truck_profile: { fleet_type: string } | { fleet_type: string }[] | null };
    const toate = ((vehRes.data ?? []) as Veh[]).map((v) => ({
      id: v.id,
      plate: v.plate_number,
      fleetType: (unu(v.lde_truck_profile)?.fleet_type as 'cisterna' | 'zernovoz' | undefined) ?? null,
      driverId: soferPeCamion.has(v.id) ? v.id : null,
      driverName: soferPeCamion.get(v.id) ?? null,
    }));

    type CursaRow = {
      id: string; vehicle_id: string; cargo: string | null; status: string;
      load_planned_at: string; unload_planned_at: string;
      load_point: { name: string } | { name: string }[] | null;
      unload_point: { name: string } | { name: string }[] | null;
    };
    const curse = (curseRes.data ?? []) as CursaRow[];

    // Aceeași regulă ca pe calculator: camionul fără șofer nu apare, dar cursa lui
    // nu se ascunde niciodată.
    const randuri = camioaneInBanda(toate, curse.map((c) => ({ vehicleId: c.vehicle_id })));

    type StareRow = { vehicle_id: string; date: string; state: 'reparatie' | 'odihna'; reason: string | null; expected_end: string | null };
    const stari = (stariRes.data ?? []) as StareRow[];
    const stariPeCheie = new Map(stari.map((s) => [`${s.vehicle_id}|${s.date}`, s]));

    type Punct = { name: string; lat: number | null; lng: number | null };
    const puncte = (puncteRes.data ?? []) as Punct[];

    // Pozițiile live, filtrate la flota de camioane și la 24h prospețime.
    let pozitii: { plate: string; lat: number; lng: number; at: string; speed?: number }[] = [];
    let gpsViu = true;
    try {
      const brute = await pozitiiLiveCached();
      const permise = new Set(randuri.map((c) => normalizeazaPlaca(c.plate)));
      const acum = Date.now();
      pozitii = brute
        .filter((p) => permise.has(normalizeazaPlaca(p.plate)) && pozitieRecenta(p.at, acum));
    } catch (e) {
      // Wialon căzut nu rupe ecranul: banda merge, coloana «acum» tace.
      console.error('[extern/camioane] wialon:', e);
      gpsViu = false;
    }
    const pozPePlaca = new Map(pozitii.map((p) => [normalizeazaPlaca(p.plate), p]));

    const curseVii = curse.filter((c) => esteInCursa(c.status));
    const cuCursaAcum = new Set(curseVii.map((c) => c.vehicle_id));

    const iesire = randuri.map((cam) => {
      const aleLui = curse.filter((c) => c.vehicle_id === cam.id);
      const activa = aleLui.find((c) => esteInCursa(c.status)) ?? null;
      const stareAzi = stariPeCheie.get(`${cam.id}|${azi}`) ?? null;
      const poz = pozPePlaca.get(normalizeazaPlaca(cam.plate));

      const stare: StareCamion = cuCursaAcum.has(cam.id)
        ? 'in_cursa'
        : stareAzi ? stareAzi.state : 'liber';

      // Următoarea cursă planificată, ca liberul să nu pară gol pe veci.
      const urmatoarea = aleLui
        .filter((c) => !esteInCursa(c.status) && Date.parse(c.load_planned_at) > Date.now())
        .sort((a, b) => Date.parse(a.load_planned_at) - Date.parse(b.load_planned_at))[0] ?? null;

      return {
        placa: cam.plate,
        tip: cam.fleetType,
        sofer: cam.driverName,
        stare,
        marfa: activa?.cargo ?? null,
        ruta: activa
          ? `${unu(activa.load_point)?.name ?? '—'} → ${unu(activa.unload_point)?.name ?? '—'}`
          : null,
        pana: activa ? activa.unload_planned_at : null,
        stareaPanaLa: stareAzi?.expected_end ?? null,
        urmatoareaCursa: urmatoarea
          ? { de: urmatoarea.load_planned_at, ruta: `${unu(urmatoarea.load_point)?.name ?? '—'} → ${unu(urmatoarea.unload_point)?.name ?? '—'}` }
          : null,
        // Poziția spusă omenește, nu în coordonate: numele punctului cel mai apropiat.
        unde: poz ? undeEste({ lat: poz.lat, lng: poz.lng }, puncte) : null,
        // Segmentele pentru banda de o săptămână, DEJA așezate pe benzi care nu se
        // ating. Așezarea e regulă, nu desen: fără ea, cursa care începe în
        // interiorul alteia dispare — greșeala pe care calculatorul a reparat-o deja.
        benzi: asazaInBenzi([
          ...aleLui.map((c) => {
            const seg = segmentInFereastra(c.load_planned_at, c.unload_planned_at, zile);
            if (!seg) return null;
            const marfa = (c.cargo ?? '').toLowerCase();
            const tip = marfa === 'biodiesel' || marfa === 'cereale' || marfa === 'diesel' ? marfa : 'alta';
            return { start: seg.start, span: seg.span, tip };
          }).filter(Boolean),
          ...zile.map((z, i) => {
            const s = stariPeCheie.get(`${cam.id}|${z}`);
            return s ? { start: i, span: 1, tip: s.state } : null;
          }).filter(Boolean),
        ].filter((x): x is { start: number; span: number; tip: string } => x !== null)
          .map((x) => ({ seg: { start: x.start, span: x.span, taiatStanga: false, taiatDreapta: false }, tip: x.tip })))
          .map((banda) => banda.map((x) => ({ start: x.seg.start, span: x.seg.span, tip: x.tip }))),
      };
    });

    return NextResponse.json({
      generatLa: new Date().toISOString(),
      azi,
      zile,
      gpsViu,
      rezumat: {
        inCursa: iesire.filter((c) => c.stare === 'in_cursa').length,
        libere: iesire.filter((c) => c.stare === 'liber').length,
        stare: iesire.filter((c) => c.stare === 'reparatie' || c.stare === 'odihna').length,
        faraSofer: toate.length - randuri.length,
      },
      camioane: iesire,
      // Pentru hartă: doar plăcuța, coordonatele și starea — atât cât să se
      // deseneze un punct colorat cu etichetă.
      pozitii: pozitii.map((p) => {
        const cam = randuri.find((c) => normalizeazaPlaca(c.plate) === normalizeazaPlaca(p.plate));
        const st = cam ? iesire.find((x) => x.placa === cam.plate)?.stare ?? 'liber' : 'liber';
        // Trei zecimale ≈ 100 m: destul pentru o hartă relativă, fără urmărire fină.
        return { placa: p.plate, lat: Math.round(p.lat * 1e3) / 1e3, lng: Math.round(p.lng * 1e3) / 1e3, stare: st };
      }),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[extern/camioane]', e);
    return NextResponse.json({ error: 'Flota nu poate fi citită acum' }, { status: 503 });
  }
}
