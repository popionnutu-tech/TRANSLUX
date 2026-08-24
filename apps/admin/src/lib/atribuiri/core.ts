import { getSupabase } from '@/lib/supabase';
import { verificaTelefonSofer } from '@/lib/driver-guard';
import { scrieFoaie } from '@/lib/foaie';
import { valideazaZileMulti } from '@/lib/atribuiri/saptamana';

// Ядро atribuiri zilnice (Mini App manageri): materializare lazy șablon→zi,
// atribuire mașină per cursă, write-through daily_assignments (DOAR UPDATE),
// autorizare pe direcții. Acces DB doar service-role (tabele RLS deny-all).
//
// Reguli write-through (verdict architecture-guardian, 13.07.2026):
//  - NICIODATĂ INSERT în daily_assignments (cron-ul 20:00 face SKIP total dacă
//    ziua-țintă are măcar un rând → un insert proactiv ar lăsa graficul gol);
//  - tur: crm_route_id → vehicle_id; retur: retur_route_id → vehicle_id_retur;
//  - la editare manuală: auto_copied=false (altfel graficul dispecerului ascunde rândul);
//  - dacă rândurile zilei nu există încă (editare pe «mâine» înainte de 20:00),
//    write-through-ul se amână — îl aplică syncWriteThrough() în cron-ul de dimineață.

export type RouteKind = 'uzina' | 'interurban' | 'suburban';

export interface AtribuireRow {
  id: string;
  date: string;
  direction: string;
  route_kind: RouteKind;
  factory_route_id: string | null;
  shift_number: number | null;
  crm_route_id: number | null;
  vehicle_id: string | null;
  driver_id: string | null;
  status: string;
  verification_note: string | null;
  route_key: string;
  slot: number; // 1 = cursa de bază; ≥2 = cursă dublă (lde_curse_duble)
}

export interface AtribuireView extends AtribuireRow {
  route_label: string;      // «R3 · Bălți–Sadovoe» / «Chișinău → Briceni 07:40»
  plate: string | null;     // numărul mașinii atribuite (fără spații)
  driver_name: string | null;
  foaie: string | null;     // nr. foii de parcurs (doar interurban/suburban, din driver_cashin_receipts)
  template_vehicle_id: string | null; // default-ul din șablon (primul în picker)
}

const ROW_COLS = 'id, date, direction, route_kind, factory_route_id, shift_number, crm_route_id, vehicle_id, driver_id, status, verification_note, route_key, slot';

const normPlate = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '');

/** Azi în Chișinău, YYYY-MM-DD. */
export function chisinauToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Chisinau', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Ziua ISO a săptămânii (1=Luni … 7=Duminică) pentru un YYYY-MM-DD. */
export function isoWeekday(dateYMD: string): number {
  const d = new Date(`${dateYMD}T12:00:00Z`).getUTCDay(); // 0=Dum
  return d === 0 ? 7 : d;
}

/** Șoferul titular al unei mașini din lde_active_assignments (schimb exact, apoi orice schimb). */
export async function titularForVehicle(vehicleId: string, shiftNumber: number): Promise<string | null> {
  const { data } = await getSupabase()
    .from('lde_active_assignments')
    .select('driver_id, shift_number')
    .eq('vehicle_id', vehicleId)
    .is('valid_to', null)
    .order('shift_number');
  const rows = data ?? [];
  const exact = rows.find((r) => r.shift_number === shiftNumber);
  return ((exact ?? rows[0])?.driver_id as string | undefined) ?? null;
}

/** Direcțiile unui manager (users.role=MANAGER_LDE). ADMIN → null = toate. */
export async function managerDirections(userId: string): Promise<string[]> {
  const { data } = await getSupabase()
    .from('lde_manager_directions').select('direction').eq('user_id', userId);
  return (data ?? []).map((r) => r.direction as string);
}

/** Toate direcțiile posibile, în ordinea de afișare: uzine active + interurban + suburban. */
export async function allDirections(): Promise<Array<{ id: string; label: string }>> {
  const { data } = await getSupabase()
    .from('lde_uzine').select('id, display_name').eq('active', true).order('display_name');
  const uzine = (data ?? []).map((u) => ({ id: u.id as string, label: u.display_name as string }));
  return [...uzine, { id: 'interurban', label: 'Interurban' }, { id: 'suburban', label: 'Suburban' }];
}

/**
 * Materializare lazy a mai multor zile deodată — idempotent, insert-only (upsert
 * ignoreDuplicates pe UNIQUE(date, route_key)). Umple DOAR golurile: rândurile existente
 * (inclusiv editările proactive făcute din timp) nu se ating niciodată.
 * Interogările statice (șabloane, statice, actives, crm) se fac O SINGURĂ DATĂ pentru
 * tot setul de zile — motivul refactorului (grila săptămânală: 7 zile într-un load).
 */
