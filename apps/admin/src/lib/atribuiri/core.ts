import { getSupabase } from '@/lib/supabase';

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
}

export interface AtribuireView extends AtribuireRow {
  route_label: string;      // «R3 · Bălți–Sadovoe» / «Chișinău → Briceni 07:40»
  plate: string | null;     // numărul mașinii atribuite (fără spații)
  driver_name: string | null;
  foaie: string | null;     // nr. foii de parcurs (doar interurban/suburban, din driver_cashin_receipts)
  template_vehicle_id: string | null; // default-ul din șablon (primul în picker)
}

const ROW_COLS = 'id, date, direction, route_kind, factory_route_id, shift_number, crm_route_id, vehicle_id, driver_id, status, verification_note, route_key';

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
 * Materializare lazy a unei zile — idempotent, insert-only (upsert ignoreDuplicates
 * pe UNIQUE(date, route_key)). Umple DOAR golurile: rândurile existente (inclusiv
 * editările proactive făcute din timp) nu se ating niciodată.
 */
export async function ensureDayMaterialized(date: string): Promise<void> {
  const db = getSupabase();
  const wd = isoWeekday(date);

  // ── curse de uzină: rută×schimb valide în ziua respectivă ──
  const { data: shifts } = await db
    .from('lde_factory_route_shifts')
    .select('id, shift_number, route:lde_factory_routes!inner ( id, uzina_id, uzina:lde_uzine!inner ( id, active, has_weekly_template, works_saturday, works_sunday ) )');
  type ShiftRow = {
    id: string; shift_number: number;
    route: { id: string; uzina_id: string; uzina: { id: string; active: boolean; has_weekly_template: boolean; works_saturday: boolean; works_sunday: boolean } };
  };
  const valid = ((shifts ?? []) as unknown as ShiftRow[]).filter((s) => {
    const u = s.route.uzina;
    if (!u.active) return false;
    if (wd === 6 && !u.works_saturday) return false;
    if (wd === 7 && !u.works_sunday) return false;
    return true;
  });

  // default-ul mașinii: șablonul săptămânal (uzine cu șablon) / primary-ul static (Trox)
  const { data: tpl } = await db
    .from('lde_weekly_template')
    .select('factory_route_id, shift_number, vehicle_id')
    .eq('weekday', wd);
  const tplMap = new Map((tpl ?? []).map((t) => [`${t.factory_route_id}:${t.shift_number}`, t.vehicle_id as string]));

  const { data: statics } = await db
    .from('lde_factory_route_vehicles')
    .select('vehicle_id, is_primary, shift:lde_factory_route_shifts!inner ( route_id, shift_number )')
    .eq('is_primary', true);
  type StaticRow = { vehicle_id: string; shift: { route_id: string; shift_number: number } };
  const staticMap = new Map(((statics ?? []) as unknown as StaticRow[]).map((s) => [`${s.shift.route_id}:${s.shift.shift_number}`, s.vehicle_id]));

  // șoferul default la uzine: atribuirea activă șofer↔mașină(±schimb) din lde_active_assignments
  const { data: actives } = await db
    .from('lde_active_assignments')
    .select('driver_id, vehicle_id, shift_number')
    .is('valid_to', null);
  const activeDriver = new Map<string, string>();
  for (const a of actives ?? []) {
    if (a.shift_number != null) activeDriver.set(`${a.vehicle_id}:${a.shift_number}`, a.driver_id as string);
    if (!activeDriver.has(`${a.vehicle_id}:*`)) activeDriver.set(`${a.vehicle_id}:*`, a.driver_id as string);
  }
  const driverForVehicle = (vehicleId: string | null, shift: number) =>
    vehicleId ? activeDriver.get(`${vehicleId}:${shift}`) ?? activeDriver.get(`${vehicleId}:*`) ?? null : null;

  const rows: Array<Record<string, unknown>> = valid.map((s) => {
    const key = `${s.route.id}:${s.shift_number}`;
    const u = s.route.uzina;
    const vehicleId = (u.has_weekly_template ? tplMap.get(key) : staticMap.get(key)) ?? null;
    return {
      date,
      direction: s.route.uzina_id,
      route_kind: 'uzina',
      factory_route_id: s.route.id,
      shift_number: s.shift_number,
      vehicle_id: vehicleId,
      driver_id: driverForVehicle(vehicleId, s.shift_number),
      status: 'planificat',
    };
  });

  // ── interurban/suburban: câte un rând per cursă activă; mașina+șoferul din daily_assignments ──
  const { data: crm } = await db
    .from('crm_routes').select('id, route_type').eq('active', true);
  const { data: das } = await db
    .from('daily_assignments')
    .select('crm_route_id, retur_route_id, vehicle_id, vehicle_id_retur, driver_id')
    .eq('assignment_date', date);
  const daVeh = new Map<number, string | null>();
  const daDrv = new Map<number, string | null>();
  for (const d of das ?? []) {
    if (d.crm_route_id != null) { daVeh.set(d.crm_route_id, d.vehicle_id); daDrv.set(d.crm_route_id, d.driver_id); }
    if (d.retur_route_id != null) { daVeh.set(d.retur_route_id, d.vehicle_id_retur); daDrv.set(d.retur_route_id, d.driver_id); }
  }
  for (const r of crm ?? []) {
    const kind = (r.route_type === 'suburban' ? 'suburban' : 'interurban') as RouteKind;
    rows.push({
      date,
      direction: kind,
      route_kind: kind,
      crm_route_id: r.id,
      vehicle_id: daVeh.get(r.id) ?? null,
      driver_id: daDrv.get(r.id) ?? null,
      status: 'planificat',
    });
  }

  if (rows.length) {
    const { error } = await db
      .from('lde_atribuiri_zilnice')
      .upsert(rows, { onConflict: 'date,route_key', ignoreDuplicates: true });
    if (error) throw new Error(`materializare ${date}: ${error.message}`);
  }
}

