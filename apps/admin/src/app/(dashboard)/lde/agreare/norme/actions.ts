'use server';

// Panoul normelor lunii pentru Clava (plan docs/plans/2026-10-07-panou-norme-clava.md, 3 runde Claude + Codex).
// Ion, 07.10.2026: «lunar se propun normele la auto și șoferi, și ea fie acceptă, fie nu acceptă și scrie comentariu de
// ce», «puțină informație încărcat, dar pentru ea să fie ușor, norma pe fiecare mașină, km total, litri total, iar dacă
// apeși să se deschidă detaliat»; două cifre (tipul / media mașinii pe 3 luni), Clava alege sau «pune norma pe care o
// crede și comentariu de ce, ca să învățăm sistemul»; luna se decide «după ce s-a închis»; posterul pleacă «doar după
// confirmarea mea». Norma pe șofer = norma aleasă a mașinii lui.

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { chisinauTodayIso, chisinauDayBounds } from '@/lib/chisinau-time';
import {
  UZINE_DIRS, UZINA_NUME, LUNA_RE, primaZi, ultimaZi, lunaInainte, reperele, deciziileLunii, confirmarea,
  type Ales, type Decizie, type Confirmare,
} from '@/lib/lde/norma-luna';
import { recupereazaPoster, BUCATI, type Bucata, type RezultatRecuperare } from '@/lib/lde/combustibil-poster';

const PRAG_KM = 300;           // ca pe /lde/agreare/consum: sub atât (sau sub 2 alimentări) consumul lunii nu spune nimic
const PRAG_ALIMENTARI = 2;
const SCHIMBAT = 0.03;         // reperele de azi diferă cu peste 3 % de cele înghețate la decizie → «⚠»

export type SoferRand = { id: string; nume: string; de: number; pana: number; propunere: boolean };
export type RandNorma = {
  vehicle_id: string; m: string; uzina: string; tip: string | null;
  km: number; litri: number; alimentari: number; consum: number | null; km_fara_gps: number;
  norma_tip: number | null; medie3: number | null; km3: number;
  decizie: Decizie | null;
  schimbat: boolean;              // reperele s-au mișcat după decizie
  luna_trecuta: Ales | null;      // ce a ales Clava luna trecută
  in_joc: number;                 // litri: km × |tip − medie3| / 100 — ce trebuie decis întâi
  soferi: SoferRand[];
};
export type NormeData = {
  luna: string; zileInLuna: number; inchisa: boolean; esteAdmin: boolean;
  randuri: RandNorma[]; confirmare: Confirmare | null;
};

async function sesiune(...roluri: ('ADMIN' | 'CONTABIL_LDE')[]) {
  return requireRole(await verifySession(), ...roluri);
}
const lunaCurenta = () => chisinauTodayIso().slice(0, 7);
const r1 = (x: number) => Math.round(x * 10) / 10;