export async function ensureDaysMaterialized(dates: string[]): Promise<void> {
  const db = getSupabase();
  if (!dates.length) return;

  // ── curse de uzină: rută×schimb (aceleași pentru toate zilele) ──
  const { data: shifts, error: shiftsErr } = await db
    .from('lde_factory_route_shifts')
    .select('id, shift_number, route:lde_factory_routes!inner ( id, uzina_id, uzina:lde_uzine!inner ( id, active, has_weekly_template, works_saturday, works_sunday ) )');
  if (shiftsErr) throw new Error(`materializare: ${shiftsErr.message}`);
  type ShiftRow = {
    id: string; shift_number: number;
    route: { id: string; uzina_id: string; uzina: { id: string; active: boolean; has_weekly_template: boolean; works_saturday: boolean; works_sunday: boolean } };
  };
  const allShifts = (shifts ?? []) as unknown as ShiftRow[];

  // default-ul mașinii: șablonul săptămânal (uzine cu șablon) / primary-ul static (Trox).
  // Filtrat pe weekday-urile din `dates` (7 zile → toate; 1 zi, ruta /zi + cronul de
  // verificare → o singură pagină ~160 rânduri), keyed pe `${factory_route_id}:${shift_number}:${weekday}`.
  // Paginat explicit: tabela a trecut deja de 1000 de rânduri, iar PostgREST taie tăcut la
  // limita implicită — fără .range() pierdem celule (constatare performance-reviewer, 12.08.2026).
  const weekdaysNeeded = [...new Set(dates.map(isoWeekday))];
  const tpl: Array<{ factory_route_id: string; shift_number: number; weekday: number; vehicle_id: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error: tplErr } = await db
      .from('lde_weekly_template')
      .select('factory_route_id, shift_number, weekday, vehicle_id')
      .in('weekday', weekdaysNeeded)
      .order('factory_route_id').order('shift_number').order('weekday')
      .range(from, from + 999);
    if (tplErr) throw new Error(`șablon (pagina de la ${from}): ${tplErr.message}`);
    tpl.push(...((page ?? []) as typeof tpl));
    if (!page || page.length < 1000) break;
  }
  const tplMap = new Map(tpl.map((t) => [`${t.factory_route_id}:${t.shift_number}:${t.weekday}`, t.vehicle_id]));

  const { data: statics, error: staticsErr } = await db
    .from('lde_factory_route_vehicles')
    .select('vehicle_id, is_primary, shift:lde_factory_route_shifts!inner ( route_id, shift_number )')
    .eq('is_primary', true);
  if (staticsErr) throw new Error(`materializare: ${staticsErr.message}`);
  type StaticRow = { vehicle_id: string; shift: { route_id: string; shift_number: number } };
  const staticMap = new Map(((statics ?? []) as unknown as StaticRow[]).map((s) => [`${s.shift.route_id}:${s.shift.shift_number}`, s.vehicle_id]));

  // șoferul default la uzine: atribuirea activă șofer↔mașină(±schimb) din lde_active_assignments
  const { data: actives, error: activesErr } = await db
    .from('lde_active_assignments')
    .select('driver_id, vehicle_id, shift_number')
    .is('valid_to', null);
  if (activesErr) throw new Error(`materializare: ${activesErr.message}`);
  const activeDriver = new Map<string, string>();
  for (const a of actives ?? []) {
    if (a.shift_number != null) activeDriver.set(`${a.vehicle_id}:${a.shift_number}`, a.driver_id as string);
    if (!activeDriver.has(`${a.vehicle_id}:*`)) activeDriver.set(`${a.vehicle_id}:*`, a.driver_id as string);
  }
  const driverForVehicle = (vehicleId: string | null, shift: number) =>
    vehicleId ? activeDriver.get(`${vehicleId}:${shift}`) ?? activeDriver.get(`${vehicleId}:*`) ?? null : null;

  // ── interurban/suburban: rute active (aceleași pentru toate zilele) + daily_assignments per zi ──
  const { data: crm, error: crmErr } = await db
    .from('crm_routes').select('id, route_type').eq('active', true);
  if (crmErr) throw new Error(`materializare: ${crmErr.message}`);

  // cursele DUBLE active (registru mic): slot ≥2, materializate doar de la valid_from
  // înainte, fără default din șablon — mașina/șoferul se aleg manual
  const { data: duble, error: dubleErr } = await db
    .from('lde_curse_duble')
    .select('factory_route_id, shift_number, slot, valid_from')
    .limit(500); // sentinelă contra tăierii tăcute PostgREST la 1000 (vezi lecția lde_weekly_template)
  if (dubleErr) throw new Error(`materializare: ${dubleErr.message}`);
  if ((duble ?? []).length === 500) throw new Error('materializare: lde_curse_duble a depășit limita de 500 — paginați citirea');
  const { data: das, error: dasErr } = await db
    .from('daily_assignments')
    .select('assignment_date, crm_route_id, retur_route_id, vehicle_id, vehicle_id_retur, driver_id, driver_id_retur')
    .in('assignment_date', dates);
  if (dasErr) throw new Error(`materializare: ${dasErr.message}`);
  const daVeh = new Map<string, string | null>();
  const daDrv = new Map<string, string | null>();
  for (const d of das ?? []) {
    const day = d.assignment_date as string;
    if (d.crm_route_id != null) { daVeh.set(`${day}:${d.crm_route_id}`, d.vehicle_id); daDrv.set(`${day}:${d.crm_route_id}`, d.driver_id); }
    if (d.retur_route_id != null) { daVeh.set(`${day}:${d.retur_route_id}`, d.vehicle_id_retur); daDrv.set(`${day}:${d.retur_route_id}`, d.driver_id_retur ?? d.driver_id); }
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const date of dates) {
    const wd = isoWeekday(date);
    const valid = allShifts.filter((s) => {
      const u = s.route.uzina;
      if (!u.active) return false;
      if (wd === 6 && !u.works_saturday) return false;
      if (wd === 7 && !u.works_sunday) return false;
      return true;
    });
    for (const s of valid) {
      const u = s.route.uzina;
      const vehicleId = (u.has_weekly_template
        ? tplMap.get(`${s.route.id}:${s.shift_number}:${wd}`)
        : staticMap.get(`${s.route.id}:${s.shift_number}`)) ?? null;
      rows.push({
        date,
        direction: s.route.uzina_id,
        route_kind: 'uzina',
        factory_route_id: s.route.id,
        shift_number: s.shift_number,
        slot: 1,
        vehicle_id: vehicleId,
        driver_id: driverForVehicle(vehicleId, s.shift_number),
        status: 'planificat',
      });
      for (const dbl of duble ?? []) {
        if (dbl.factory_route_id !== s.route.id || dbl.shift_number !== s.shift_number) continue;
        if (date < (dbl.valid_from as string)) continue;
        rows.push({
          date,
          direction: s.route.uzina_id,
          route_kind: 'uzina',
          factory_route_id: s.route.id,
          shift_number: s.shift_number,
          slot: dbl.slot,
          vehicle_id: null,
          driver_id: null,
          status: 'planificat',
        });
      }
    }
    for (const r of crm ?? []) {
      const kind = (r.route_type === 'suburban' ? 'suburban' : 'interurban') as RouteKind;
      rows.push({
        date,
        direction: kind,
        route_kind: kind,
        slot: 1, // cheile lipsă devin NULL la bulk upsert (PostgREST), iar slot e NOT NULL
        crm_route_id: r.id,
        vehicle_id: daVeh.get(`${date}:${r.id}`) ?? null,
        driver_id: daDrv.get(`${date}:${r.id}`) ?? null,
        status: 'planificat',
      });
    }
  }

  if (rows.length) {
    const { error } = await db
      .from('lde_atribuiri_zilnice')
      .upsert(rows, { onConflict: 'date,route_key', ignoreDuplicates: true });
    if (error) throw new Error(`materializare ${dates.join(',')}: ${error.message}`);
  }

  // Vindecare: rândurile interurban/suburban materializate înainte ca daily_assignments
  // să aibă mașină/șofer (ziua viitoare, cronul de 20:00 încă nu a rulat) rămân blocate la
  // null — insert-only nu le mai atinge. Rândurile neatinse de manageri (status planificat)
  // se resincronizează din graficul dispecerului la fiecare deschidere a paginii.
  const { data: existing, error: exErr } = await db
    .from('lde_atribuiri_zilnice')
    .select('id, date, crm_route_id, vehicle_id, driver_id')
    .in('date', dates)
    .not('crm_route_id', 'is', null)
    .eq('status', 'planificat');
  if (exErr) throw new Error(`resincronizare ${dates.join(',')}: ${exErr.message}`);
  for (const row of existing ?? []) {
    const crmId = row.crm_route_id as number;
    const key = `${row.date}:${crmId}`;
    const wantVeh = daVeh.get(key) ?? null;
    const wantDrv = daDrv.get(key) ?? null;
    if (row.vehicle_id !== wantVeh || row.driver_id !== wantDrv) {
      const { error } = await db.from('lde_atribuiri_zilnice')
        .update({ vehicle_id: wantVeh, driver_id: wantDrv })
        .eq('id', row.id);
      if (error) throw new Error(`resincronizare ${row.date}: ${error.message}`);
    }
  }
}

