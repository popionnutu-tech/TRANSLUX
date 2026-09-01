'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, type Session } from '@/lib/auth';
import { poateAccesa, poateScrie } from '@/lib/lde/camioane-nav';
import { seSuprapune, urmatoareaStare, type TripWindow } from '@/lib/lde/camioane';
import { poateFiMutata } from '@/lib/lde/banda';
import { chisinauDayBounds } from '@/lib/chisinau-time';

export type Rezultat = { ok: true; mesaj: string } | { error: string };

export type Camion = {
  id: string;
  plate: string;
  fleetType: 'cisterna' | 'zernovoz' | null;
  driverId: string | null;
  driverName: string | null;
};

export type Cursa = {
  id: string;
  vehicleId: string;
  driverId: string | null;
  cargo: string | null;
  client: string | null;
  loadPointId: string | null;
  loadPointName: string | null;
  loadPlannedAt: string;
  unloadPointId: string | null;
  unloadPointName: string | null;
  unloadPlannedAt: string;
  status: string;
  notes: string | null;
};

export type StareZi = {
  id: string;
  vehicleId: string;
  date: string;
  state: 'reparatie' | 'odihna';
  reason: string | null;
  expectedEnd: string | null;
};

export type PunctScurt = { id: string; name: string; hasCoords: boolean; lat: number | null; lng: number | null };
export type SoferScurt = { id: string; name: string };

const CALE = '/lde/camioane/planificare';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 300;

/** Mesajele Postgres brute scurg nume de coloane și constrângeri — nu ies spre client. */
function eroareCurata(e: { message: string; code?: string }, implicit: string): string {
  // 23P01 = constrângerea EXCLUDE din migrația 301 (cineva a salvat între citirea
  // vecinilor și scrierea noastră). Mesajul trebuie să rămână omenesc.
  if (e.code === '23P01') return 'Camionul a primit între timp o cursă în acest interval — reîmprospătează pagina';
  if (e.code === '22P02') return 'Identificator invalid';
  if (e.code === '23503') return 'Punctul sau șoferul ales nu mai există';
  console.error('[camioane/planificare]', e.code, e.message);
  return implicit;
}

const taie = (v: string | null | undefined) => (v?.trim() || null)?.slice(0, MAX_TEXT) ?? null;

async function cerereRol(): Promise<Session> {
  const s = await verifySession();
  if (!s || !poateAccesa(s.role, CALE)) throw new Error('Neautorizat');
  return s;
}

/**
 * Ca `cerereRol`, dar cere ȘI dreptul de scriere. A vedea un ecran și a-l
 * modifica sunt drepturi diferite: OBSERVATOR intră pe bandă, dar nu scrie nimic.
 */
async function cerereScriere(): Promise<Session> {
  const s = await cerereRol();
  if (!poateScrie(s.role)) throw new Error('Neautorizat');
  return s;
}

/** Camioanele flotei: discriminatorul rămâne directions @> {camioane} — de el
 *  depinde și workerul Wialon. Tipul (cisternă/zernovoz) vine din profilul separat. */
async function camioane(): Promise<Camion[]> {
  const sb = getSupabase();
  const [vehRes, legRes] = await Promise.all([
    sb.from('vehicles')
      .select('id, plate_number, lde_truck_profile ( fleet_type )')
      .eq('active', true).eq('is_lde', true).contains('directions', ['camioane']).order('plate_number'),
    sb.from('lde_active_assignments')
      .select('vehicle_id, driver_id, drivers:driver_id ( full_name )')
      .is('valid_to', null),
  ]);
  for (const r of [vehRes, legRes]) if (r.error) { console.error('[camioane]', r.error.message); throw new Error('Nu am putut citi flota'); }

  type LegRow = { vehicle_id: string; driver_id: string; drivers: { full_name: string } | { full_name: string }[] | null };
  const soferi = new Map<string, { id: string; name: string }>();
  for (const l of (legRes.data ?? []) as LegRow[]) {
    const d = Array.isArray(l.drivers) ? l.drivers[0] : l.drivers;
    soferi.set(l.vehicle_id, { id: l.driver_id, name: d?.full_name ?? '—' });
  }

  type VehRow = { id: string; plate_number: string; lde_truck_profile: { fleet_type: string } | { fleet_type: string }[] | null };
  return ((vehRes.data ?? []) as VehRow[]).map((v) => {
    const p = Array.isArray(v.lde_truck_profile) ? v.lde_truck_profile[0] : v.lde_truck_profile;
    const s = soferi.get(v.id) ?? null;
    return {
      id: v.id,
      plate: v.plate_number,
      fleetType: (p?.fleet_type as 'cisterna' | 'zernovoz' | undefined) ?? null,
      driverId: s?.id ?? null,
      driverName: s?.name ?? null,
    };
  });
}

