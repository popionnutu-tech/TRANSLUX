'use server';

// Consumul faptic pe șofer, lunar, din agrearea Clavei. Ion, 07.10.2026, pe răspunsurile Clavei la interviul normei:
// «litri total / km total» — consumul mașinii pe lună = toți litrii ÷ toți km-ii; partea șoferului = km-ii lui din GPS pe
// zilele agreate × consumul mașinii (schimbul la mijlocul plinului se împarte după km); «dacă a fost 2 șoferi sau mai
// mulți și este abatere — ne uităm»; «reține șeful». Prag: ≥ 300 km și ≥ 2 alimentări pe lună.
// Ion, 07.10.2026: «verificarea se face strict tipuri mașini și media 3 luni la această mașină» → două repere: norma tipului
// (lde_vehicle_types, fără norma măsurată a mașinii) și consumul mașinii în cele 3 luni închise de dinainte (r_masina din
// lde_fuel_norma_eb, brut, netras spre tip).
// Rezerva pe altă mașină câteva zile: litrii și km-ii merg la el, pe mașina aceea (un rând pe șofer × mașină).
// Doar mașinile de uzină: camioanele au evaluarea lor pe curse.

import { getSupabase } from '@/lib/supabase';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { getAgreare } from '../actions';

const PRAG_KM = 300;
const PRAG_ALIMENTARI = 2;

export type RandSofer = {
  driver_id: string;
  nume: string;
  m: string;
  uzina: string;
  de: number;
  pana: number;
  agreat: boolean;            // false = propunerea paginii (atribuire / nopți), Clava n-a salvat încă
  km: number;                 // GPS strict pe zilele lui
  litri: number | null;       // km × consumul mașinii; null sub prag
  consum: number | null;      // l/100 km = consumul mașinii în lună
  norma_tip: number | null;
  medie3: number | null;      // l/100 km ai mașinii în cele 3 luni închise de dinainte
  abatere_tip: number | null; // litri − reper × km / 100; + = supraconsum
  abatere_3l: number | null;
  soferi_pe_masina: number;
  peste: boolean;             // peste norma tipului sau peste media celor 3 luni
  de_verificat: boolean;      // ≥ 2 șoferi pe mașină și peste: «ne uităm»
};

export type RandMasina = {
  vehicle_id: string;
  m: string;
  uzina: string;
  tip: string | null;
  litri: number;
  km: number;
  alimentari: number;
  consum: number | null;
  norma_tip: number | null;
  medie3: number | null;
  km3: number;                // km-ii din care e făcută media pe 3 luni
  km_fara_sofer: number;      // km GPS în zile pe care nu e agreat nimeni
  sub_prag: boolean;
};

export type ConsumData = { luna: string; pana: string; trei_de: string; trei_pana: string; soferi: RandSofer[]; masini: RandMasina[] };

const kmZi = (d: { km_total: number | string; km_patched: number | string | null }) => {
  const t = Number(d.km_total), p = Number(d.km_patched ?? 0);
  // ca în lde_fuel_flota (ION-145): ziua de parcare cu km cârpiți nu aduce km
  return p > 0 && t - p < 5 ? Math.max(t - p, 0) : t;
};
const abatere = (litri: number | null, reper: number | null, km: number) =>
  litri != null && reper != null && km > 0 ? litri - (reper * km) / 100 : null;