/** Materializare lazy a unei singure zile — vezi `ensureDaysMaterialized`. */
export async function ensureDayMaterialized(date: string): Promise<void> {
  return ensureDaysMaterialized([date]);
}

/** Rândurile unei zile pentru un set de direcții, cu etichete gata de afișat.
 *  `alreadyMaterialized` = true sare materializarea (apelantul a făcut-o deja batch,
 *  vezi `listSaptamana`) — default false ca să nu schimbe comportamentul apelurilor existente. */
export async function listZi(date: string, directions: string[] | null, alreadyMaterialized = false): Promise<AtribuireView[]> {
  const db = getSupabase();
  if (!alreadyMaterialized) await ensureDayMaterialized(date);

  let q = db.from('lde_atribuiri_zilnice')
    .select(ROW_COLS)
    .eq('date', date);
  if (directions) q = q.in('direction', directions);
  const { data } = await q.order('direction').order('route_key');
  const rows = (data ?? []) as AtribuireRow[];
  if (!rows.length) return [];

  // etichete: rute uzină / curse crm / plăci / șoferi / foi de parcurs
  const frIds = [...new Set(rows.map((r) => r.factory_route_id).filter(Boolean))] as string[];
  const crmIds = [...new Set(rows.map((r) => r.crm_route_id).filter((x) => x != null))] as number[];
  const vehIds = [...new Set(rows.map((r) => r.vehicle_id).filter(Boolean))] as string[];
  const drvIds = [...new Set(rows.map((r) => r.driver_id).filter(Boolean))] as string[];
  const wd = isoWeekday(date);

  const [frRes, crmRes, vehRes, tplRes, drvRes, foiRes] = await Promise.all([
    frIds.length ? db.from('lde_factory_routes').select('id, route_number, stops_in_order').in('id', frIds) : Promise.resolve({ data: [] }),
    crmIds.length ? db.from('crm_routes').select('id, dest_from_ro, dest_to_ro, time_nord, time_chisinau').in('id', crmIds) : Promise.resolve({ data: [] }),
    vehIds.length ? db.from('vehicles').select('id, plate_number').in('id', vehIds) : Promise.resolve({ data: [] }),
    frIds.length ? db.from('lde_weekly_template').select('factory_route_id, shift_number, vehicle_id').eq('weekday', wd).in('factory_route_id', frIds) : Promise.resolve({ data: [] }),
    drvIds.length ? db.from('drivers').select('id, full_name').in('id', drvIds) : Promise.resolve({ data: [] }),
    drvIds.length ? db.from('driver_cashin_receipts').select('driver_id, receipt_nr, crm_route_id').eq('ziua', date).in('driver_id', drvIds) : Promise.resolve({ data: [] }),
  ]);
  const frMap = new Map((frRes.data ?? []).map((f: { id: string; route_number: number; stops_in_order: string | null }) => [f.id, f]));
  const crmMap = new Map((crmRes.data ?? []).map((c: { id: number; dest_from_ro: string; dest_to_ro: string; time_nord: string | null; time_chisinau: string | null }) => [c.id, c]));
  const vehMap = new Map((vehRes.data ?? []).map((v: { id: string; plate_number: string }) => [v.id, normPlate(v.plate_number)]));
  const tplMap = new Map((tplRes.data ?? []).map((t: { factory_route_id: string; shift_number: number; vehicle_id: string }) => [`${t.factory_route_id}:${t.shift_number}`, t.vehicle_id]));
  const drvMap = new Map((drvRes.data ?? []).map((d: { id: string; full_name: string }) => [d.id, d.full_name]));
  // foaia legată de rută are prioritate; cea fără rută («a zilei») e fallback
  const foaieByRoute = new Map<string, string>();
  const foaieMap = new Map<string, string>();
  for (const f of (foiRes.data ?? []) as Array<{ driver_id: string; receipt_nr: string; crm_route_id: number | null }>) {
    if (f.crm_route_id != null) foaieByRoute.set(`${f.driver_id}|${f.crm_route_id}`, f.receipt_nr);
    else foaieMap.set(f.driver_id, f.receipt_nr);
  }

  return rows.map((r) => {
    let label = '';
    if (r.route_kind === 'uzina' && r.factory_route_id) {
      const f = frMap.get(r.factory_route_id);
      const scurt = (f?.stops_in_order ?? '').split('→').map((s: string) => s.trim()).filter(Boolean);
      const cap = scurt.length ? ` · ${scurt[0]}${scurt.length > 1 ? `–${scurt[scurt.length - 1]}` : ''}` : '';
      label = `R${f?.route_number ?? '?'}${cap} · S${r.shift_number}`;
      if (r.slot > 1) label += r.slot === 2 ? ' · dublă' : ` · dublă ${r.slot - 1}`;
    } else if (r.crm_route_id != null) {
      const c = crmMap.get(r.crm_route_id);
      const ora = c?.time_nord || c?.time_chisinau || '';
      label = c ? `${c.dest_from_ro} → ${c.dest_to_ro}${ora ? ` · ${ora}` : ''}` : `Cursa ${r.crm_route_id}`;
    }
    return {
      ...r,
      route_label: label,
      plate: r.vehicle_id ? vehMap.get(r.vehicle_id) ?? null : null,
      driver_name: r.driver_id ? drvMap.get(r.driver_id) ?? null : null,
      foaie: r.route_kind !== 'uzina' && r.driver_id
        ? (r.crm_route_id != null ? foaieByRoute.get(`${r.driver_id}|${r.crm_route_id}`) : undefined) ?? foaieMap.get(r.driver_id) ?? null
        : null,
      // dublurile n-au default din șablon — sugestia ar repeta mașina cursei de bază
      template_vehicle_id: r.route_kind === 'uzina' && r.factory_route_id && r.slot === 1
        ? tplMap.get(`${r.factory_route_id}:${r.shift_number}`) ?? null : null,
    };
  });
}