/** Cursele care ating fereastra [from, to] — o cursă multi-zi începută înainte
 *  trebuie să apară în grilă, deci filtrul e pe suprapunere, nu pe data de start.
 *  `taiat` = selecția a atins plafonul PostgREST și ultimele zile lipsesc. */
async function curseInFereastra(fromIso: string, toIso: string): Promise<{ curse: Cursa[]; taiat: boolean }> {
  const { data, error } = await getSupabase()
    .from('lde_truck_trips')
    .select(`id, vehicle_id, driver_id, cargo, client, status, notes,
             load_point_id, load_planned_at, unload_point_id, unload_planned_at,
             load_point:load_point_id ( name ), unload_point:unload_point_id ( name )`)
    // toIso e exclusiv (începutul zilei următoare) — de aceea .lt, nu .lte.
    .lt('load_planned_at', toIso)
    .gte('unload_planned_at', fromIso)
    .neq('status', 'anulata')
    .order('load_planned_at')
    // PostgREST taie TĂCUT la 1000 și `.limit()` nu ridică plafonul (db-max-rows).
    // La 39 de camioane și o cursă pe zi, pragul se atinge din ziua 26 — de aceea
    // tăierea se DETECTEAZĂ, nu se speră că nu vine (review performanță, 01.09).
    .limit(1000);
  if (error) { console.error('[camioane]', error.message); throw new Error('Nu am putut citi cursele'); }
  const taiat = (data ?? []).length >= 1000;
  if (taiat) console.error('[camioane] fereastra a atins plafonul de 1000 de curse — ultimele zile lipsesc');

  type Row = {
    id: string; vehicle_id: string; driver_id: string | null; cargo: string | null; client: string | null;
    status: string; notes: string | null; load_point_id: string | null; load_planned_at: string;
    unload_point_id: string | null; unload_planned_at: string;
    load_point: { name: string } | { name: string }[] | null;
    unload_point: { name: string } | { name: string }[] | null;
  };
  const nume = (x: Row['load_point']) => (Array.isArray(x) ? x[0]?.name : x?.name) ?? null;

  const curse = ((data ?? []) as Row[]).map((t) => ({
    id: t.id,
    vehicleId: t.vehicle_id,
    driverId: t.driver_id,
    cargo: t.cargo,
    client: t.client,
    loadPointId: t.load_point_id,
    loadPointName: nume(t.load_point),
    loadPlannedAt: t.load_planned_at,
    unloadPointId: t.unload_point_id,
    unloadPointName: nume(t.unload_point),
    unloadPlannedAt: t.unload_planned_at,
    status: t.status,
    notes: t.notes,
  }));
  return { curse, taiat };
}

