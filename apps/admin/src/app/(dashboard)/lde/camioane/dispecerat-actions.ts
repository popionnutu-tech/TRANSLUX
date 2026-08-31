'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, type Session } from '@/lib/auth';
import { poateAccesa } from '@/lib/lde/camioane-nav';
import { areSofer, coloanaKanban, urmatoareaStare, type KanbanColumn } from '@/lib/lde/camioane';
import { chisinauTodayIso } from '@/lib/chisinau-time';

export type Rezultat = { ok: true; mesaj: string } | { error: string };

export type CartonasCamion = {
  vehicleId: string;
  plate: string;
  fleetType: 'cisterna' | 'zernovoz' | null;
  driverName: string | null;
  coloana: KanbanColumn;
  kmIeri: number;
  stareMotiv: string | null;
  /** Următoarea cursă planificată (nu a început încă) — «următorul termen» din spec. */
  urmatoarea: { loadPlannedAt: string; de: string | null; la: string | null } | null;
  cursa: {
    id: string;
    status: string;
    urmatoareaStare: string | null;
    de: string | null;
    la: string | null;
    cargo: string | null;
    client: string | null;
    loadPlannedAt: string;
    unloadPlannedAt: string;
    /** Ora planificată de descărcare a trecut, dar cursa nu e încheiată manual. */
    intarziata: boolean;
  } | null;
};

const CALE = '/lde/camioane';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function cerereRol(): Promise<Session> {
  const s = await verifySession();
  if (!s || !poateAccesa(s.role, CALE)) throw new Error('Neautorizat');
  return s;
}

function eroareCurata(e: { message: string; code?: string }, implicit: string): string {
  if (e.code === '22P02') return 'Identificator invalid';
  console.error('[camioane/dispecerat]', e.code, e.message);
  return implicit;
}