/** Adaugă o cursă dublă (slotul următor liber ≥2) pe rută×schimb, valabilă de azi înainte. */
export async function adaugaDubla(
  factoryRouteId: string, shiftNumber: number, userId: string | null, adminId?: string | null,
): Promise<{ slot: number }> {
  const db = getSupabase();
  // schimbul trebuie să existe pe rută (altfel dublura nu s-ar materializa niciodată)
  const { data: sh, error: shErr } = await db
    .from('lde_factory_route_shifts').select('id')
    .eq('route_id', factoryRouteId).eq('shift_number', shiftNumber).maybeSingle();
  if (shErr) throw new Error(shErr.message);
  if (!sh) throw new Error('Schimbul nu există pe ruta asta');

  const { data: existing, error: exErr } = await db
    .from('lde_curse_duble').select('slot')
    .eq('factory_route_id', factoryRouteId).eq('shift_number', shiftNumber)
    .order('slot', { ascending: false }).limit(1);
  if (exErr) throw new Error(exErr.message);
  const slot = ((existing?.[0]?.slot as number | undefined) ?? 1) + 1;

  const { error } = await db.from('lde_curse_duble').insert({
    factory_route_id: factoryRouteId, shift_number: shiftNumber, slot,
    valid_from: chisinauToday(), created_by: userId, created_by_admin: adminId ?? null,
  });
  if (error) throw new Error(error.message);
  return { slot };
}