export async function getPlanificare(fromDate: string, zile: number): Promise<{
  from: string; zile: string[]; camioane: Camion[]; curse: Cursa[]; stari: StareZi[];
  puncte: PunctScurt[]; soferi: SoferScurt[]; taiat: boolean;
}> {
  await cerereRol();
  const sb = getSupabase();

  const listaZile: string[] = [];
  const d = new Date(`${fromDate}T12:00:00Z`);
  for (let i = 0; i < zile; i++) {
    listaZile.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  // Bornele vin din convenția unică LDE (DST-aware): un offset fix +03:00 tăia
  // iarna ultima oră a ferestrei, iar cursa planificată la 23:30 dispărea tăcut
  // din grilă (review 31.08).
  const fromIso = chisinauDayBounds(listaZile[0]).fromIso;
  const toIso = chisinauDayBounds(listaZile[listaZile.length - 1]).toIso;

  const [cam, curseRes, stariRes, puncteRes, soferiRes] = await Promise.all([
    camioane(),
    curseInFereastra(fromIso, toIso),
    // Plafon explicit + ordine stabilă: 39 de camioane × 21 de zile dau 819 rânduri,
    // aproape de pragul PostgREST. Fără `order`, o tăiere ar da un set diferit la
    // fiecare reîncărcare — reparații care apar și dispar (review perf, 01.09).
    sb.from('lde_truck_day_states')
      .select('id, vehicle_id, date, state, reason, expected_end')
      .order('date').order('vehicle_id').limit(1000)
      .gte('date', listaZile[0]).lte('date', listaZile[listaZile.length - 1]),
    sb.from('lde_dispatch_points').select('id, name, lat, lng').eq('active', true).order('name'),
    // Șoferii de camioane NU sunt marcați prin directions (verificat pe prod:
    // toți cei 16 au directions gol) — legătura reală e atribuirea activă la un
    // camion. Filtrul pe directions golea complet selectorul.
    sb.from('lde_active_assignments')
      .select('driver_id, drivers:driver_id ( id, full_name ), vehicles:vehicle_id ( directions )')
      .is('valid_to', null),
  ]);
  for (const r of [stariRes, puncteRes, soferiRes]) if (r.error) { console.error('[camioane]', r.error.message); throw new Error('Nu am putut citi planificarea'); }

  type StareRow = { id: string; vehicle_id: string; date: string; state: 'reparatie' | 'odihna'; reason: string | null; expected_end: string | null };
  type PunctRow = { id: string; name: string; lat: number | null; lng: number | null };
  type SoferRow = {
    driver_id: string;
    drivers: { id: string; full_name: string } | { id: string; full_name: string }[] | null;
    vehicles: { directions: string[] | null } | { directions: string[] | null }[] | null;
  };

  return {
    from: listaZile[0],
    zile: listaZile,
    camioane: cam,
    curse: curseRes.curse,
    taiat: curseRes.taiat,
    stari: ((stariRes.data ?? []) as StareRow[]).map((s) => ({
      id: s.id, vehicleId: s.vehicle_id, date: s.date, state: s.state,
      reason: s.reason, expectedEnd: s.expected_end,
    })),
    puncte: ((puncteRes.data ?? []) as PunctRow[]).map((p) => ({
      id: p.id, name: p.name, hasCoords: p.lat !== null && p.lng !== null, lat: p.lat, lng: p.lng,
    })),
    soferi: (() => {
      const unul = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
      const m = new Map<string, string>();
      for (const r of (soferiRes.data ?? []) as SoferRow[]) {
        const dirs = unul(r.vehicles)?.directions ?? [];
        if (!dirs.includes('camioane')) continue;
        const d = unul(r.drivers);
        if (d) m.set(d.id, d.full_name);
      }
      return [...m.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ro'));
    })(),
  };
}

async function esteCamion(vehicleId: string): Promise<boolean> {
  // Scope-check pe date, nu doar pe rol: acțiunea nu are voie să atingă un autobuz.
  const { data } = await getSupabase().from('vehicles')
    .select('id').eq('id', vehicleId).eq('active', true).eq('is_lde', true)
    .contains('directions', ['camioane']).maybeSingle();
  return !!data;
}

export type CursaInput = {
  id?: string;
  vehicleId: string;
  driverId: string | null;
  cargo: string | null;
  client: string | null;
  loadPointId: string;
  loadPlannedAt: string;
  unloadPointId: string;
  unloadPlannedAt: string;
  notes: string | null;
};

export async function salveazaCursa(input: CursaInput): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereScriere(); } catch { return { error: 'Neautorizat' }; }

  if (!UUID_RE.test(input.vehicleId)) return { error: 'Alege camionul' };
  if (input.id && !UUID_RE.test(input.id)) return { error: 'Identificator invalid' };
  if (input.driverId && !UUID_RE.test(input.driverId)) return { error: 'Șofer invalid' };
  if (!UUID_RE.test(input.loadPointId) || !UUID_RE.test(input.unloadPointId)) {
    return { error: 'Alege punctul de încărcare și cel de descărcare' };
  }
  if (!Number.isFinite(Date.parse(input.loadPlannedAt)) || !Number.isFinite(Date.parse(input.unloadPlannedAt))) {
    return { error: 'Data sau ora nu e validă' };
  }
  if (!input.loadPointId || !input.unloadPointId) return { error: 'Alege punctul de încărcare și cel de descărcare' };
  if (!input.loadPlannedAt || !input.unloadPlannedAt) return { error: 'Pune data și ora pentru încărcare și descărcare' };
  if (Date.parse(input.unloadPlannedAt) < Date.parse(input.loadPlannedAt)) {
    return { error: 'Descărcarea nu poate fi înaintea încărcării' };
  }
  if (!(await esteCamion(input.vehicleId))) return { error: 'Mașina aleasă nu e camion din flota LDE' };

  // Aceeași poartă ca la `mutaCursa`: tabela are DOUĂ drumuri de scriere spre
  // `vehicle_id` și ferestrele planificate, iar poarta stătea doar pe unul.
  // Prin editare, o cursă întârziată putea fi rescrisă ca punctuală — exact
  // cifra din Analitică pe care o citește administratorul (security review, 01.09).
  if (input.id) {
    const { data: veche, error: eVeche } = await getSupabase().from('lde_truck_trips')
      .select('status, vehicle_id, load_planned_at, unload_planned_at').eq('id', input.id).maybeSingle();
    if (eVeche) return { error: eroareCurata(eVeche, 'Cursa nu a putut fi citită') };
    if (!veche) return { error: 'Cursa nu mai există — reîmprospătează pagina' };
    if (!poateFiMutata(veche.status as string)) {
      const schimbatCamion = veche.vehicle_id !== input.vehicleId;
      const schimbatPlan = Date.parse(veche.load_planned_at as string) !== Date.parse(input.loadPlannedAt)
        || Date.parse(veche.unload_planned_at as string) !== Date.parse(input.unloadPlannedAt);
      if (schimbatCamion || schimbatPlan) {
        return {
          error: `Cursa e în «${veche.status}»: marfa, clientul și nota se pot corecta, `
            + 'dar camionul și orele planificate nu se mai schimbă — din ele se calculează punctualitatea.',
        };
      }
    }
  }

  // Suprapunerea se verifică ȘI pe server, nu doar în formular: două file deschise
  // pot salva simultan.
  const { data: vecine, error: eVecine } = await getSupabase()
    .from('lde_truck_trips')
    .select('id, vehicle_id, load_planned_at, unload_planned_at, status')
    .eq('vehicle_id', input.vehicleId)
    .neq('status', 'anulata')
    .lte('load_planned_at', input.unloadPlannedAt)
    .gte('unload_planned_at', input.loadPlannedAt);
  if (eVecine) return { error: eVecine.message };

  type W = { id: string; vehicle_id: string; load_planned_at: string; unload_planned_at: string; status: string };
  const ferestre: TripWindow[] = ((vecine ?? []) as W[]).map((t) => ({
    id: t.id, vehicleId: t.vehicle_id, loadAt: t.load_planned_at, unloadAt: t.unload_planned_at, status: t.status,
  }));
  const conflict = seSuprapune(
    { id: input.id, vehicleId: input.vehicleId, loadAt: input.loadPlannedAt, unloadAt: input.unloadPlannedAt },
    ferestre,
  );
  if (conflict) {
    const de = new Date(conflict.loadAt).toLocaleString('ro-MD', { timeZone: 'Europe/Chisinau' });
    const la = new Date(conflict.unloadAt).toLocaleString('ro-MD', { timeZone: 'Europe/Chisinau' });
    return { error: `Camionul are deja o cursă în acest interval (${de} → ${la})` };
  }

  const camp = {
    vehicle_id: input.vehicleId,
    driver_id: input.driverId,
    cargo: taie(input.cargo),
    client: taie(input.client),
    load_point_id: input.loadPointId,
    load_planned_at: input.loadPlannedAt,
    unload_point_id: input.unloadPointId,
    unload_planned_at: input.unloadPlannedAt,
    notes: taie(input.notes),
  };

  const sb = getSupabase();
  if (input.id) {
    const { data, error } = await sb.from('lde_truck_trips')
      .update({ ...camp, updated_at: new Date().toISOString(), updated_by: s.email })
      .eq('id', input.id).select('id');
    if (error) return { error: eroareCurata(error, 'Cursa nu a putut fi salvată') };
    if (!data || data.length === 0) return { error: 'Cursa nu mai există — poate a fost ștearsă între timp' };
    return { ok: true, mesaj: 'Cursa a fost salvată' };
  }
  const { error } = await sb.from('lde_truck_trips')
    .insert({ ...camp, created_by: s.email, updated_by: s.email });
  if (error) return { error: eroareCurata(error, 'Cursa nu a putut fi planificată') };
  return { ok: true, mesaj: 'Cursa a fost planificată' };
}

