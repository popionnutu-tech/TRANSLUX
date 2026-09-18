'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { getDirectionOptions } from '@/lib/directions';
import { listZi, chisinauToday, allDirections } from '@/lib/atribuiri/core';

// Admin: (a) editor manager↔direcții (users.role=MANAGER_LDE + lde_manager_directions);
// (b) matricea de status per zi a atribuirilor (citește lde_atribuiri_zilnice).

export interface ManagerRow {
  id: string;
  label: string;
  telegram_id: number | null;
  active: boolean;
  directions: string[];
}

export interface MatrixRow {
  direction: string;
  label: string;
  total: number;
  fara_masina: number;
  confirmate: number;
  nepotriviri: number;
  fara_gps: number;
  libere: number;            // uzina n-a lucrat în ziua aceea (nu e abatere)
  modificate: number;
}

export interface AtribuiriAdminData {
  date: string;
  manageri: ManagerRow[];
  candidati: Array<{ id: string; label: string }>;  // useri Telegram care pot deveni manageri
  optiuni: Array<{ value: string; label: string }>;
  matrix: MatrixRow[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getAtribuiriAdmin(date?: string): Promise<AtribuiriAdminData> {
  requireRole(await verifySession(), 'ADMIN');
  const db = getSupabase();
  const day = date && DATE_RE.test(date) ? date : chisinauToday();

  const [{ data: users }, { data: mds }, { data: candidatiRaw }, optiuni, rows, dirLabels] = await Promise.all([
    db.from('users').select('id, name, username, telegram_id, active').eq('role', 'MANAGER_LDE').order('name'),
    db.from('lde_manager_directions').select('user_id, direction'),
    db.from('users').select('id, name, username').in('role', ['CONTROLLER', 'DIGITAL']).eq('active', true).order('name'),
    getDirectionOptions(),
    listZi(day, null),
    allDirections(),
  ]);

  const dirsByUser = new Map<string, string[]>();
  for (const m of mds ?? []) {
    dirsByUser.set(m.user_id as string, [...(dirsByUser.get(m.user_id as string) ?? []), m.direction as string]);
  }
  const manageri: ManagerRow[] = (users ?? []).map((u) => ({
    id: u.id as string,
    label: (u.name as string) || (u.username as string) || 'fără nume',
    telegram_id: u.telegram_id as number | null,
    active: !!u.active,
    directions: dirsByUser.get(u.id as string) ?? [],
  }));

  const labelOf = new Map(dirLabels.map((d) => [d.id, d.label]));
  const byDir = new Map<string, MatrixRow>();
  for (const r of rows) {
    const m = byDir.get(r.direction) ?? {
      direction: r.direction, label: labelOf.get(r.direction) ?? r.direction,
      total: 0, fara_masina: 0, confirmate: 0, nepotriviri: 0, fara_gps: 0, libere: 0, modificate: 0,
    };
    m.total++;
    if (!r.vehicle_id) m.fara_masina++;
    if (r.status === 'confirmat_auto' || r.status === 'confirmat_manual') m.confirmate++;
    if (r.status === 'nepotrivire') m.nepotriviri++;
    if (r.status === 'fara_date_gps') m.fara_gps++;
    if (r.status === 'uzina_nu_a_lucrat') m.libere++;
    if (r.status === 'modificat_proactiv' || r.status === 'modificat_reactiv') m.modificate++;
    byDir.set(r.direction, m);
  }

  const candidati = (candidatiRaw ?? []).map((u) => ({
    id: u.id as string,
    label: (u.name as string) || (u.username as string) || 'fără nume',
  }));

  return { date: day, manageri, candidati, optiuni, matrix: [...byDir.values()].sort((a, b) => a.label.localeCompare(b.label)) };
}

/** Promovează un user Telegram (CONTROLLER/DIGITAL) la MANAGER_LDE — setare din nomenclator, fără Mostic. */
export async function addManager(userId: string): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const db = getSupabase();
  const { data: u } = await db.from('users').select('role').eq('id', userId).maybeSingle();
  if (!u || !['CONTROLLER', 'DIGITAL'].includes(u.role as string)) throw new Error('User invalid');
  // point=null — ca la DIGITAL: botul nu-i mai oferă raportarea de curse
  const { error } = await db.from('users').update({ role: 'MANAGER_LDE', point: null }).eq('id', userId);
  if (error) throw new Error(error.message);
}

/** Scoate rolul de manager (revine la DIGITAL — doar Mini App) și curăță direcțiile. */
export async function removeManager(userId: string): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const db = getSupabase();
  const { data: u } = await db.from('users').select('role').eq('id', userId).maybeSingle();
  if (u?.role !== 'MANAGER_LDE') throw new Error('Userul nu e MANAGER_LDE');
  const { error } = await db.from('users').update({ role: 'DIGITAL' }).eq('id', userId);
  if (error) throw new Error(error.message);
  await db.from('lde_manager_directions').delete().eq('user_id', userId);
}

export async function saveManagerDirections(userId: string, directions: string[]): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const db = getSupabase();

  // doar userii cu rol MANAGER_LDE pot primi direcții
  const { data: target } = await db.from('users').select('role').eq('id', userId).maybeSingle();
  if (target?.role !== 'MANAGER_LDE') throw new Error('Utilizatorul nu are rolul MANAGER_LDE');

  // validare pe vocabularul real (uzine active + interurban/suburban)
  const valid = new Set((await allDirections()).map((d) => d.id));
  const clean = [...new Set(directions)].filter((d) => valid.has(d));

  const { error: delErr } = await db.from('lde_manager_directions').delete().eq('user_id', userId);
  if (delErr) throw new Error(delErr.message);
  if (clean.length) {
    const { error } = await db.from('lde_manager_directions')
      .insert(clean.map((direction) => ({ user_id: userId, direction })));
    if (error) throw new Error(error.message);
  }
}