export async function getNorme(lunaParam?: string): Promise<NormeData> {
  const s = await sesiune('ADMIN', 'CONTABIL_LDE');
  const curenta = lunaCurenta();
  // implicit: ultima lună închisă (Ion: «după ce luna s-a închis»)
  const luna = lunaParam && LUNA_RE.test(lunaParam) && lunaParam < curenta ? lunaParam : lunaInainte(curenta);
  const db = getSupabase();
  const de = primaZi(luna), pana = ultimaZi(luna);

  const { data: veh, error: ev } = await db.from('vehicles').select('id, plate_number, directions')
    .eq('active', true).overlaps('directions', [...UZINE_DIRS]).order('plate_number').limit(1000);
  if (ev) throw new Error(ev.message);
  const ids = (veh ?? []).map((v) => v.id);

  const [fl, rep, dec, decTrec, conf, agr, atrib] = await Promise.all([
    db.rpc('lde_fuel_flota', { de, pana }),
    reperele(luna, ids),
    deciziileLunii(luna, ids),
    deciziileLunii(lunaInainte(luna), ids),
    confirmarea(luna),
    db.from('lde_agreare_sofer').select('vehicle_id, driver_id, de, pana, drivers(full_name)').eq('luna', de).limit(1000),
    db.from('lde_active_assignments').select('vehicle_id, driver_id, drivers(full_name)').is('valid_to', null).in('vehicle_id', ids).limit(1000),
  ]);
  if (fl.error) throw new Error(fl.error.message);
  if (agr.error) throw new Error(agr.error.message);
  if (atrib.error) throw new Error(atrib.error.message);
  const flota = new Map<string, any>(((fl.data ?? []) as any[]).map((r) => [r.vehicle_id, r]));
  const zileInLuna = Number(pana.slice(8));
  const nume = (d: any) => (Array.isArray(d) ? d[0]?.full_name : d?.full_name) ?? '?';

  const soferi = new Map<string, SoferRand[]>();
  for (const a of (agr.data ?? []) as any[]) {
    if (!soferi.has(a.vehicle_id)) soferi.set(a.vehicle_id, []);
    soferi.get(a.vehicle_id)!.push({ id: a.driver_id, nume: nume(a.drivers), de: Number(String(a.de).slice(8)), pana: Number(String(a.pana).slice(8)), propunere: false });
  }
  // fără agreare salvată pe mașină: atribuirea de azi, ca propunere (pagina de agreare face la fel)
  for (const a of (atrib.data ?? []) as any[]) {
    const l = soferi.get(a.vehicle_id);
    if (l && l.some((x) => !x.propunere)) continue;
    if (!soferi.has(a.vehicle_id)) soferi.set(a.vehicle_id, []);
    soferi.get(a.vehicle_id)!.push({ id: a.driver_id, nume: nume(a.drivers), de: 1, pana: zileInLuna, propunere: true });
  }

  const randuri: RandNorma[] = [];
  for (const v of veh ?? []) {
    const f = flota.get(v.id);
    const km = f ? Number(f.km) : 0, litri = f ? Number(f.litri_cu_km) : 0;
    if (km <= 0 && litri <= 0) continue;
    const alimentari = f ? Number(f.benzol_n) + Number(f.foaie_n) : 0;
    const r = rep.get(v.id) ?? { norma_tip: null, tip: null, medie3: null, km3: 0 };
    const d = dec.get(v.id) ?? null;
    const misc = (a: number | null, b: number | null) => a != null && b != null && b > 0 && Math.abs(a - b) / b > SCHIMBAT;
    const uzKey = (v.directions as string[]).find((x) => UZINA_NUME[x]) ?? '';
    randuri.push({
      vehicle_id: v.id, m: v.plate_number, uzina: UZINA_NUME[uzKey] ?? uzKey, tip: r.tip,
      km, litri, alimentari, km_fara_gps: f ? Number(f.km_zile_lde) : 0,
      consum: km >= PRAG_KM && alimentari >= PRAG_ALIMENTARI && litri > 0 ? r1((litri / km) * 100) : null,
      norma_tip: r.norma_tip, medie3: r.medie3, km3: r.km3, decizie: d,
      schimbat: !!d && (misc(r.norma_tip, d.norma_tip) || misc(r.medie3, d.medie3)),
      luna_trecuta: decTrec.get(v.id)?.ales ?? null,
      in_joc: r.norma_tip != null && r.medie3 != null ? Math.round((km * Math.abs(r.norma_tip - r.medie3)) / 100) : 0,
      soferi: soferi.get(v.id) ?? [],
    });
  }
  // pe uzină; nedecisele sus, după litrii în joc; decisele jos
  randuri.sort((a, b) => a.uzina.localeCompare(b.uzina, 'ro') || Number(!!a.decizie) - Number(!!b.decizie)
    || b.in_joc - a.in_joc || a.m.localeCompare(b.m));
  return { luna, zileInLuna, inchisa: luna < curenta, esteAdmin: s.role === 'ADMIN', randuri, confirmare: conf };
}

export type ZiDetaliu = { zi: number; km: number };
export type Alimentare = { zi: string; ora: string | null; litri: number };
export type SoferDetaliu = SoferRand & { km: number; litri: number | null; abatere: number | null };
export type Detaliu = { zile: ZiDetaliu[]; alimentari: Alimentare[]; soferi: SoferDetaliu[]; km_gps: number };