export async function getConsumSoferi(lunaParam?: string): Promise<ConsumData> {
  const ag = await getAgreare(lunaParam); // verifică rolul (ADMIN, CONTABIL_LDE)
  const luna = ag.luna;
  const primaZi = `${luna}-01`;
  const azi = chisinauTodayIso();
  const ultimaZi = `${luna}-${String(ag.zileInLuna).padStart(2, '0')}`;
  const pana = ultimaZi < azi ? ultimaZi : azi;
  const db = getSupabase();
  const ids = ag.randuri.filter((r) => r.uzina !== 'Camioane').map((r) => r.vehicle_id);

  const [fl, eb, nt] = await Promise.all([
    db.rpc('lde_fuel_flota', { de: primaZi, pana }),
    ids.length ? db.rpc('lde_fuel_norma_eb', { luna: primaZi, vehicule: ids }) : Promise.resolve({ data: [] as any[], error: null }),
    ids.length ? db.from('lde_vehicle_norms').select('vehicle_id, lde_vehicle_types ( display_name, norm_l_per_100km )').in('vehicle_id', ids)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  for (const r of [fl, eb, nt]) if (r.error) throw new Error(r.error.message);
  const flota = new Map<string, any>((fl.data ?? []).map((r: any) => [r.vehicle_id, r]));
  const trei = new Map<string, any>((eb.data ?? []).map((r: any) => [r.vehicle_id, r]));
  const tipuri = new Map<string, { nume: string | null; norma: number | null }>((nt.data ?? []).map((r: any) => {
    const t = Array.isArray(r.lde_vehicle_types) ? r.lde_vehicle_types[0] : r.lde_vehicle_types;
    return [r.vehicle_id, { nume: t?.display_name ?? null, norma: t?.norm_l_per_100km != null ? Number(t.norm_l_per_100km) : null }];
  }));
  const e0 = (eb.data ?? [])[0] as any;

  // km GPS pe zi; PostgREST taie la 1000 de rânduri, deci pe pagini
  const kmPeZi = new Map<string, Map<number, number>>();
  for (let off = 0; ids.length && off < 20000; off += 1000) {
    const { data, error } = await db.from('lde_vehicle_gps_daily').select('vehicle_id, date, km_total, km_patched')
      .in('vehicle_id', ids).gte('date', primaZi).lte('date', pana).gt('km_total', 0)
      .order('vehicle_id').order('date').range(off, off + 999);
    if (error) throw new Error(error.message);
    for (const d of data ?? []) {
      if (!kmPeZi.has(d.vehicle_id)) kmPeZi.set(d.vehicle_id, new Map());
      kmPeZi.get(d.vehicle_id)!.set(Number(String(d.date).slice(8, 10)), kmZi(d));
    }
    if ((data ?? []).length < 1000) break;
  }

  const soferi: RandSofer[] = [];
  const masini: RandMasina[] = [];
  // camioanele se judecă pe curse care trec peste lună (ION-162), nu pe zilele calendaristice: nu intră aici
  for (const r of ag.randuri) {
    if (r.uzina === 'Camioane') continue;
    const f = flota.get(r.vehicle_id);
    const litri = f ? Number(f.litri_cu_km) : 0;
    const km = f ? Number(f.km) : 0;
    const alimentari = f ? Number(f.benzol_n) + Number(f.foaie_n) : 0;
    const tip = tipuri.get(r.vehicle_id);
    const normaTip = tip?.norma ?? null;
    const t3 = trei.get(r.vehicle_id);
    const medie3 = t3?.r_masina != null ? Number(t3.r_masina) : null;
    const subPrag = km < PRAG_KM || alimentari < PRAG_ALIMENTARI || litri <= 0;
    const consum = subPrag ? null : (litri / km) * 100;
    const zile = kmPeZi.get(r.vehicle_id) ?? new Map<number, number>();
    const acoperite = new Set<number>();
    for (const a of r.agreati) for (let z = a.de; z <= a.pana; z++) acoperite.add(z);
    let kmFara = 0;
    for (const [z, k] of zile) if (!acoperite.has(z)) kmFara += k;
    if (litri > 0 || km > 0 || r.agreati.length) {
      masini.push({
        vehicle_id: r.vehicle_id, m: r.m, uzina: r.uzina, tip: tip?.nume ?? null, litri, km, alimentari, consum,
        norma_tip: normaTip, medie3, km3: t3 ? Number(t3.km_calib) : 0, km_fara_sofer: kmFara, sub_prag: subPrag,
      });
    }
    for (const a of r.agreati) {
      let kmS = 0;
      for (let z = a.de; z <= a.pana; z++) kmS += zile.get(z) ?? 0;
      const litriS = consum != null ? (kmS * consum) / 100 : null;
      const abTip = abatere(litriS, normaTip, kmS);
      const ab3 = abatere(litriS, medie3, kmS);
      const peste = (abTip ?? 0) > 0 || (ab3 ?? 0) > 0;
      soferi.push({
        driver_id: a.driver_id, nume: a.nume, m: r.m, uzina: r.uzina, de: a.de, pana: a.pana, agreat: r.salvat,
        km: kmS, litri: litriS, consum, norma_tip: normaTip, medie3, abatere_tip: abTip, abatere_3l: ab3,
        soferi_pe_masina: r.agreati.length, peste, de_verificat: r.agreati.length >= 2 && peste,
      });
    }
  }
  soferi.sort((a, b) => a.nume.localeCompare(b.nume, 'ro') || a.m.localeCompare(b.m));
  masini.sort((a, b) => a.uzina.localeCompare(b.uzina, 'ro') || a.m.localeCompare(b.m));
  return { luna, pana, trei_de: e0?.calib_de ?? '', trei_pana: e0?.calib_pana ?? '', soferi, masini };
}