/**
 * Mută cursa: altă zi, alt camion, sau capetele întinse. Cheamă banda de timp,
 * unde gestul e o tragere de maus — celelalte câmpuri (marfă, puncte, client)
 * rămân cum erau, altfel fiecare mutare ar cere reintroducerea lor.
 * Aceleași verificări ca la salvare: camion din flotă și fără suprapunere.
 */
export async function mutaCursa(input: {
  id: string; vehicleId: string; loadPlannedAt: string; unloadPlannedAt: string;
}): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereScriere(); } catch { return { error: 'Neautorizat' }; }
  if (!UUID_RE.test(input.id)) return { error: 'Identificator invalid' };
  if (!UUID_RE.test(input.vehicleId)) return { error: 'Camion invalid' };
  if (!Number.isFinite(Date.parse(input.loadPlannedAt)) || !Number.isFinite(Date.parse(input.unloadPlannedAt))) {
    return { error: 'Data sau ora nu e validă' };
  }
  if (Date.parse(input.unloadPlannedAt) < Date.parse(input.loadPlannedAt)) {
    return { error: 'Descărcarea nu poate fi înaintea încărcării' };
  }
  if (!(await esteCamion(input.vehicleId))) return { error: 'Mașina aleasă nu e camion din flota LDE' };

  const sb = getSupabase();
  const { data: cursa, error: eCursa } = await sb.from('lde_truck_trips')
    .select('id, status, vehicle_id').eq('id', input.id).maybeSingle();
  if (eCursa) return { error: eroareCurata(eCursa, 'Cursa nu a putut fi citită') };
  if (!cursa) return { error: 'Cursa nu mai există — reîmprospătează pagina' };

  // Cursa pornită NU se mută. Workerul de noapte măsoară kilometrii și
  // punctualitatea din fereastra planificată și din GPS-ul camionului: mutarea
  // unei curse deja plecate ar rescrie tăcut cifrele pe altă mașină sau pe alt
  // interval (review arhitectură + audit business, 01.09). Se anulează cu motiv
  // și se replanifică — istoricul rămâne.
  if (!poateFiMutata(cursa.status as string)) {
    return {
      error: cursa.status === 'anulata'
        ? 'Cursa e anulată și nu se mai mută'
        : `Cursa e deja în «${cursa.status}» — nu se mai mută. Anuleaz-o cu motiv și planifică alta.`,
    };
  }

  // Marfa nu trece dintr-un tip de camion în altul: motorina nu intră în zernovoz.
  if (cursa.vehicle_id !== input.vehicleId) {
    const { data: tipuri, error: eTip } = await sb.from('lde_truck_profile')
      .select('vehicle_id, fleet_type').in('vehicle_id', [cursa.vehicle_id as string, input.vehicleId]);
    if (eTip) return { error: eroareCurata(eTip, 'Nu am putut citi tipul camioanelor') };
    type Tip = { vehicle_id: string; fleet_type: string | null };
    const dinTip = ((tipuri ?? []) as Tip[]).find((t) => t.vehicle_id === cursa.vehicle_id)?.fleet_type ?? null;
    const inTip = ((tipuri ?? []) as Tip[]).find((t) => t.vehicle_id === input.vehicleId)?.fleet_type ?? null;
    if (dinTip && inTip && dinTip !== inTip) {
      return { error: `Cursa e de pe un camion ${dinTip} — nu se mută pe un ${inTip}` };
    }
  }

  const { data: vecine, error: eVecine } = await sb.from('lde_truck_trips')
    .select('id, vehicle_id, load_planned_at, unload_planned_at, status')
    .eq('vehicle_id', input.vehicleId)
    .neq('status', 'anulata')
    .lte('load_planned_at', input.unloadPlannedAt)
    .gte('unload_planned_at', input.loadPlannedAt);
  if (eVecine) return { error: eroareCurata(eVecine, 'Nu am putut verifica intervalul') };

  type W = { id: string; vehicle_id: string; load_planned_at: string; unload_planned_at: string; status: string };
  const conflict = seSuprapune(
    { id: input.id, vehicleId: input.vehicleId, loadAt: input.loadPlannedAt, unloadAt: input.unloadPlannedAt },
    ((vecine ?? []) as W[]).map((t) => ({
      id: t.id, vehicleId: t.vehicle_id, loadAt: t.load_planned_at, unloadAt: t.unload_planned_at, status: t.status,
    })),
  );
  if (conflict) {
    const de = new Date(conflict.loadAt).toLocaleString('ro-MD', { timeZone: 'Europe/Chisinau' });
    const la = new Date(conflict.unloadAt).toLocaleString('ro-MD', { timeZone: 'Europe/Chisinau' });
    return { error: `Camionul are deja o cursă în acest interval (${de} → ${la})` };
  }

  const { data, error } = await sb.from('lde_truck_trips')
    .update({
      vehicle_id: input.vehicleId,
      load_planned_at: input.loadPlannedAt,
      unload_planned_at: input.unloadPlannedAt,
      updated_at: new Date().toISOString(),
      updated_by: s.email,
    })
    .eq('id', input.id).select('id');
  if (error) return { error: eroareCurata(error, 'Cursa nu a putut fi mutată') };
  if (!data || data.length === 0) return { error: 'Cursa nu mai există — reîmprospătează pagina' };
  return { ok: true, mesaj: 'Cursa a fost mutată' };
}