/** Poza de ACUM a flotei: cine e în cursă, cine stă, cine n-are șofer dar merge. */
export async function getDispecerat(): Promise<{ cartonase: CartonasCamion[]; azi: string }> {
  await cerereRol();
  const sb = getSupabase();
  const azi = chisinauTodayIso();
  const ieri = (() => {
    const d = new Date(`${azi}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const acum = Date.now();

  const [vehRes, legRes, curseRes, stariRes, kmRes] = await Promise.all([
    sb.from('vehicles')
      .select('id, plate_number, lde_truck_profile ( fleet_type )')
      .eq('active', true).eq('is_lde', true).contains('directions', ['camioane']).order('plate_number'),
    sb.from('lde_active_assignments')
      .select('vehicle_id, drivers:driver_id ( full_name )').is('valid_to', null),
    // Cursa activă = DOAR după stare, nu după fereastra de timp. Stările le mută
    // omul, deci o cursă în «spre_descarcare» trăiește și după ora planificată —
    // e normal în transport. Cu filtru pe fereastră ea dispărea de pe tablou,
    // camionul apărea «liber» și nu mai putea fi încheiat (review 31.08, Critical).
    sb.from('lde_truck_trips')
      .select(`id, vehicle_id, status, cargo, client, load_planned_at, unload_planned_at,
               driver_id, load_point:load_point_id ( name ), unload_point:unload_point_id ( name ),
               driver:driver_id ( full_name )`)
      .not('status', 'in', '("incheiata","anulata")')
      .order('load_planned_at'),
    sb.from('lde_truck_day_states').select('vehicle_id, state, reason').eq('date', azi),
    // Km de IERI: lde_vehicle_gps_daily o scriu workerii de noapte pentru ziua
    // precedentă — pe „azi" ar fi mereu 0, iar semnalul «merge fără șofer» n-ar
    // porni niciodată (review 31.08, Critical).
    sb.from('lde_vehicle_gps_daily').select('vehicle_id, km_total').eq('date', ieri),
  ]);
  for (const r of [vehRes, legRes, curseRes, stariRes, kmRes]) {
    if (r.error) { console.error('[camioane/dispecerat]', r.error.message); throw new Error('Nu am putut citi starea flotei'); }
  }

  type Emb<T> = T | T[] | null;
  const unul = <T,>(x: Emb<T>): T | null => (Array.isArray(x) ? x[0] ?? null : x);

  type LegRow = { vehicle_id: string; drivers: Emb<{ full_name: string }> };
  const soferAtribuit = new Map<string, string>();
  for (const l of (legRes.data ?? []) as LegRow[]) {
    soferAtribuit.set(l.vehicle_id, unul(l.drivers)?.full_name ?? '—');
  }

  type CursaRow = {
    id: string; vehicle_id: string; status: string; cargo: string | null; client: string | null;
    load_planned_at: string; unload_planned_at: string; driver_id: string | null;
    load_point: Emb<{ name: string }>; unload_point: Emb<{ name: string }>; driver: Emb<{ full_name: string }>;
  };
  // Un camion poate avea mai multe curse deschise (una întârziată + una de mâine).
  // Pe cartonaș o arătăm pe cea începută deja, iar dintre ele pe cea mai veche —
  // ea e cursa care trebuie mișcată acum. Următoarea planificată o arătăm separat.
  const cursaCurenta = new Map<string, CursaRow>();
  const urmatoareaCursa = new Map<string, CursaRow>();
  for (const c of (curseRes.data ?? []) as CursaRow[]) {
    const inceputa = Date.parse(c.load_planned_at) <= acum;
    if (inceputa) {
      if (!cursaCurenta.has(c.vehicle_id)) cursaCurenta.set(c.vehicle_id, c);
    } else if (!urmatoareaCursa.has(c.vehicle_id)) {
      urmatoareaCursa.set(c.vehicle_id, c);
    }
  }

  type StareRow = { vehicle_id: string; state: 'reparatie' | 'odihna'; reason: string | null };
  const stari = new Map<string, StareRow>();
  for (const s of (stariRes.data ?? []) as StareRow[]) stari.set(s.vehicle_id, s);

  type KmRow = { vehicle_id: string; km_total: number | null };
  const km = new Map<string, number>();
  for (const k of (kmRes.data ?? []) as KmRow[]) km.set(k.vehicle_id, Number(k.km_total ?? 0));

  type VehRow = { id: string; plate_number: string; lde_truck_profile: Emb<{ fleet_type: string }> };
  const cartonase: CartonasCamion[] = [];
  for (const v of (vehRes.data ?? []) as VehRow[]) {
    const cursa = cursaCurenta.get(v.id) ?? null;
    const urmatoarea = urmatoareaCursa.get(v.id) ?? null;
    const stare = stari.get(v.id) ?? null;
    const kmIeri = km.get(v.id) ?? 0;
    const soferCursa = cursa ? unul(cursa.driver)?.full_name ?? null : null;
    // Pe o cursă activă, șoferul CURSEI e cel pe care-l sună dispecerul —
    // atribuirea permanentă din parc poate fi alta (review 31.08).
    const driverName = soferCursa ?? soferAtribuit.get(v.id) ?? null;

    const coloana = coloanaKanban({
      areSofer: areSofer({
        atribuireActiva: soferAtribuit.has(v.id),
        soferPeCursaActiva: !!(cursa && cursa.driver_id),
      }),
      kmAzi: kmIeri,
      stareZi: stare?.state ?? null,
      cursaActiva: !!cursa,
    });
    if (!coloana) continue; // fără șofer și fără km: nu lucrează, nu se ia în considerare

    cartonase.push({
      vehicleId: v.id,
      plate: v.plate_number,
      fleetType: (unul(v.lde_truck_profile)?.fleet_type as 'cisterna' | 'zernovoz' | undefined) ?? null,
      driverName,
      coloana,
      kmIeri,
      stareMotiv: stare?.reason ?? null,
      urmatoarea: urmatoarea ? {
        loadPlannedAt: urmatoarea.load_planned_at,
        de: unul(urmatoarea.load_point)?.name ?? null,
        la: unul(urmatoarea.unload_point)?.name ?? null,
      } : null,
      cursa: cursa ? {
        id: cursa.id,
        status: cursa.status,
        urmatoareaStare: urmatoareaStare(cursa.status),
        de: unul(cursa.load_point)?.name ?? null,
        la: unul(cursa.unload_point)?.name ?? null,
        cargo: cursa.cargo,
        client: cursa.client,
        loadPlannedAt: cursa.load_planned_at,
        unloadPlannedAt: cursa.unload_planned_at,
        intarziata: Date.parse(cursa.unload_planned_at) < acum,
      } : null,
    });
  }

  return { cartonase, azi };
}

/** Mutarea manuală a stării cursei din cartonaș (decizia Ion: manual, pas cu pas). */
export async function avanseazaCursa(tripId: string, status: string): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereRol(); } catch { return { error: 'Neautorizat' }; }
  if (!UUID_RE.test(tripId)) return { error: 'Identificator invalid' };

  const { data: cursa, error: eCitire } = await getSupabase()
    .from('lde_truck_trips').select('status').eq('id', tripId).maybeSingle();
  if (eCitire) return { error: eroareCurata(eCitire, 'Cursa nu a putut fi citită') };
  if (!cursa) return { error: 'Cursa nu există' };
  if (urmatoareaStare(cursa.status as string) !== status) {
    return { error: `Din «${cursa.status}» nu se poate trece direct în «${status}»` };
  }

  const { data, error } = await getSupabase().from('lde_truck_trips')
    .update({ status, updated_at: new Date().toISOString(), updated_by: s.email })
    .eq('id', tripId).eq('status', cursa.status).select('id');
  if (error) return { error: eroareCurata(error, 'Starea nu a putut fi schimbată') };
  if (!data || data.length === 0) return { error: 'Cursa a fost modificată între timp — reîmprospătează' };
  return { ok: true, mesaj: `Cursa a trecut în «${status}»` };
}
