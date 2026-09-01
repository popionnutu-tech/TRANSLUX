import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { alertAdmins, escapeHtml } from '@/lib/telegram-notify';
import { chisinauDayBounds, chisinauTodayIso } from '@/lib/chisinau-time';
import { incrucisari, mesajIncrucisare, type CursaDeAnalizat } from '@/lib/lde/decizii';

// Deciziile dispecerului, judecate post-factum pe cursele de ieri.
// Ion, 01.09: «камион из Бельц едет в Констанцу, а камион из Кишинёва — в
// Бердичев… программа лично отправляет мне оповещение».
//
// Se compară doar ce dispecerul chiar putea alege: aceeași zi, același tip de
// camion, ambele curse cu coordonate. Alerta spune kilometri, nu păreri.
//
// Trigger: crontab pe VPS-ul worker-ului GPS, după rulajul nocturn:
//   45 6 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//     https://central-hub-md.vercel.app/api/cron/lde-decizii-camioane
// Verificare fără trimitere: ?date=YYYY-MM-DD&dry=1

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ieriChisinau(): string {
  const d = new Date(`${chisinauTodayIso()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const cerut = url.searchParams.get('date') ?? '';
  const zi = DATE_RE.test(cerut) ? cerut : ieriChisinau();
  const dry = url.searchParams.get('dry') === '1';

  try {
    const sb = getSupabase();
    const { fromIso, toIso } = chisinauDayBounds(zi);

    // Cursele care AU PORNIT în ziua judecată. Cele anulate nu sunt decizii.
    const { data, error } = await sb.from('lde_truck_trips')
      .select(`id, vehicle_id, load_planned_at,
               vehicles:vehicle_id ( plate_number, lde_truck_profile ( fleet_type ) ),
               drivers:driver_id ( full_name ),
               load_point:load_point_id ( name, lat, lng )`)
      .gte('load_planned_at', fromIso)
      .lt('load_planned_at', toIso)
      .neq('status', 'anulata')
      .order('load_planned_at')
      .limit(500);
    if (error) {
      console.error('[decizii-camioane]', error.message);
      return NextResponse.json({ error: 'Nu am putut citi cursele' }, { status: 500 });
    }

    type Row = {
      id: string; vehicle_id: string; load_planned_at: string;
      vehicles: { plate_number: string; lde_truck_profile: { fleet_type: string } | { fleet_type: string }[] | null }
        | { plate_number: string; lde_truck_profile: { fleet_type: string } | { fleet_type: string }[] | null }[] | null;
      drivers: { full_name: string } | { full_name: string }[] | null;
      load_point: { name: string; lat: number | null; lng: number | null }
        | { name: string; lat: number | null; lng: number | null }[] | null;
    };
    const unu = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
    const randuri = (data ?? []) as Row[];

    if (randuri.length === 0) {
      return NextResponse.json({ zi, curse: 0, incrucisari: 0, trimis: false });
    }

    // De unde a plecat camionul: ultima oprire GPS ÎNAINTE de încărcare. Fără ea
    // n-avem cu ce compara, deci cursa iese din analiză — nu se ghicește o bază.
    type Stop = { vehicle_id: string; lat: number; lon: number; departure_at: string | null };
    // Citire PAGINATĂ: 39 de camioane × 4 zile dau ~1500 de opriri, peste plafonul
    // PostgREST. Ordinea descrescătoare ar fi aruncat tocmai plecările vechi —
    // adică bazele camioanelor care au stat pe loc, exact ce compară analiza.
    const idsCamioane = [...new Set(randuri.map((r) => r.vehicle_id))];
    const deLa = new Date(Date.parse(`${zi}T00:00:00Z`) - 3 * 86400e3).toISOString().slice(0, 10);
    const PAGINA = 1000;
    const MAX_PAGINI = 6;
    const opriri: Stop[] = [];
    let opririTaiate = false;
    for (let p = 0; p < MAX_PAGINI; p++) {
      const { data: pag, error: eOpriri } = await sb.from('lde_gps_stops')
        .select('vehicle_id, lat, lon, departure_at')
        .in('vehicle_id', idsCamioane)
        .gte('date', deLa)
        .lte('date', zi)
        .not('lat', 'is', null)
        .not('lon', 'is', null)
        .not('departure_at', 'is', null)
        .order('departure_at', { ascending: false })
        .order('id')
        .range(p * PAGINA, p * PAGINA + PAGINA - 1);
      if (eOpriri) { console.error('[decizii-camioane] opriri:', eOpriri.message); break; }
      const lot = (pag ?? []) as Stop[];
      opriri.push(...lot);
      if (lot.length < PAGINA) break;
      if (p === MAX_PAGINI - 1) {
        opririTaiate = true;
        console.error('[decizii-camioane] opririle au atins plafonul de pagini');
      }
    }
    // Opririle grupate pe camion, în ordinea în care au venit (departure_at desc).
    const opririPeCamion = new Map<string, Stop[]>();
    for (const s of opriri) {
      const l = opririPeCamion.get(s.vehicle_id);
      if (l) l.push(s); else opririPeCamion.set(s.vehicle_id, [s]);
    }

    /**
     * De unde a plecat camionul spre încărcare: ultima oprire ÎNCHEIATĂ înaintea
     * orei planificate. Fără condiția asta se lua cea mai recentă oprire din
     * fereastră — deseori una făcută DUPĂ încărcare, în drum. Distanța se măsura
     * atunci din mijlocul cursei, iar alerta pleca pe o diferență inventată
     * (review performanță, 01.09).
     */
    const plecareInainteDe = (vehicleId: string, loadAt: string): Stop | null => {
      const t = Date.parse(loadAt);
      if (!Number.isFinite(t)) return null;
      for (const s of opririPeCamion.get(vehicleId) ?? []) {
        if (s.departure_at && Date.parse(s.departure_at) <= t) return s;
      }
      return null;
    };

    const curse: CursaDeAnalizat[] = randuri.map((r) => {
      const veh = unu(r.vehicles);
      const prof = veh ? unu(veh.lde_truck_profile) : null;
      const pct = unu(r.load_point);
      const stop = plecareInainteDe(r.vehicle_id, r.load_planned_at);
      return {
        id: r.id,
        vehicleId: r.vehicle_id,
        plate: veh?.plate_number ?? '—',
        plecare: stop ? { lat: Number(stop.lat), lng: Number(stop.lon) } : null,
        incarcare: pct && pct.lat !== null && pct.lng !== null ? { lat: pct.lat, lng: pct.lng } : null,
        incarcareNume: pct?.name ?? 'punct fără nume',
        loadPlannedAt: r.load_planned_at,
        fleetType: prof?.fleet_type ?? null,
        sofer: unu(r.drivers)?.full_name ?? null,
      };
    });

    const gasite = incrucisari(curse);
    const text = mesajIncrucisare(zi, gasite);

    // Fără găsiri nu se trimite nimic: o alertă zilnică «totul e bine» ar fi
    // ignorată în două săptămâni, și cu ea ar fi ignorate și cele reale.
    let trimis = false;
    // Telegram refuză peste 4096 de octeți și alerta s-ar pierde tăcut.
    const textScurt = text.length > 3500 ? `${text.slice(0, 3500)}\n… (listă tăiată)` : text;
    if (text && !dry) trimis = await alertAdmins(escapeHtml(textScurt));

    return NextResponse.json({
      zi,
      curse: curse.length,
      cuCoordonate: curse.filter((c) => c.plecare && c.incarcare).length,
      incrucisari: gasite.length,
      kmEconomisibili: gasite.reduce((s, x) => s + x.kmEconomisiti, 0),
      opririTaiate,
      trimis,
      dry,
      text: dry ? text : undefined,
    });
  } catch (e) {
    console.error('[decizii-camioane]', e);
    return NextResponse.json({ error: 'Analiza a eșuat' }, { status: 500 });
  }
}
