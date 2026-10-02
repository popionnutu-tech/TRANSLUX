'use server';

// Agrearea lunară a șoferilor pe mașinile de uzină (ION-174). Ion, 02.10.2026: «lunar Clava, în baza la
// locații, să poată agrea șoferii (în afară de mejgorod și prigorod), sau dacă mai mulți șoferi au lucrat
// la uzină pe mașină, să adauge mai mulți șoferi» + «trebuie să fie exact zilele sau perioada» + «de LDE
// trebuie să ne refuzăm». Surse: doar ale noastre — unde a dormit mașina în fiecare noapte (lde_noapte_zi,
// din harta mașinii / GPS) și satul șoferului (lde_driver_extras.home_address). Agrearea stă în
// lde_agreare_sofer și NU rescrie lde_active_assignments.

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';

const UZINE: Record<string, string> = {
  DRAXELMAIER_BALTI: 'Drăxlmaier',
  SEBN_ORHEI: 'SEBN',
  SEBN_STRASENI: 'SEBN',
  LEAR_UNGHENI: 'LEAR Ungheni',
  LEAR_FLORESTI: 'LEAR Florești',
};
const LUNA_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type Sursa = 'noapte' | 'atribuire' | 'manual';
export type SoferOpt = { id: string; nume: string; uzina: string; sat: string | null };
export type Noapte = { loc: string; zile: number[]; soferi: { id: string; nume: string }[] };
export type Agreat = { driver_id: string; nume: string; sat: string | null; de: number; pana: number; sursa: Sursa; zile: number[] };
export type RandAgreare = {
  vehicle_id: string; m: string; uzina: string;
  nopti: Noapte[];            // localitățile în care a dormit mașina în lună, cele mai multe nopți prima
  agreati: Agreat[];          // agrearea salvată; dacă nu există, propunerea din atribuirea activă
  salvat: boolean;
  confirmat_la: string | null;
  confirmat_de: string | null;
};
export type AgreareData = { luna: string; zileInLuna: number; randuri: RandAgreare[]; soferi: SoferOpt[] };

/** «Pământeni (Bălți)» ≈ «Bălți», «Sărata-Veche/Fălești» ≈ «Sărata Veche»: fără diacritice, fără semne, doar litere */
function cheieLoc(s: string | null | undefined): string[] {
  if (!s) return [];
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const baza = s.split('/')[0];
  const m = baza.match(/^(.*?)\s*\((.*?)\)\s*$/);
  const chei = m ? [norm(m[1]), norm(m[2])] : [norm(baza)];
  return chei.filter(Boolean);
}
const seSuprapun = (a: string[], b: string[]) => a.some((x) => b.includes(x));

