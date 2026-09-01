'use server';

// Nomenclatoarele flotei de camioane: mașinile și șoferii lor.
// Ion, 01.09: «Распределение водителя идёт только в номенклатуру авто… также
// должен быть в номенклатуре водителей для этого диспетчера именно на фуры».
//
// De ce nomenclator de șoferi, și nu lista tuturor șoferilor LDE: tabela
// lde_active_assignments e comună cu uzinele, iar un șofer are o singură
// atribuire activă în tot sistemul. Fără nomenclator, dispecerul de camioane
// putea lua un șofer de autobuz — și îi rupea salariul lunii și graficul uzinei.

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, type Session } from '@/lib/auth';
import { poateAccesa, poateScrie } from '@/lib/lde/camioane-nav';
import { chisinauTodayIso } from '@/lib/chisinau-time';

export type Rezultat = { ok: true; mesaj: string } | { error: string };

export type CamionFlota = {
  id: string;
  plate: string;
  fleetType: 'cisterna' | 'zernovoz' | null;
  driverId: string | null;
  driverName: string | null;
};

/** Șofer din nomenclatorul de camioane. `peCamion` = plăcuța pe care e acum. */
export type SoferCamion = { id: string; name: string; peCamion: string | null };

/** Candidat la nomenclator. `blocat` spune de ce nu poate fi adăugat. */
export type Candidat = { id: string; name: string; blocat: string | null };

const CALE = '/lde/camioane/flota';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Semnul adevărat al șoferului de uzină e categoria de salariu, nu mașina pe
// care stă azi: 34 de șoferi salarizați n-au nicio atribuire activă (concediu,
// mașină în reparație) și treceau de gardianul care întreba doar de atribuire.
const MESAJ_SALARIZAT =
  'Șoferul e salarizat pe categorie de uzină — din atribuirea lui se calculează km-ul lunii. '
  + 'Nu poate intra în flota de camioane fără decizia administratorului.';

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