/** Rândurile unei zile pentru un set de direcții, cu etichete gata de afișat. */
export async function listZi(date: string, directions: string[] | null): Promise<AtribuireView[]> {
  const db = getSupabase();
  await ensureDayMaterialized(date);

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
    drvIds.length ? db.from('driver_cashin_receipts').select('driver_id, receipt_nr').eq('ziua', date).in('driver_id', drvIds) : Promise.resolve({ data: [] }),
  ]);
  const frMap = new Map((frRes.data ?? []).map((f: { id: string; route_number: number; stops_in_order: string | null }) => [f.id, f]));
  const crmMap = new Map((crmRes.data ?? []).map((c: { id: number; dest_from_ro: string; dest_to_ro: string; time_nord: string | null; time_chisinau: string | null }) => [c.id, c]));
  const vehMap = new Map((vehRes.data ?? []).map((v: { id: string; plate_number: string }) => [v.id, normPlate(v.plate_number)]));
  const tplMap = new Map((tplRes.data ?? []).map((t: { factory_route_id: string; shift_number: number; vehicle_id: string }) => [`${t.factory_route_id}:${t.shift_number}`, t.vehicle_id]));
  const drvMap = new Map((drvRes.data ?? []).map((d: { id: string; full_name: string }) => [d.id, d.full_name]));
  const foaieMap = new Map((foiRes.data ?? []).map((f: { driver_id: string; receipt_nr: string }) => [f.driver_id, f.receipt_nr]));

  return rows.map((r) => {
    let label = '';
    if (r.route_kind === 'uzina' && r.factory_route_id) {
      const f = frMap.get(r.factory_route_id);
      const scurt = (f?.stops_in_order ?? '').split('→').map((s: string) => s.trim()).filter(Boolean);
      const cap = scurt.length ? ` · ${scurt[0]}${scurt.length > 1 ? `–${scurt[scurt.length - 1]}` : ''}` : '';
      label = `R${f?.route_number ?? '?'}${cap} · S${r.shift_number}`;
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
      foaie: r.route_kind !== 'uzina' && r.driver_id ? foaieMap.get(r.driver_id) ?? null : null,
      template_vehicle_id: r.route_kind === 'uzina' && r.factory_route_id ? tplMap.get(`${r.factory_route_id}:${r.shift_number}`) ?? null : null,
    };
  });
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
    const okV = await writeThroughCrm(date, r.crm_route_id as number, r.vehicle_id as string | null);
    if (r.driver_id != null) await writeThroughDriverCrm(date, r.crm_route_id as number, r.driver_id as string);
    if (okV) n++;
  }
  return n;
}