/** Șterge o cursă dublă: registrul + rândurile de azi înainte (istoricul rămâne). */
export async function stergeDubla(
  factoryRouteId: string, shiftNumber: number, slot: number,
): Promise<void> {
  if (slot < 2) throw new Error('Cursa de bază nu se poate șterge');
  const db = getSupabase();
  const { error: e1 } = await db.from('lde_curse_duble').delete()
    .eq('factory_route_id', factoryRouteId).eq('shift_number', shiftNumber).eq('slot', slot);
  if (e1) throw new Error(e1.message);
  // predicat pe route_key (nu pe coloanele-sursă): doar așa se folosește indexul unic
  // (date, route_key) — Postgres nu inversează expresia coloanei generate
  const routeKey = `uzina:${factoryRouteId}:${shiftNumber}:${slot}`;
  const { error: e2 } = await db.from('lde_atribuiri_zilnice').delete()
    .eq('route_key', routeKey)
    .gte('date', chisinauToday());
  if (e2) throw new Error(e2.message);
}

/**
 * Write-through în daily_assignments — DOAR UPDATE al rândurilor existente.
 * Întoarce true dacă a găsit rând (altfel amânat pentru syncWriteThrough).
 * Erorile DB NU se înghit — altfel divergența mini-app↔grafic trece tăcut.
 */
async function writeThroughCrm(date: string, crmRouteId: number, vehicleId: string | null): Promise<boolean> {
  const db = getSupabase();
  // tur
  const { data: tur, error: e1 } = await db.from('daily_assignments')
    .update({ vehicle_id: vehicleId, auto_copied: false })
    .eq('assignment_date', date).eq('crm_route_id', crmRouteId)
    .select('id');
  if (e1) throw new Error(`grafic (tur): ${e1.message}`);
  if (tur?.length) return true;
  // retur
  const { data: ret, error: e2 } = await db.from('daily_assignments')
    .update({ vehicle_id_retur: vehicleId, auto_copied: false })
    .eq('assignment_date', date).eq('retur_route_id', crmRouteId)
    .select('id');
  if (e2) throw new Error(`grafic (retur): ${e2.message}`);
  return !!ret?.length;
}

/** Write-through șofer — DOAR UPDATE; șoferul stă pe rândul daily_assignments (tur+retur împreună).
 *  driver_id e NOT NULL în daily_assignments → null nu se propagă niciodată
 *  (scoaterea șoferului pe curse din orar e blocată în atribuieSofer). */
async function writeThroughDriverCrm(date: string, crmRouteId: number, driverId: string | null): Promise<boolean> {
  if (driverId == null) return false;
  const db = getSupabase();
  const { data: tur, error: e1 } = await db.from('daily_assignments')
    .update({ driver_id: driverId, auto_copied: false })
    .eq('assignment_date', date).eq('crm_route_id', crmRouteId)
    .select('id');
  if (e1) throw new Error(`grafic șofer (tur): ${e1.message}`);
  if (tur?.length) return true;
  const { data: ret, error: e2 } = await db.from('daily_assignments')
    .update({ driver_id: driverId, auto_copied: false })
    .eq('assignment_date', date).eq('retur_route_id', crmRouteId)
    .select('id');
  if (e2) throw new Error(`grafic șofer (retur): ${e2.message}`);
  return !!ret?.length;
}

/** Re-aplică write-through-ul amânat pentru o zi (apelat de cron-ul de dimineață). */
export async function syncWriteThrough(date: string): Promise<number> {
  const db = getSupabase();
  const { data } = await db.from('lde_atribuiri_zilnice')
    .select('crm_route_id, vehicle_id, driver_id')
    .eq('date', date)
    .in('status', ['modificat_proactiv', 'modificat_reactiv'])
    .not('crm_route_id', 'is', null);
  let n = 0;
  for (const r of data ?? []) {
    // un rând care pică (ex. trigger-ul care cere telefonul șoferului) nu trebuie să
    // oprească restul zilei — cronul rulează o dată dimineața, fără cine să reia manual
    try {
      const okV = await writeThroughCrm(date, r.crm_route_id as number, r.vehicle_id as string | null);
      if (r.driver_id != null) await writeThroughDriverCrm(date, r.crm_route_id as number, r.driver_id as string);
      if (okV) n++;
    } catch (err) {
      console.error(`syncWriteThrough ${date} ruta ${r.crm_route_id}:`, err);
    }
  }
  return n;
}