export async function anuleazaCursa(id: string, motiv: string): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereScriere(); } catch { return { error: 'Neautorizat' }; }
  if (!UUID_RE.test(id)) return { error: 'Identificator invalid' };
  if (!motiv.trim()) return { error: 'Scrie motivul anulării' };
  // Cursele nu se șterg: analitica are nevoie de istoric.
  const { data, error } = await getSupabase().from('lde_truck_trips')
    .update({ status: 'anulata', cancel_reason: taie(motiv), updated_at: new Date().toISOString(), updated_by: s.email })
    .eq('id', id).neq('status', 'anulata').select('id');
  if (error) return { error: eroareCurata(error, 'Cursa nu a putut fi anulată') };
  // Supabase întoarce error=null și pe 0 rânduri: fără verificare, UI-ul ar raporta
  // succes pentru o cursă inexistentă.
  if (!data || data.length === 0) return { error: 'Cursa nu există sau a fost deja anulată' };
  return { ok: true, mesaj: 'Cursa a fost anulată' };
}

export async function schimbaStareaCursei(id: string, status: string): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereScriere(); } catch { return { error: 'Neautorizat' }; }
  if (!UUID_RE.test(id)) return { error: 'Identificator invalid' };
  const { data: cursa, error: eCitire } = await getSupabase()
    .from('lde_truck_trips').select('status').eq('id', id).maybeSingle();
  if (eCitire) return { error: eroareCurata(eCitire, 'Cursa nu a putut fi citită') };
  if (!cursa) return { error: 'Cursa nu există' };
  // Stările se mută pas cu pas (decizia Ion: manual, dar fără sărituri peste etape).
  if (urmatoareaStare(cursa.status as string) !== status) {
    return { error: `Din «${cursa.status}» nu se poate trece direct în «${status}»` };
  }
  const { error } = await getSupabase().from('lde_truck_trips')
    .update({ status, updated_at: new Date().toISOString(), updated_by: s.email })
    .eq('id', id);
  if (error) return { error: eroareCurata(error, 'Starea nu a putut fi schimbată') };
  return { ok: true, mesaj: `Cursa a trecut în «${status}»` };
}