/** Mesajele Postgres brute scurg nume de coloane — traducem doar ce e de business. */
function eroareCurata(e: { message: string; code?: string }, implicit: string): string {
  const m = e.message ?? '';
  if (m.includes('nu_e_camion')) return 'Mașina aleasă nu e camion din flota LDE';
  if (m.includes('nu_e_in_nomenclator')) return 'Șoferul nu e în nomenclatorul de camioane — adaugă-l întâi mai jos';
  if (m.includes('e_sofer_de_uzina')) return MESAJ_SALARIZAT;
  if (m.includes('titular_salarizat')) {
    return 'Camionul are acum un șofer salarizat pe categorie de uzină. Schimbarea lui se face de administrator, din Atribuiri: din atribuirea aceea se ia km-ul lunii la salariu.';
  }
  const strain = m.match(/in_afara_flotei:([^\s"]+)/);
  if (strain) {
    return `Șoferul e atribuit acum pe ${strain[1]}, mașină din afara flotei de camioane. `
      + 'Scoaterea lui de acolo se face din Atribuiri (administrator) — altfel se strică salariul și graficul uzinei.';
  }
  if (e.code === '22P02') return 'Identificator invalid';
  if (e.code === '23503') return 'Șoferul sau camionul ales nu mai există';
  console.error('[camioane/flota]', e.code, m);
  return implicit;
}

export async function getFlota(): Promise<{
  camioane: CamionFlota[];
  soferi: SoferCamion[];
  candidati: Candidat[];
}> {
  await cerereRol();
  const sb = getSupabase();

  const [vehRes, drvRes, nomRes, legRes, salRes] = await Promise.all([
    sb.from('vehicles')
      .select('id, plate_number, lde_truck_profile ( fleet_type )')
      .eq('active', true).eq('is_lde', true).contains('directions', ['camioane'])
      .order('plate_number'),
    sb.from('drivers').select('id, full_name').eq('active', true).eq('is_lde', true).order('full_name'),
    sb.from('lde_camion_soferi').select('driver_id'),
    // Atribuirile active, o singură citire pentru ambele nomenclatoare.
    sb.from('lde_active_assignments')
      .select('driver_id, vehicle_id, vehicles:vehicle_id ( plate_number, directions ), drivers:driver_id ( full_name )')
      .is('valid_to', null),
    // Șoferii salarizați pe categorie de uzină: pentru ei atribuirea e bază de
    // calcul, deci nu au ce căuta în nomenclatorul de camioane.
    sb.from('lde_driver_extras').select('driver_id, lde_salary_category, uzina_id')
      .not('lde_salary_category', 'is', null).not('uzina_id', 'is', null),
  ]);
  for (const r of [vehRes, drvRes, nomRes, legRes, salRes]) {
    if (r.error) { console.error('[camioane/flota]', r.error.message); throw new Error('Nu am putut citi flota'); }
  }

  type Leg = {
    driver_id: string; vehicle_id: string;
    vehicles: { plate_number: string; directions: string[] | null } | { plate_number: string; directions: string[] | null }[] | null;
    drivers: { full_name: string } | { full_name: string }[] | null;
  };
  const unu = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);

  const peVehicul = new Map<string, { id: string; name: string }>();
  const alSoferului = new Map<string, { plate: string; eCamion: boolean }>();
  for (const l of (legRes.data ?? []) as Leg[]) {
    const v = unu(l.vehicles);
    const d = unu(l.drivers);
    peVehicul.set(l.vehicle_id, { id: l.driver_id, name: d?.full_name ?? '—' });
    if (v) alSoferului.set(l.driver_id, { plate: v.plate_number, eCamion: (v.directions ?? []).includes('camioane') });
  }

  type Veh = { id: string; plate_number: string; lde_truck_profile: { fleet_type: string } | { fleet_type: string }[] | null };
  const camioane: CamionFlota[] = ((vehRes.data ?? []) as Veh[]).map((v) => {
    const p = unu(v.lde_truck_profile);
    const s = peVehicul.get(v.id) ?? null;
    return {
      id: v.id,
      plate: v.plate_number,
      fleetType: (p?.fleet_type as 'cisterna' | 'zernovoz' | undefined) ?? null,
      driverId: s?.id ?? null,
      driverName: s?.name ?? null,
    };
  });

  const inNomenclator = new Set(((nomRes.data ?? []) as { driver_id: string }[]).map((r) => r.driver_id));
  type Drv = { id: string; full_name: string };
  const toti = (drvRes.data ?? []) as Drv[];

  const soferi: SoferCamion[] = toti
    .filter((d) => inNomenclator.has(d.id))
    .map((d) => {
      const a = alSoferului.get(d.id);
      return { id: d.id, name: d.full_name, peCamion: a?.eCamion ? a.plate : null };
    });

  type Sal = { driver_id: string; lde_salary_category: number | null; uzina_id: string | null };
  const salarizati = new Set(
    ((salRes.data ?? []) as Sal[])
      .filter((r) => r.lde_salary_category !== null && r.lde_salary_category >= 1 && r.lde_salary_category <= 5)
      .map((r) => r.driver_id),
  );

  const candidati: Candidat[] = toti
    .filter((d) => !inNomenclator.has(d.id))
    .map((d) => {
      const a = alSoferului.get(d.id);
      const blocat = salarizati.has(d.id)
        ? 'salarizat pe categorie de uzină'
        : a && !a.eCamion ? `atribuit pe ${a.plate} (în afara flotei de camioane)` : null;
      return { id: d.id, name: d.full_name, blocat };
    });

  return { camioane, soferi, candidati };
}

/**
 * Atribuie sau scoate șoferul de pe un camion.
 * Toată munca o face funcția SQL: e o singură tranzacție, iar gardienii stau
 * lângă date. Trei scrieri PostgREST separate lăsau, la o cădere la mijloc, și
 * camionul și șoferul fără atribuire (review 01.09).
 */
export async function atribuieSofer(vehicleId: string, driverId: string | null): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereScriere(); } catch { return { error: 'Neautorizat' }; }
  if (!UUID_RE.test(vehicleId)) return { error: 'Camion invalid' };
  if (driverId !== null && !UUID_RE.test(driverId)) return { error: 'Șofer invalid' };

  const { data, error } = await getSupabase().rpc('lde_atribuie_sofer_camion', {
    p_vehicle_id: vehicleId,
    p_driver_id: driverId,
    p_actor: s.email,
    // Ziua Chișinăului: între 00:00 și 03:00, vara, toISOString() dă ziua de ieri.
    p_azi: chisinauTodayIso(),
  });
  if (error) return { error: eroareCurata(error, 'Atribuirea nu a putut fi salvată') };

  revalidatePath(CALE);
  revalidatePath('/lde/camioane');
  if (data === 'neschimbat') return { ok: true, mesaj: 'Șoferul era deja pe acest camion' };
  if (data === 'scos') return { ok: true, mesaj: 'Șoferul a fost scos de pe camion' };
  return { ok: true, mesaj: 'Șoferul a fost atribuit camionului' };
}