/** Schimbarea comună de status/audit la orice editare a unui rând. */
async function updateRow(
  rowId: string, patch: Record<string, unknown>, userId: string | null, adminId?: string | null,
): Promise<{ prev: AtribuireRow; next: AtribuireRow }> {
  const db = getSupabase();
  const { data: row } = await db.from('lde_atribuiri_zilnice')
    .select(ROW_COLS).eq('id', rowId).maybeSingle();
  if (!row) throw new Error('Rând inexistent');
  const prev = row as unknown as AtribuireRow;

  const today = chisinauToday();
  // editare pe trecut (după push de nepotrivire) = reactiv; azi/viitor = proactiv
  const status = prev.date < today ? 'modificat_reactiv' : 'modificat_proactiv';

  const { data: upd, error } = await db.from('lde_atribuiri_zilnice')
    .update({ ...patch, status, changed_by: userId, changed_by_admin: adminId ?? null, changed_at: new Date().toISOString() })
    .eq('id', rowId)
    .select(ROW_COLS)
    .single();
  if (error) throw new Error(error.message);
  return { prev, next: upd as unknown as AtribuireRow };
}

/** Atribuie o mașină pe un rând (autorizarea pe direcție se face în API/actions).
 *  Pe uzine mașina merge mereu cu șofer: titularul se pune automat; golirea mașinii curăță șoferul. */
export async function atribuie(rowId: string, vehicleId: string | null, userId: string | null, adminId?: string | null): Promise<AtribuireRow> {
  const { data: r0 } = await getSupabase().from('lde_atribuiri_zilnice')
    .select('route_kind, shift_number, driver_id').eq('id', rowId).maybeSingle();
  const patch: Record<string, unknown> = { vehicle_id: vehicleId };
  if (r0?.route_kind === 'uzina') {
    if (vehicleId == null) patch.driver_id = null;
    else {
      const driverId = (await titularForVehicle(vehicleId, (r0.shift_number as number) ?? 1)) ?? r0.driver_id ?? null;
      if (driverId == null) throw new Error('Mașina nu are șofer titular — alege întâi șoferul');
      patch.driver_id = driverId;
    }
  }
  const { prev, next } = await updateRow(rowId, patch, userId, adminId);
  if (prev.route_kind !== 'uzina' && prev.crm_route_id != null) {
    await writeThroughCrm(prev.date, prev.crm_route_id, vehicleId);
  }
  return next;
}

/** Atribuie un șofer pe un rând. Pe cursele din orar șoferul nu se poate SCOATE
 *  (daily_assignments.driver_id e NOT NULL — graficul cere mereu un șofer), doar înlocui. */
export async function atribuieSofer(rowId: string, driverId: string | null, userId: string | null, adminId?: string | null): Promise<AtribuireRow> {
  // erorile de citire NU se înghit: o verificare sărită tăcut e mai rea decât o eroare
  const { data: r, error: rErr } = await getSupabase()
    .from('lde_atribuiri_zilnice').select('route_kind, vehicle_id').eq('id', rowId).maybeSingle();
  if (rErr) throw new Error(`Citirea rândului a eșuat: ${rErr.message}`);

  if (driverId == null) {
    if (r && r.route_kind !== 'uzina') {
      throw new Error('Cursa din orar trebuie să aibă șofer — alege altul în loc să-l scoți');
    }
    if (r && r.route_kind === 'uzina' && r.vehicle_id) {
      throw new Error('Mașina atribuită trebuie să aibă șofer — înlocuiește-l sau golește mașina');
    }
  } else if (r && r.route_kind !== 'uzina') {
    // aceeași verificare ca pe /assignments și /grafic — mesajul stă într-un singur loc
    const errTelefon = await verificaTelefonSofer(driverId);
    if (errTelefon) throw new Error(errTelefon);
  }
  const { prev, next } = await updateRow(rowId, { driver_id: driverId }, userId, adminId);
  if (prev.route_kind !== 'uzina' && prev.crm_route_id != null) {
    await writeThroughDriverCrm(prev.date, prev.crm_route_id, driverId);
  }
  return next;
}

/** Lista șoferilor pentru picker: întâi cei cu direcția respectivă, apoi restul. */
export async function soferiForPicker(direction: string): Promise<Array<{ id: string; name: string; inDirection: boolean }>> {
  const { data } = await getSupabase()
    .from('drivers').select('id, full_name, directions').eq('active', true).order('full_name');
  return (data ?? []).map((d: { id: string; full_name: string; directions: string[] | null }) => ({
    id: d.id,
    name: d.full_name,
    inDirection: (d.directions ?? []).includes(direction),
  })).sort((a, b) => Number(b.inDirection) - Number(a.inDirection) || a.name.localeCompare(b.name));
}

/**
 * Foaia de parcurs pentru interurban/suburban — «cum este acum» în grafic:
 * driver_cashin_receipts (șofer×zi), gol = ștergere, numerele pierd zerourile
 * din față, receipt_nr e unic GLOBAL (mesaj prietenos la 23505).
 * Oglindește logica din (dashboard)/grafic/actions.ts (saveReceipt).
 */