/** Tipul camionului (cisternă/zernovoz). Fără el gruparea din grilă e decorativă. */
export async function seteazaTipCamion(vehicleId: string, fleetType: 'cisterna' | 'zernovoz'): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereScriere(); } catch { return { error: 'Neautorizat' }; }
  if (!(await esteCamion(vehicleId))) return { error: 'Mașina aleasă nu e camion din flota LDE' };
  const { error } = await getSupabase().from('lde_truck_profile')
    .upsert({ vehicle_id: vehicleId, fleet_type: fleetType, updated_at: new Date().toISOString(), updated_by: s.email },
      { onConflict: 'vehicle_id' });
  if (error) return { error: eroareCurata(error, 'Tipul nu a putut fi salvat') };
  return { ok: true, mesaj: `Tip setat: ${fleetType === 'cisterna' ? 'cisternă' : 'zernovoz'}` };
}

// `seteazaStareZi` (o singură zi) a fost ștearsă odată cu contopirea: butonul «+»
// din bandă dă întotdeauna o PERIOADĂ, iar textul ei de avertisment devenise fals
// după așezarea barelor pe benzi (starea nu se mai ascunde sub bară).

/**
 * Reparație sau odihnă pe o PERIOADĂ. Ion, 01.09: butonul «+» din bandă deschide
 * și asta, iar perioada se dă o dată — nu se bifează fiecare zi separat.
 */