/** Adaugă un șofer în nomenclatorul de camioane. */
export async function adaugaSoferCamion(driverId: string): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereScriere(); } catch { return { error: 'Neautorizat' }; }
  if (!UUID_RE.test(driverId)) return { error: 'Șofer invalid' };
  const sb = getSupabase();

  const { data: drv, error: eDrv } = await sb.from('drivers')
    .select('id').eq('id', driverId).eq('active', true).eq('is_lde', true).maybeSingle();
  if (eDrv) return { error: eroareCurata(eDrv, 'Nu am putut citi șoferul') };
  if (!drv) return { error: 'Șoferul nu e activ în LDE' };

  const { data: eSalarizat, error: eSal } = await sb.rpc('lde_e_sofer_salarizat', { p_driver_id: driverId });
  if (eSal) return { error: eroareCurata(eSal, 'Nu am putut verifica șoferul') };
  if (eSalarizat === true) return { error: MESAJ_SALARIZAT };

  // Cine e acum pe o mașină din afara flotei rămâne acolo: nomenclatorul nu e
  // locul unde se rup atribuirile de uzină.
  // .limit(1), nu .maybeSingle(): indexul unic permite legal mai multe atribuiri
  // active pe schimburi diferite, iar maybeSingle ar da eroare tehnică în loc de răspuns.
  const { data: legRows, error: eLeg } = await sb.from('lde_active_assignments')
    .select('vehicles:vehicle_id ( plate_number, directions )')
    .eq('driver_id', driverId).is('valid_to', null).limit(1);
  if (eLeg) return { error: eroareCurata(eLeg, 'Nu am putut citi atribuirea curentă') };
  const leg = legRows?.[0] ?? null;
  const v = leg ? (Array.isArray(leg.vehicles) ? leg.vehicles[0] : leg.vehicles) as { plate_number: string; directions: string[] | null } | null : null;
  if (v && !(v.directions ?? []).includes('camioane')) {
    return { error: `Șoferul e atribuit pe ${v.plate_number}, mașină din afara flotei de camioane. Scoaterea lui de acolo se face din Atribuiri (administrator).` };
  }

  const { error } = await sb.from('lde_camion_soferi')
    .upsert({ driver_id: driverId, created_by: s.email, updated_by: s.email }, { onConflict: 'driver_id' });
  if (error) return { error: eroareCurata(error, 'Șoferul nu a putut fi adăugat') };
  revalidatePath(CALE);
  return { ok: true, mesaj: 'Șoferul a intrat în nomenclatorul de camioane' };
}

/** Scoate un șofer din nomenclator. Dacă e pe un camion, îl eliberează întâi. */
export async function scoateSoferCamion(driverId: string): Promise<Rezultat> {
  let s: Session;
  try { s = await cerereScriere(); } catch { return { error: 'Neautorizat' }; }
  if (!UUID_RE.test(driverId)) return { error: 'Șofer invalid' };
  const sb = getSupabase();

  const { data: legRows, error: eLeg } = await sb.from('lde_active_assignments')
    .select('vehicle_id, vehicles:vehicle_id ( plate_number, directions )')
    .eq('driver_id', driverId).is('valid_to', null).limit(1);
  if (eLeg) return { error: eroareCurata(eLeg, 'Nu am putut citi atribuirea curentă') };
  const leg = legRows?.[0] ?? null;
  const v = leg ? (Array.isArray(leg.vehicles) ? leg.vehicles[0] : leg.vehicles) as { plate_number: string; directions: string[] | null } | null : null;
  if (leg && v && (v.directions ?? []).includes('camioane')) {
    const r = await atribuieSofer(leg.vehicle_id as string, null);
    if ('error' in r) return r;
  }

  const { error } = await sb.from('lde_camion_soferi').delete().eq('driver_id', driverId);
  if (error) return { error: eroareCurata(error, 'Șoferul nu a putut fi scos') };
  console.info('[camioane/flota] scos din nomenclator', driverId, 'de', s.email);
  revalidatePath(CALE);
  return { ok: true, mesaj: 'Șoferul a ieșit din nomenclatorul de camioane' };
}

// Tipul camionului (cisternă/zernovoz) rămâne `seteazaTipCamion` din
// planificare/actions.ts — o singură implementare, folosită de ambele file.