export async function setFoaie(rowId: string, receiptNr: string): Promise<{ error?: string; foaie?: string | null }> {
  const db = getSupabase();
  const { data: row } = await db.from('lde_atribuiri_zilnice')
    .select('date, route_kind, driver_id, crm_route_id').eq('id', rowId).maybeSingle();
  if (!row) return { error: 'Rând inexistent' };
  if (row.route_kind === 'uzina') return { error: 'Foaia de parcurs e doar la interurban/suburban' };
  if (!row.driver_id) return { error: 'Alege întâi șoferul' };

  // logica de scriere (foaie per rută, migr. 246) e comună cu /grafic
  return scrieFoaie(db, row.driver_id, row.date, receiptNr, row.crm_route_id ?? null);
}

/** Confirmare manuală «a fost ok» după push de nepotrivire. */
export async function confirmaManual(rowId: string, userId: string | null, adminId?: string | null): Promise<void> {
  const { error } = await getSupabase().from('lde_atribuiri_zilnice')
    .update({ status: 'confirmat_manual', changed_by: userId, changed_by_admin: adminId ?? null, confirmed_at: new Date().toISOString() })
    .eq('id', rowId);
  if (error) throw new Error(error.message);
}

/** Uzinele cu șablon săptămânal (pentru editorul de grilă). */
export async function uzineCuSablon(): Promise<Array<{ id: string; label: string }>> {
  const { data } = await getSupabase()
    .from('lde_uzine').select('id, display_name')
    .eq('active', true).eq('has_weekly_template', true).order('display_name');
  return (data ?? []).map((u) => ({ id: u.id as string, label: u.display_name as string }));
}

export interface TemplateGridRow {
  factory_route_id: string;
  shift_number: number;
  route_label: string;
  cells: Record<number, { vehicle_id: string; plate: string } | null>; // weekday 1..7
}

/** Grila șablonului pentru o uzină: rute×schimburi × Luni…Duminică. */
export async function listTemplate(uzinaId: string): Promise<TemplateGridRow[]> {
  const db = getSupabase();
  const { data: shifts } = await db
    .from('lde_factory_route_shifts')
    .select('shift_number, route:lde_factory_routes!inner ( id, uzina_id, route_number, stops_in_order )');
  type SR = { shift_number: number; route: { id: string; uzina_id: string; route_number: number; stops_in_order: string | null } };
  const mine = ((shifts ?? []) as unknown as SR[])
    .filter((s) => s.route.uzina_id === uzinaId)
    .sort((a, b) => a.route.route_number - b.route.route_number || a.shift_number - b.shift_number);
  if (!mine.length) return [];

  const routeIds = [...new Set(mine.map((s) => s.route.id))];
  const { data: tpl } = await db
    .from('lde_weekly_template')
    .select('factory_route_id, shift_number, weekday, vehicle_id, vehicle:vehicles ( plate_number )')
    .in('factory_route_id', routeIds);
  type TR = { factory_route_id: string; shift_number: number; weekday: number; vehicle_id: string; vehicle: { plate_number: string } | null };
  const cellMap = new Map<string, { vehicle_id: string; plate: string }>();
  for (const t of (tpl ?? []) as unknown as TR[]) {
    cellMap.set(`${t.factory_route_id}:${t.shift_number}:${t.weekday}`, {
      vehicle_id: t.vehicle_id, plate: normPlate(t.vehicle?.plate_number),
    });
  }

  return mine.map((s) => {
    const stops = (s.route.stops_in_order ?? '').split('→').map((x) => x.trim()).filter(Boolean);
    const cap = stops.length ? ` · ${stops[0]}${stops.length > 1 ? `–${stops[stops.length - 1]}` : ''}` : '';
    const cells: TemplateGridRow['cells'] = {};
    for (let wd = 1; wd <= 7; wd++) cells[wd] = cellMap.get(`${s.route.id}:${s.shift_number}:${wd}`) ?? null;
    return {
      factory_route_id: s.route.id,
      shift_number: s.shift_number,
      route_label: `R${s.route.route_number}${cap} · S${s.shift_number}`,
      cells,
    };
  });
}