export async function seteazaStarePerioada(input: {
  vehicleId: string; de: string; pana: string; state: 'reparatie' | 'odihna'; reason: string | null;
}): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereScriere(); } catch { return { error: 'Neautorizat' }; }
  if (!UUID_RE.test(input.vehicleId)) return { error: 'Camion invalid' };
  if (input.state !== 'reparatie' && input.state !== 'odihna') return { error: 'Stare necunoscută' };
  const ZI = /^\d{4}-\d{2}-\d{2}$/;
  if (!ZI.test(input.de) || !ZI.test(input.pana)) return { error: 'Perioada nu e validă' };
  // Formatul nu garantează o zi din calendar: «9999-99-99» trece regexul, iar
  // `toISOString()` de mai jos ar arunca RangeError (security review, 01.09).
  if (!Number.isFinite(Date.parse(`${input.de}T12:00:00Z`))
      || !Number.isFinite(Date.parse(`${input.pana}T12:00:00Z`))) {
    return { error: 'Perioada nu e validă' };
  }
  if (input.pana < input.de) return { error: 'Ultima zi nu poate fi înaintea primei' };
  if (!(await esteCamion(input.vehicleId))) return { error: 'Mașina aleasă nu e camion din flota LDE' };

  // Plafon explicit: o perioadă din formular nu are de ce să depășească un trimestru,
  // iar fără el un interval greșit ar scrie mii de rânduri.
  const zile: string[] = [];
  const d = new Date(`${input.de}T12:00:00Z`);
  for (let i = 0; i < 92; i++) {
    const zi = d.toISOString().slice(0, 10);
    zile.push(zi);
    if (zi === input.pana) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  if (zile[zile.length - 1] !== input.pana) return { error: 'Perioada e prea lungă (maxim 92 de zile)' };

  // Avertismentul care exista pe o zi singură nu se pierde pe perioadă: camionul
  // poate intra în reparație în mijlocul unei curse, dar dispecerul trebuie să afle.
  const { fromIso } = chisinauDayBounds(input.de);
  const { toIso } = chisinauDayBounds(input.pana);
  const { data: peste } = await getSupabase().from('lde_truck_trips')
    .select('id').eq('vehicle_id', input.vehicleId).neq('status', 'anulata')
    .lt('load_planned_at', toIso).gte('unload_planned_at', fromIso).limit(1);
  const avertisment = peste && peste.length > 0
    ? ' Atenție: în această perioadă camionul are o cursă planificată — ea rămâne pe bandă.'
    : '';

  const { error } = await getSupabase().from('lde_truck_day_states')
    .upsert(
      zile.map((zi) => ({
        vehicle_id: input.vehicleId,
        date: zi,
        state: input.state,
        reason: taie(input.reason),
        expected_end: input.pana,
        created_by: s.email,
      })),
      { onConflict: 'vehicle_id,date' },
    );
  if (error) return { error: eroareCurata(error, 'Perioada nu a putut fi salvată') };

  const eticheta = input.state === 'reparatie' ? 'la reparație' : 'în odihnă';
  return {
    ok: true,
    mesaj: (zile.length === 1
      ? `Marcat ${eticheta} pe ${input.de}`
      : `Marcat ${eticheta}, ${zile.length} zile (${input.de} → ${input.pana})`) + avertisment,
  };
}