/** Schimbarea comună de status/audit la orice editare a unui rând. */
async function updateRow(
  rowId: string, patch: Record<string, unknown>, userId: string,
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
    .update({ ...patch, status, changed_by: userId, changed_at: new Date().toISOString() })
    .eq('id', rowId)
    .select(ROW_COLS)
    .single();
  if (error) throw new Error(error.message);
  return { prev, next: upd as unknown as AtribuireRow };
}

/** Atribuie o mașină pe un rând (autorizarea pe direcție se face în API). */
export async function atribuie(rowId: string, vehicleId: string | null, userId: string): Promise<AtribuireRow> {
  const { prev, next } = await updateRow(rowId, { vehicle_id: vehicleId }, userId);
  if (prev.route_kind !== 'uzina' && prev.crm_route_id != null) {
    await writeThroughCrm(prev.date, prev.crm_route_id, vehicleId);
  }
  return next;
}

/** Atribuie un șofer pe un rând. Pe cursele din orar șoferul nu se poate SCOATE
 *  (daily_assignments.driver_id e NOT NULL — graficul cere mereu un șofer), doar înlocui. */
export async function atribuieSofer(rowId: string, driverId: string | null, userId: string): Promise<AtribuireRow> {
  if (driverId == null) {
    const { data: r } = await getSupabase()
      .from('lde_atribuiri_zilnice').select('route_kind').eq('id', rowId).maybeSingle();
    if (r && r.route_kind !== 'uzina') {
      throw new Error('Cursa din orar trebuie să aibă șofer — alege altul în loc să-l scoți');
    }
  }
  const { prev, next } = await updateRow(rowId, { driver_id: driverId }, userId);
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
    .select('date, route_kind, driver_id').eq('id', rowId).maybeSingle();
  if (!row) return { error: 'Rând inexistent' };
  if (row.route_kind === 'uzina') return { error: 'Foaia de parcurs e doar la interurban/suburban' };
  if (!row.driver_id) return { error: 'Alege întâi șoferul' };

  const raw = receiptNr.trim();
  if (raw === '') {
    const { error } = await db.from('driver_cashin_receipts').delete()
      .match({ driver_id: row.driver_id, ziua: row.date });
    if (error) return { error: error.message };
    return { foaie: null };
  }

  const trimmed = /^[0-9]+$/.test(raw) ? String(parseInt(raw, 10)) : raw;
  const { error } = await db.from('driver_cashin_receipts').upsert(
    { driver_id: row.driver_id, ziua: row.date, receipt_nr: trimmed, updated_at: new Date().toISOString() },
    { onConflict: 'driver_id,ziua' },
  );
  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await db.from('driver_cashin_receipts')
        .select('ziua, drivers:driver_id(full_name)').eq('receipt_nr', trimmed).maybeSingle();
      if (existing) {
        const nume = (existing as unknown as { drivers?: { full_name?: string } }).drivers?.full_name || 'alt șofer';
        const [y, m, d] = String(existing.ziua).split('-');
        return { error: `Foaia #${trimmed} e deja folosită de ${nume} pe ${d}.${m}.${y}` };
      }
      return { error: `Foaia #${trimmed} e deja folosită` };
    }
    return { error: error.message };
  }
  return { foaie: trimmed };
}

/** Confirmare manuală «a fost ok» după push de nepotrivire. */
export async function confirmaManual(rowId: string, userId: string): Promise<void> {
  const { error } = await getSupabase().from('lde_atribuiri_zilnice')
    .update({ status: 'confirmat_manual', changed_by: userId, confirmed_at: new Date().toISOString() })
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
  vehicleId: string | null, userId: string,
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
    vehicle_id: vehicleId, updated_by: userId, updated_at: new Date().toISOString(),
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