/** La ▸: zilele (km GPS), alimentările și partea fiecărui șofer — o singură mașină (sub 1000 de rânduri). */
export async function getDetaliuMasina(luna: string, vehicleId: string, soferi: SoferRand[], consum: number | null, norma: number | null): Promise<Detaliu> {
  await sesiune('ADMIN', 'CONTABIL_LDE');
  if (!LUNA_RE.test(luna) || !/^[0-9a-f-]{36}$/.test(vehicleId)) throw new Error('Cerere invalidă');
  const db = getSupabase();
  const de = primaZi(luna), pana = ultimaZi(luna);
  const [g, b, f] = await Promise.all([
    db.from('lde_vehicle_gps_daily').select('date, km_total, km_patched').eq('vehicle_id', vehicleId).gte('date', de).lte('date', pana).order('date'),
    db.from('lde_fuel_alimentari').select('alimentat_at, litri').eq('vehicle_id', vehicleId)
      .gte('alimentat_at', chisinauDayBounds(de).fromIso).lt('alimentat_at', chisinauDayBounds(pana).toIso).order('alimentat_at'),
    db.from('lde_fuel_foaie').select('zi, litri').eq('vehicle_id', vehicleId).gte('zi', de).lte('zi', pana).order('zi'),
  ]);
  for (const r of [g, b, f]) if (r.error) throw new Error(r.error.message);
  // ca în lde_fuel_flota (ION-145): ziua de parcare cu km cârpiți nu aduce km
  const zile: ZiDetaliu[] = (g.data ?? []).map((d: any) => {
    const t = Number(d.km_total), p = Number(d.km_patched ?? 0);
    return { zi: Number(String(d.date).slice(8)), km: Math.round(p > 0 && t - p < 5 ? Math.max(t - p, 0) : t) };
  });
  const alimentari: Alimentare[] = [
    ...(b.data ?? []).map((r: any) => {
      const l = new Date(r.alimentat_at).toLocaleString('sv-SE', { timeZone: 'Europe/Chisinau' });
      return { zi: l.slice(0, 10), ora: l.slice(11, 16), litri: Number(r.litri) };
    }),
    ...(f.data ?? []).map((r: any) => ({ zi: r.zi as string, ora: null, litri: Number(r.litri) })),
  ].sort((x, y) => (x.zi + (x.ora ?? '')).localeCompare(y.zi + (y.ora ?? '')));
  const kmZi = new Map(zile.map((z) => [z.zi, z.km]));
  const out: SoferDetaliu[] = soferi.slice(0, 20).map((s) => {
    let km = 0;
    for (let z = Math.max(1, s.de); z <= Math.min(31, s.pana); z++) km += kmZi.get(z) ?? 0;
    const litri = consum != null ? Math.round((km * consum) / 100) : null;
    return { ...s, km, litri, abatere: litri != null && norma != null ? Math.round(litri - (norma * km) / 100) : null };
  });
  return { zile, alimentari, soferi: out, km_gps: zile.reduce((s, z) => s + z.km, 0) };
}

