'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, type Session } from '@/lib/auth';
import { poateAccesa } from '@/lib/lde/camioane-nav';
import { seSuprapune, urmatoareaStare, type TripWindow } from '@/lib/lde/camioane';
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
 *  trebuie să apară în grilă, deci filtrul e pe suprapunere, nu pe data de start. */
async function curseInFereastra(fromIso: string, toIso: string): Promise<Cursa[]> {
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
    // PostgREST taie TĂCUT la 1000: la 14 zile × 39 camioane ferestrele reale dau
    // ~150 curse, dar limita explicită face plafonul vizibil dacă cineva mărește ZILE.
    .limit(1000);
  if (error) { console.error('[camioane]', error.message); throw new Error('Nu am putut citi cursele'); }

  type Row = {
    id: string; vehicle_id: string; driver_id: string | null; cargo: string | null; client: string | null;
    status: string; notes: string | null; load_point_id: string | null; load_planned_at: string;
    unload_point_id: string | null; unload_planned_at: string;
    load_point: { name: string } | { name: string }[] | null;
    unload_point: { name: string } | { name: string }[] | null;
  };
  const nume = (x: Row['load_point']) => (Array.isArray(x) ? x[0]?.name : x?.name) ?? null;

  return ((data ?? []) as Row[]).map((t) => ({
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
}

export async function getPlanificare(fromDate: string, zile: number): Promise<{
  from: string; zile: string[]; camioane: Camion[]; curse: Cursa[]; stari: StareZi[];
  puncte: PunctScurt[]; soferi: SoferScurt[];
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

  const [cam, curse, stariRes, puncteRes, soferiRes] = await Promise.all([
    camioane(),
    curseInFereastra(fromIso, toIso),
    sb.from('lde_truck_day_states')
      .select('id, vehicle_id, date, state, reason, expected_end')
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
    curse,
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
  try { s = await cerereRol(); } catch { return { error: 'Neautorizat' }; }

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

export async function anuleazaCursa(id: string, motiv: string): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereRol(); } catch { return { error: 'Neautorizat' }; }
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
  try { s = await cerereRol(); } catch { return { error: 'Neautorizat' }; }
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
  try { s = await cerereRol(); } catch { return { error: 'Neautorizat' }; }
  if (!(await esteCamion(vehicleId))) return { error: 'Mașina aleasă nu e camion din flota LDE' };
  const { error } = await getSupabase().from('lde_truck_profile')
    .upsert({ vehicle_id: vehicleId, fleet_type: fleetType, updated_at: new Date().toISOString(), updated_by: s.email },
      { onConflict: 'vehicle_id' });
  if (error) return { error: eroareCurata(error, 'Tipul nu a putut fi salvat') };
  return { ok: true, mesaj: `Tip setat: ${fleetType === 'cisterna' ? 'cisternă' : 'zernovoz'}` };
}

export async function seteazaStareZi(input: {
  vehicleId: string; date: string; state: 'reparatie' | 'odihna'; reason: string | null; expectedEnd: string | null;
}): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereRol(); } catch { return { error: 'Neautorizat' }; }
  if (!(await esteCamion(input.vehicleId))) return { error: 'Mașina aleasă nu e camion din flota LDE' };

  // Starea de zi ascunde bara cursei în grilă (celula de stare se randează prima).
  // Nu o interzicem — camionul chiar poate intra în reparație în mijlocul cursei —
  // dar spunem explicit ce se întâmplă, ca dispecerul să nu creadă că a rupt cursa.
  const { fromIso, toIso } = chisinauDayBounds(input.date);
  const { data: peste } = await getSupabase().from('lde_truck_trips')
    .select('id').eq('vehicle_id', input.vehicleId).neq('status', 'anulata')
    .lt('load_planned_at', toIso).gte('unload_planned_at', fromIso).limit(1);
  const avertisment = peste && peste.length > 0
    ? ' Atenție: în această zi camionul are o cursă planificată — bara ei nu se mai vede, dar cursa rămâne.'
    : '';

  const { error } = await getSupabase().from('lde_truck_day_states')
    .upsert({
      vehicle_id: input.vehicleId,
      date: input.date,
      state: input.state,
      reason: taie(input.reason),
      expected_end: input.expectedEnd || null,
      created_by: s.email,
    }, { onConflict: 'vehicle_id,date' });
  if (error) return { error: eroareCurata(error, 'Starea nu a putut fi salvată') };
  return { ok: true, mesaj: (input.state === 'reparatie' ? 'Marcat la reparație.' : 'Marcat odihnă.') + avertisment };
}

export async function stergeStareZi(vehicleId: string, date: string): Promise<Rezultat> {
  try { await cerereRol(); } catch { return { error: 'Neautorizat' }; }
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