/** Scoate starea de pe TOATE zilele unui interval — simetric cu marcarea pe perioadă. */
export async function stergeStarePerioada(vehicleId: string, de: string, pana: string): Promise<Rezultat> {
  try { await cerereScriere(); } catch { return { error: 'Neautorizat' }; }
  if (!UUID_RE.test(vehicleId)) return { error: 'Camion invalid' };
  const ZI = /^\d{4}-\d{2}-\d{2}$/;
  if (!ZI.test(de) || !ZI.test(pana) || pana < de) return { error: 'Perioada nu e validă' };
  // Același plafon ca la scriere: fără el, `0001-01-01 → 9999-12-31` golea tot
  // istoricul de stări al camionului dintr-un apel (security review, 01.09).
  const zileInterval = Math.round((Date.parse(`${pana}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000) + 1;
  if (!Number.isFinite(zileInterval)) return { error: 'Perioada nu e validă' };
  if (zileInterval > 92) return { error: 'Perioada e prea lungă (maxim 92 de zile)' };
  if (!(await esteCamion(vehicleId))) return { error: 'Mașina aleasă nu e camion din flota LDE' };

  const { data, error } = await getSupabase().from('lde_truck_day_states')
    .delete().eq('vehicle_id', vehicleId).gte('date', de).lte('date', pana).select('id');
  if (error) return { error: eroareCurata(error, 'Perioada nu a putut fi ștearsă') };
  if (!data || data.length === 0) return { error: 'Nu era nicio stare în acest interval' };
  return { ok: true, mesaj: `Scoase ${data.length} ${data.length === 1 ? 'zi' : 'zile'}` };
}

export async function stergeStareZi(vehicleId: string, date: string): Promise<Rezultat> {
  try { await cerereScriere(); } catch { return { error: 'Neautorizat' }; }
  if (!(await esteCamion(vehicleId))) return { error: 'Mașina aleasă nu e camion din flota LDE' };
  const { data, error } = await getSupabase().from('lde_truck_day_states')
    .delete().eq('vehicle_id', vehicleId).eq('date', date).select('id');
  if (error) return { error: eroareCurata(error, 'Starea nu a putut fi ștearsă') };
  if (!data || data.length === 0) return { error: 'Nu era nicio stare pe această zi' };
  return { ok: true, mesaj: 'Starea a fost ștearsă' };
}

// Atribuirea șoferului pe camion NU mai stă aici: Ion, 01.09 — «распределение
// водителя идёт только в номенклатуру авто». A trecut în fila Flotă, împreună cu
// nomenclatorul șoferilor de camion (apps/.../camioane/flota/actions.ts).