export async function getAgreare(lunaParam?: string): Promise<AgreareData> {
  const session = await verifySession();
  requireRole(session, 'ADMIN', 'CONTABIL_LDE');
  const luna = lunaParam && LUNA_RE.test(lunaParam) ? lunaParam : new Date().toISOString().slice(0, 7);
  const [y, mo] = luna.split('-').map(Number);
  const zileInLuna = new Date(y, mo, 0).getDate();
  const primaZi = `${luna}-01`;
  const db = getSupabase();

  const [veh, nopti, drv, atrib, agr] = await Promise.all([
    db.from('vehicles').select('id, plate_number, directions').eq('active', true).overlaps('directions', Object.keys(UZINE)).order('plate_number').limit(1000),
    db.rpc('lde_agreare_nopti', { p_luna: primaZi }),
    db.from('drivers').select('id, full_name, lde_driver_extras(uzina_id, home_address)').eq('active', true).limit(1000),
    db.from('lde_active_assignments').select('driver_id, vehicle_id').is('valid_to', null).limit(1000),
    db.from('lde_agreare_sofer').select('vehicle_id, driver_id, de, pana, sursa, confirmat_la, confirmat_de').eq('luna', primaZi).limit(1000),
  ]);
  for (const r of [veh, nopti, drv, atrib, agr]) if (r.error) throw new Error(r.error.message);

  type DrvRow = { id: string; full_name: string; lde_driver_extras: { uzina_id: string | null; home_address: string | null } | { uzina_id: string | null; home_address: string | null }[] | null };
  const soferi: SoferOpt[] = (drv.data as DrvRow[]).map((d) => {
    const e = Array.isArray(d.lde_driver_extras) ? d.lde_driver_extras[0] : d.lde_driver_extras;
    return { id: d.id, nume: d.full_name, uzina: UZINE[e?.uzina_id ?? ''] ?? '', sat: e?.home_address?.split('/')[0] ?? null };
  }).sort((a, b) => a.nume.localeCompare(b.nume, 'ro'));
  const soferById = new Map(soferi.map((s) => [s.id, s]));
  const cheiSofer = new Map(soferi.map((s) => [s.id, cheieLoc(s.sat)]));

  const noptiPePlaca = new Map<string, { loc: string; zile: number[] }[]>();
  for (const r of (nopti.data ?? []) as { plate: string; loc: string; zile: number[] }[]) {
    if (!noptiPePlaca.has(r.plate)) noptiPePlaca.set(r.plate, []);
    noptiPePlaca.get(r.plate)!.push({ loc: r.loc, zile: r.zile });
  }
  const atribPeMasina = new Map<string, string[]>();
  for (const a of atrib.data ?? []) {
    if (!atribPeMasina.has(a.vehicle_id)) atribPeMasina.set(a.vehicle_id, []);
    atribPeMasina.get(a.vehicle_id)!.push(a.driver_id);
  }
  type AgrRow = { vehicle_id: string; driver_id: string; de: string; pana: string; sursa: Sursa; confirmat_la: string | null; confirmat_de: string | null };
  const agrPeMasina = new Map<string, AgrRow[]>();
  for (const a of (agr.data ?? []) as AgrRow[]) {
    if (!agrPeMasina.has(a.vehicle_id)) agrPeMasina.set(a.vehicle_id, []);
    agrPeMasina.get(a.vehicle_id)!.push(a);
  }

  const randuri: RandAgreare[] = [];
  for (const v of veh.data ?? []) {
    const uzKey = (v.directions as string[]).find((d) => UZINE[d]) ?? '';
    const uzina = UZINE[uzKey] ?? uzKey;
    const nopList = (noptiPePlaca.get(v.plate_number) ?? []).sort((a, b) => b.zile.length - a.zile.length);
    const nopti: Noapte[] = nopList.map((n) => {
      const chei = cheieLoc(n.loc);
      const acolo = soferi.filter((s) => seSuprapun(chei, cheiSofer.get(s.id) ?? []));
      // întâi șoferii uzinei, apoi ceilalți din același sat
      acolo.sort((a, b) => Number(b.uzina === uzina) - Number(a.uzina === uzina) || a.nume.localeCompare(b.nume, 'ro'));
      return { loc: n.loc, zile: n.zile, soferi: acolo.map((s) => ({ id: s.id, nume: s.nume })) };
    });
    const zileInSat = (driverId: string): number[] => {
      const chei = cheiSofer.get(driverId) ?? [];
      const out = new Set<number>();
      for (const n of nopList) if (seSuprapun(chei, cheieLoc(n.loc))) n.zile.forEach((z) => out.add(z));
      return [...out].sort((a, b) => a - b);
    };
    const salvate = agrPeMasina.get(v.id) ?? [];
    let agreati: Agreat[];
    if (salvate.length) {
      agreati = salvate.map((a) => ({
        driver_id: a.driver_id, nume: soferById.get(a.driver_id)?.nume ?? '?', sat: soferById.get(a.driver_id)?.sat ?? null,
        de: Number(a.de.slice(8, 10)), pana: Number(a.pana.slice(8, 10)), sursa: a.sursa, zile: zileInSat(a.driver_id),
      }));
    } else {
      agreati = (atribPeMasina.get(v.id) ?? []).filter((d) => soferById.has(d)).map((d) => {
        const zile = zileInSat(d);
        return {
          driver_id: d, nume: soferById.get(d)!.nume, sat: soferById.get(d)!.sat,
          de: zile.length ? zile[0] : 1, pana: zile.length ? zile[zile.length - 1] : zileInLuna,
          sursa: zile.length ? 'noapte' as const : 'atribuire' as const, zile,
        };
      });
    }
    randuri.push({
      vehicle_id: v.id, m: v.plate_number, uzina, nopti, agreati, salvat: salvate.length > 0,
      confirmat_la: salvate.find((a) => a.confirmat_la)?.confirmat_la ?? null,
      confirmat_de: salvate.find((a) => a.confirmat_de)?.confirmat_de ?? null,
    });
  }
  return { luna, zileInLuna, randuri, soferi };
}