/** Setează/curăță o celulă de șablon. Afectează doar zilele NE-materializate încă. */
export async function setTemplateCell(
  factoryRouteId: string, shiftNumber: number, weekday: number,
  vehicleId: string | null, userId: string | null, adminId?: string | null,
): Promise<void> {
  const db = getSupabase();
  if (vehicleId == null) {
    const { error } = await db.from('lde_weekly_template').delete()
      .eq('factory_route_id', factoryRouteId).eq('shift_number', shiftNumber).eq('weekday', weekday);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await db.from('lde_weekly_template').upsert({
    factory_route_id: factoryRouteId, shift_number: shiftNumber, weekday,
    vehicle_id: vehicleId, updated_by: userId, updated_by_admin: adminId ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: 'factory_route_id,shift_number,weekday' });
  if (error) throw new Error(error.message);
}

/** Direcția (uzina) unei rute de fabrică — pentru autorizarea editării șablonului. */
export async function uzinaOfRoute(factoryRouteId: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('lde_factory_routes').select('uzina_id').eq('id', factoryRouteId).maybeSingle();
  return (data?.uzina_id as string) ?? null;
}

/** Direcția unui rând de atribuire — pentru autorizare în API. */
export async function directionOfRow(rowId: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('lde_atribuiri_zilnice').select('direction').eq('id', rowId).maybeSingle();
  return (data?.direction as string) ?? null;
}

/** Direcția + tipul unui rând — pentru autorizarea scope-ului rolului UZINE în acțiunile web. */
export async function rowScope(rowId: string): Promise<{ route_kind: RouteKind; direction: string } | null> {
  const { data } = await getSupabase()
    .from('lde_atribuiri_zilnice').select('route_kind, direction').eq('id', rowId).maybeSingle();
  return data ? { route_kind: data.route_kind as RouteKind, direction: data.direction as string } : null;
}

/** Lista mașinilor pentru picker: [default șablon] + direcția + restul, cu plăci normalizate. */
export async function vehiclesForPicker(direction: string): Promise<Array<{ id: string; plate: string; inDirection: boolean }>> {
  const { data } = await getSupabase()
    .from('vehicles').select('id, plate_number, directions').eq('active', true).order('plate_number');
  return (data ?? []).map((v: { id: string; plate_number: string; directions: string[] | null }) => ({
    id: v.id,
    plate: normPlate(v.plate_number),
    inDirection: (v.directions ?? []).includes(direction),
  })).sort((a, b) => Number(b.inDirection) - Number(a.inDirection) || a.plate.localeCompare(b.plate));
}

export interface AtribuieMultiParams {
  factoryRouteId: string;
  shiftNumber: number;
  slot?: number;               // 1 (implicit) = cursa de bază; ≥2 = cursă dublă
  dates: string[];             // YYYY-MM-DD — zilele bifate
  vehicleId?: string | null;   // omis = nu atinge mașina (doar șofer); null = golește cursa (curăță și șoferul); string = setează
  driverId?: string | null;    // la vehicleId omis: obligatoriu; la vehicleId string: omis/null = auto (titularul mașinii, fallback șoferul zilei)
  siInSablon?: boolean;        // scrie/șterge și lde_weekly_template pe weekday-urile zilelor (doar când vehicleId nu e omis)
}

/** Schimbare pe una sau mai multe zile — nucleul grilei săptămânale (web) și al
 *  «Aplică și pe alte zile» (mini app). Zilele fără rând (uzina nu lucrează) se sar. */
export async function atribuieMulti(
  p: AtribuieMultiParams, userId: string | null, adminId?: string | null,
): Promise<{ updated: number; skipped: number }> {
  const db = getSupabase();
  const slot = p.slot ?? 1;
  const routeKey = `uzina:${p.factoryRouteId}:${p.shiftNumber}${slot > 1 ? `:${slot}` : ''}`;
  // limite (F10, performance-reviewer): o aplicare multi-zi nu poate deveni un batch nemărginit
  const dates = valideazaZileMulti(p.dates, chisinauToday());

  // vehicleId omis = editare doar-șofer (aplicată pe «alte zile» din mini app fără mașină) —
  // nu atinge mașina existentă pe acele zile (altfel s-ar suprascrie tăcut cu mașina zilei curente)
  const onlyDriver = p.vehicleId === undefined;
  if (onlyDriver && p.driverId == null) throw new Error('Alege șoferul');

  await ensureDaysMaterialized(dates);
  let updated = 0;
  let skipped = 0;
  for (const date of dates) {
    const { data: row } = await db.from('lde_atribuiri_zilnice')
      .select('id, driver_id').eq('date', date).eq('route_key', routeKey).maybeSingle();
    if (!row) continue;

    if (onlyDriver) {
      await updateRow(row.id, { driver_id: p.driverId }, userId, adminId);
      updated++;
      continue;
    }

    let driverId: string | null;
    if (p.vehicleId == null) {
      driverId = null;
    } else if (p.driverId != null) {
      driverId = p.driverId;
    } else {
      // invariant mașină⇒șofer unificat cu `atribuie`: titularul mașinii, fallback șoferul deja pe rândul zilei
      const titular = await titularForVehicle(p.vehicleId, p.shiftNumber);
      driverId = titular ?? (row.driver_id as string | null);
      if (driverId == null) { skipped++; continue; } // nici titular, nici șofer existent — se sare, nu se blochează toată aplicarea
    }
    await updateRow(row.id, { vehicle_id: p.vehicleId, driver_id: driverId }, userId, adminId);
    updated++;
  }
  if (updated === 0 && skipped > 0) throw new Error('Mașina nu are șofer titular — alege șoferul explicit');

  // șablonul nu are sloturi — «și în șablon» e valabil doar pe cursa de bază
  if (p.siInSablon && p.vehicleId !== undefined && slot === 1) {
    for (const wd of [...new Set(dates.map(isoWeekday))]) {
      await setTemplateCell(p.factoryRouteId, p.shiftNumber, wd, p.vehicleId, userId, adminId);
    }
  }
  return { updated, skipped };
}

/** Rândurile unei uzine pe un set de zile (materializează toate zilele deodată — idempotent). */
export async function listSaptamana(uzinaId: string, dates: string[]): Promise<AtribuireView[]> {
  await ensureDaysMaterialized(dates);
  const out: AtribuireView[] = [];
  for (const d of dates) out.push(...await listZi(d, [uzinaId], true));
  return out;
}