/** Decizia Clavei pe o mașină. Reperele se RECALCULEAZĂ aici (nu vin din browser) și se îngheață în rând. */
export async function decide(luna: string, vehicleId: string, ales: Ales, normaEi?: number, comentariu?: string): Promise<void> {
  const s = await sesiune('ADMIN', 'CONTABIL_LDE');
  if (!LUNA_RE.test(luna) || luna >= lunaCurenta()) throw new Error('Se decide doar o lună închisă');
  if (!/^[0-9a-f-]{36}$/.test(vehicleId)) throw new Error('Mașină invalidă');
  if (!['tip', 'medie3', 'clava'].includes(ales)) throw new Error('Alegere invalidă');
  const db = getSupabase();
  if (s.role !== 'ADMIN' && (await confirmarea(luna))) throw new Error('Luna e confirmată de Ion — schimbarea o face doar el');
  const { data: v, error: ev } = await db.from('vehicles').select('id, directions').eq('id', vehicleId).maybeSingle();
  if (ev) throw new Error(ev.message);
  if (!v || !(v.directions as string[]).some((d) => (UZINE_DIRS as readonly string[]).includes(d))) throw new Error('Mașina nu e de uzină');
  const r = (await reperele(luna, [vehicleId])).get(vehicleId)!;
  let norma: number | null;
  let com: string | null = null;
  if (ales === 'tip') norma = r.norma_tip;
  else if (ales === 'medie3') norma = r.medie3;
  else {
    norma = Number(normaEi);
    com = (comentariu ?? '').trim();
    if (!Number.isFinite(norma) || norma <= 0 || norma >= 100) throw new Error('Norma trebuie să fie între 0 și 100 l/100 km');
    if (com.length < 5) throw new Error('Scrie de ce (cel puțin câteva cuvinte)');
    if (com.length > 1000) throw new Error('Comentariul e prea lung (max. 1000 de caractere)');
    norma = Math.round(norma * 100) / 100;
  }
  if (norma == null) throw new Error(ales === 'tip' ? 'Mașina n-are tip în nomenclator' : 'Mașina n-are consum în cele 3 luni');
  const { error } = await db.from('lde_norma_luna').upsert({
    luna: primaZi(luna), vehicle_id: vehicleId, norma_tip: r.norma_tip, medie3: r.medie3, km3: r.km3,
    ales, norma, comentariu: com, decis_de: s.email, decis_la: new Date().toISOString(),
  }, { onConflict: 'luna,vehicle_id' });
  if (error) throw new Error(error.message);
  revalidatePath('/lde/agreare/norme');
}

/** Ion confirmă normele lunii și trimite posterul în grupă (Ion: «doar după confirmarea mea»). */
export async function confirmaLuna(luna: string): Promise<RezultatRecuperare> {
  const s = await sesiune('ADMIN');
  if (!LUNA_RE.test(luna) || luna >= lunaCurenta()) throw new Error('Se confirmă doar o lună închisă');
  const { error } = await getSupabase().from('lde_norma_luna_confirmare')
    .upsert({ luna: primaZi(luna), confirmat_de: s.email }, { onConflict: 'luna', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  const r = await recupereazaPoster(luna);
  revalidatePath('/lde/agreare/norme');
  return r;
}

/** «Trimite din nou»: doar bucățile netrimise / refuzate de Telegram. */
export async function trimiteDinNou(luna: string): Promise<RezultatRecuperare> {
  await sesiune('ADMIN');
  if (!LUNA_RE.test(luna)) throw new Error('Lună invalidă');
  const r = await recupereazaPoster(luna);
  revalidatePath('/lde/agreare/norme');
  return r;
}

/** Bucată cu rezultat nesigur: Ion a văzut-o în grupă («A plecat») sau o retrimite conștient («Retrimite»). */
export async function hotarasteBucata(luna: string, bucata: Bucata, aPlecat: boolean): Promise<RezultatRecuperare | null> {
  await sesiune('ADMIN');
  if (!LUNA_RE.test(luna) || !BUCATI.includes(bucata)) throw new Error('Cerere invalidă');
  const conf = await confirmarea(luna);
  if (!conf) throw new Error('Luna nu e confirmată');
  if (!aPlecat) {
    const r = await recupereazaPoster(luna, { explicit: [bucata] });
    revalidatePath('/lde/agreare/norme');
    return r;
  }
  const stare = { ...conf.poster_rezultat, [bucata]: 'ok' as const };
  const gata = BUCATI.every((b) => stare[b] === 'ok');
  const { error } = await getSupabase().from('lde_norma_luna_confirmare')
    .update({ poster_rezultat: stare, poster_motiv: null, ...(gata ? { poster_trimis_la: new Date().toISOString() } : {}) })
    .eq('luna', primaZi(luna));
  if (error) throw new Error(error.message);
  revalidatePath('/lde/agreare/norme');
  return null;
}