export type AgreatIn = { driver_id: string; de: number; pana: number; sursa: Sursa };

/** Scrie agrearea unei mașini pe lună: lista completă a șoferilor cu perioadele lor; ce nu e în listă se șterge. */
export async function salveazaAgreare(luna: string, vehicleId: string, lista: AgreatIn[], confirma: boolean): Promise<void> {
  const session = await verifySession();
  requireRole(session, 'ADMIN', 'CONTABIL_LDE');
  if (!LUNA_RE.test(luna)) throw new Error('Luna invalidă');
  if (!/^[0-9a-f-]{36}$/.test(vehicleId)) throw new Error('Mașină invalidă');
  const [y, mo] = luna.split('-').map(Number);
  const zileInLuna = new Date(y, mo, 0).getDate();
  const ziIso = (z: number) => `${luna}-${String(z).padStart(2, '0')}`;
  const vazuti = new Set<string>();
  for (const a of lista) {
    if (!/^[0-9a-f-]{36}$/.test(a.driver_id) || vazuti.has(a.driver_id)) throw new Error('Șofer invalid sau dublat');
    vazuti.add(a.driver_id);
    if (!Number.isInteger(a.de) || !Number.isInteger(a.pana) || a.de < 1 || a.pana > zileInLuna || a.de > a.pana) throw new Error(`Perioadă invalidă (${a.de}–${a.pana})`);
    if (!['noapte', 'atribuire', 'manual'].includes(a.sursa)) throw new Error('Sursă invalidă');
  }
  const db = getSupabase();
  const primaZi = ziIso(1);
  const acum = new Date().toISOString();
  const { data: existente, error: e0 } = await db.from('lde_agreare_sofer').select('id, driver_id, confirmat_la, confirmat_de').eq('luna', primaZi).eq('vehicle_id', vehicleId);
  if (e0) throw new Error(e0.message);
  const deSters = (existente ?? []).filter((r) => !vazuti.has(r.driver_id)).map((r) => r.id);
  if (deSters.length) {
    const { error } = await db.from('lde_agreare_sofer').delete().in('id', deSters);
    if (error) throw new Error(error.message);
  }
  const confirmatVechi = (existente ?? []).find((r) => r.confirmat_la);
  const randuri = lista.map((a) => ({
    luna: primaZi, vehicle_id: vehicleId, driver_id: a.driver_id, de: ziIso(a.de), pana: ziIso(a.pana), sursa: a.sursa,
    updated_at: acum,
    confirmat_la: confirma ? acum : (confirmatVechi?.confirmat_la ?? null),
    confirmat_de: confirma ? session!.email : (confirmatVechi?.confirmat_de ?? null),
  }));
  if (randuri.length) {
    const { error } = await db.from('lde_agreare_sofer').upsert(randuri, { onConflict: 'luna,vehicle_id,driver_id' });
    if (error) throw new Error(error.message);
  }
}