// ── ghidul zilnic: unde, IERI, mașina a făcut km goi degeaba ────────────────
// Ion, 18.09: «am nevoie de ghid care să aducă zilnic aminte la operator zona unde
// economia ar fi semnificativă și noi nu o facem». Stă pe pagina unde se uită la graficul
// zilei, nu într-un raport separat — ca să fie în drumul lui, nu pe lângă.
//
// Citește cursele MĂSURATE ale zilei, nu planul: fiecare cifră e km parcurși, din urma GPS.

import { bazeMasinilor } from '@/lib/lde/trasee';
import { ghidZilnic, type Alerta, type CursaMasurata } from '@/lib/lde/ghid-zilnic';

export type { Alerta };

export async function getGhidZilnic(date?: string): Promise<{ zi: string; alerte: Alerta[] }> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  // implicit ziua de IERI: ziua de azi n-a fost încă procesată de worker-ul de noapte
  const zi = date ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const de = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [{ data: curse }, { data: atrib }, { data: soferi }, { data: rute }] = await Promise.all([
    sb.from('lde_route_run')
      .select('factory_route_id, shift_number, sens, vehicle_id, km_real, km_goi, km_gol_acasa, km_gol_pauza, km_livrare, opriri_gol_pe_traseu, prima_statie, ambiguu')
      .eq('run_date', zi).eq('ambiguu', false).not('km_real', 'is', null),
    sb.from('lde_atribuiri_zilnice')
      .select('driver_id, vehicle_id, vehicle_id_retur, factory_route_id, shift_number')
      .eq('date', zi).eq('route_kind', 'uzina'),
    sb.from('drivers').select('id, full_name'),
    sb.from('lde_factory_routes').select('id, uzina_id, route_number'),
  ]);

  const baze: { vehicle_id: string; lat: number; lon: number; locality: string | null }[] = [];
  for (let d = 0; ; d += 1000) {
    const { data } = await sb.from('lde_gps_stops').select('vehicle_id, lat, lon, locality')
      .eq('is_base', true).gte('date', de).range(d, d + 999);
    baze.push(...((data ?? []) as typeof baze));
    if (!data || data.length < 1000) break;
  }
  const { baze: bazaMasina } = bazeMasinilor(baze);

  const numeSofer = new Map((soferi ?? []).map((d) => [d.id as string, d.full_name as string]));
  const info = new Map((rute ?? []).map((r) => [r.id as string,
    { uzina_id: r.uzina_id as string, eticheta: `${r.uzina_id} #${r.route_number}` }]));
  // Cine a condus cursa. Trei capcane, toate întâlnite pe 17.09, toate ocolite aici:
  //  1. RETURUL poate fi făcut de altă mașină (`vehicle_id_retur`) — 293QVT pe Draxelmaier
  //     #14 nu se lega de nimic, deși returul era al lui Bordian Marin.
  //  2. Aceeași (mașină, rută, schimb) poate avea DOUĂ rânduri, unul fără șofer: 246BRAP
  //     pe Trox #5. Rândul gol nu are voie să-l acopere pe cel plin.
  //  3. Uneori graficul chiar n-are șofer trecut (456BRAX pe Ungheni #14) — atunci se
  //     spune asta pe pagină, nu se pune „?": lipsa din grafic e ea însăși o constatare.
  const soferulCursei = new Map<string, string>();
  const soferulReturului = new Map<string, string>();
  for (const a of atrib ?? []) {
    if (!a.driver_id) continue;
    const cheie = (v: unknown) => `${v}|${a.factory_route_id}|${a.shift_number}`;
    if (a.vehicle_id) soferulCursei.set(cheie(a.vehicle_id), a.driver_id as string);
    if (a.vehicle_id_retur) soferulReturului.set(cheie(a.vehicle_id_retur), a.driver_id as string);
  }

  const masurate: CursaMasurata[] = [];
  for (const c of curse ?? []) {
    const i = info.get(c.factory_route_id as string);
    if (!i) continue;
    const b = c.vehicle_id ? bazaMasina.get(c.vehicle_id as string) ?? null : null;
    const cheie = `${c.vehicle_id}|${c.factory_route_id}|${c.shift_number}`;
    const did = (c.sens === 'retur' ? soferulReturului.get(cheie) : null)
      ?? soferulCursei.get(cheie) ?? soferulReturului.get(cheie) ?? null;
    const p = c.prima_statie as { lat?: number; lon?: number; locality?: string } | null;
    masurate.push({
      vehicle_id: (c.vehicle_id as string) ?? null,
      factory_route_id: c.factory_route_id as string, eticheta: i.eticheta, uzina_id: i.uzina_id,
      shift_number: Number(c.shift_number), sens: c.sens as 'tur' | 'retur',
      km_real: Number(c.km_real ?? 0), km_goi: Number(c.km_goi ?? 0),
      km_gol_acasa: Number(c.km_gol_acasa ?? 0), km_gol_pauza: Number(c.km_gol_pauza ?? 0),
      opriri_gol_pe_traseu: c.opriri_gol_pe_traseu == null ? null : Number(c.opriri_gol_pe_traseu),
      km_livrare: Number(c.km_livrare ?? 0),
      prima_statie: p?.lat != null ? { lat: Number(p.lat), lon: Number(p.lon), locality: p.locality ?? null } : null,
      driver_id: did, sofer: did ? numeSofer.get(did) ?? null : null,
      sat_sofer: b?.locality ?? null, baza: b ? { lat: b.lat, lon: b.lon } : null,
    });
  }

  return { zi, alerte: ghidZilnic(masurate) };
}
