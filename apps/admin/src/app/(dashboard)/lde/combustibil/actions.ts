'use server';

// Registrul combustibilului (ION-135): fiecare mașină din flotă (și cele oprite) și fiecare consumator
// din afara flotei (plăcuțe străine, vânzări, benzovoz, consum intern, utilaje…), pe perioadă, cu
// fiecare alimentare la click. Sursele: lde_fuel_alimentari (benzol, cu oră), lde_fuel_foaie (foile
// LDE, pe zi), lde_fuel_strain (tot ce nu e al flotei). Totalurile vin din funcțiile migr. 434.

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { chisinauTodayIso, chisinauDayBounds } from '@/lib/chisinau-time';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// «Descriere unificată»: cheia apare de cel puțin atâtea ori pe tot istoricul; restul = izolate
const PRAG_UNIFICAT = 4;
const DETALIU_MAX = 3000;

export type FlotaRow = {
  vehicle_id: string;
  plate_number: string;
  active: boolean;
  directie: string;
  benzol_n: number;
  benzol_l: number;
  foaie_n: number;
  foaie_l: number;
  total_l: number;
  km: number;                 // km pe perioadă: GPS-ul nostru pe zi, altfel km_m2m din LDE (migr. 436)
  km_zile_gps: number;
  km_zile_lde: number;
  fereastra_de: string | null;   // ION-162: camioanele — km și litri_cu_km pe cursele pornite în perioadă, până la plinul următor (GPS)
  fereastra_pana: string | null;
  litri_cu_km: number;       // litrii din zilele ≥ prima zi cu km (camioanele au km doar din iunie)
  consum: number | null;      // l/100 km faptic = litri_cu_km / km × 100; null sub 100 km
  norma: number | null;       // l/100 km, ca pe /lde/vehicule (măsurată, altfel a tipului)
  norma_teoretica: number | null;  // norma mașinii: consumul propriu plin la plin din 10.06 (≥ 3 pliniri), altfel cea veche
  norma_veche: boolean;       // true = sub 3 pliniri, norma de până acum (măsurată / Clava / a tipului) — «*» pe pagină
  consum3: number | null;     // l/100 km plin la plin de la 10.06.2026 până la «to» (ION-138: «aplică logica asta peste tot»)
  prima: string | null;
  ultima: string | null;
};

export type ConsumatorRow = {
  cheie: string;
  denumire: string;
  tip: string;
  variante: string[];
  surse: string[];
  randuri: number;
  litri: number;
  randuri_total: number;
  litri_total: number;
  prima: string;
  ultima: string;
  prima_p: string | null;     // prima / ultima alimentare ÎN perioadă
  ultima_p: string | null;
};

export type CombustibilData = {
  from: string;
  to: string;
  flota: FlotaRow[];
  consumatori: ConsumatorRow[];
  izolate: { chei: number; randuri: number; litri: number };
};

export type Alimentare = {
  zi: string;
  ora: string | null;
  litri: number;
  sursa: string;
  detaliu: string | null;
};

function directie(dirs: string[] | null, isLde: boolean): string {
  if (dirs && dirs.length) return dirs[0];
  return isLde ? 'LDE fără direcție' : 'fără direcție';
}

export async function getCombustibil(from?: string, to?: string): Promise<CombustibilData> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const today = chisinauTodayIso();
  const t = to && DATE_RE.test(to) ? to : today;
  let f = from && DATE_RE.test(from) ? from : `${today.slice(0, 4)}-01-01`;
  if (f > t) f = t;

  // Ca pe posterul lunar: «din iunie» = plin la plin de la 10.06.2026 (control, ≥ 3 intervale și ≥ 3.000 km); norma =
  // consumul din cele 3 luni închise de dinaintea perioadei, tras spre tipul mașinii (ION-154, lde_fuel_norma_eb), altfel norma veche
  const [fl, co] = await Promise.all([
    sb.rpc('lde_fuel_flota', { de: f, pana: t }),
    sb.rpc('lde_fuel_consumatori', { de: f, pana: t }),
  ]);
  const ids = (fl.data ?? []).filter((r: any) => Number(r.benzol_l) + Number(r.foaie_l) > 0 || Number(r.km) > 0).map((r: any) => r.vehicle_id);
  const [pl, eb] = await Promise.all([
    ids.length && t >= '2026-06-10' ? sb.rpc('lde_fuel_plin_la_plin', { de: '2026-06-10', pana: t, vehicule: ids }) : Promise.resolve({ data: [] as any[] }),
    ids.length ? sb.rpc('lde_fuel_norma_eb', { luna: f, vehicule: ids }) : Promise.resolve({ data: [] as any[] }),
  ]);
  const trei = new Map<string, any>((pl.data ?? []).map((r: any) => [r.vehicle_id, r]));
  const norme = new Map<string, any>((eb.data ?? []).map((r: any) => [r.vehicle_id, r]));

  const flota: FlotaRow[] = (fl.data ?? []).map((r: any) => ({
    vehicle_id: r.vehicle_id,
    plate_number: r.plate_number,
    active: r.active,
    directie: directie(r.directions, r.is_lde),
    benzol_n: Number(r.benzol_n),
    benzol_l: Number(r.benzol_l),
    foaie_n: Number(r.foaie_n),
    foaie_l: Number(r.foaie_l),
    total_l: Number(r.benzol_l) + Number(r.foaie_l),
    km: Number(r.km),
    km_zile_gps: Number(r.km_zile_gps),
    km_zile_lde: Number(r.km_zile_lde),
    fereastra_de: r.fereastra_de ?? null,
    fereastra_pana: r.fereastra_pana ?? null,
    litri_cu_km: Number(r.litri_cu_km),
    consum: Number(r.km) >= 100 && Number(r.litri_cu_km) > 0 ? (Number(r.litri_cu_km) / Number(r.km)) * 100 : null,
    norma: r.norma != null ? Number(r.norma) : null,
    ...(() => {
      const x = trei.get(r.vehicle_id);
      const plin = x && Number(x.intervale) >= 3 && Number(x.km) >= 3000 ? Number(x.consum) : null;
      const n = norme.get(r.vehicle_id);
      const veche = r.norma != null ? Number(r.norma) : r.norma_teoretica != null ? Number(r.norma_teoretica) : null;
      const norma = n?.norma != null ? Number(n.norma) : veche;
      return { consum3: plin, norma_teoretica: norma, norma_veche: n?.sursa !== 'eb' };
    })(),
    prima: r.prima,
    ultima: r.ultima,
  }));
  flota.sort((a, b) => b.total_l - a.total_l || a.plate_number.localeCompare(b.plate_number));

  const toti: ConsumatorRow[] = (co.data ?? []).map((r: any) => ({
    cheie: r.cheie,
    denumire: r.denumire,
    tip: r.tip,
    variante: r.variante ?? [],
    surse: r.surse ?? [],
    randuri: Number(r.randuri),
    litri: Number(r.litri),
    randuri_total: Number(r.randuri_total),
    litri_total: Number(r.litri_total),
    prima: r.prima,
    ultima: r.ultima,
    prima_p: r.prima_p,
    ultima_p: r.ultima_p,
  }));
  const izolateRows = toti.filter((c) => c.randuri_total < PRAG_UNIFICAT);
  const consumatori = toti
    .filter((c) => c.randuri_total >= PRAG_UNIFICAT)
    .sort((a, b) => b.litri - a.litri || b.litri_total - a.litri_total);

  return {
    from: f,
    to: t,
    flota,
    consumatori,
    izolate: {
      chei: izolateRows.length,
      randuri: izolateRows.reduce((s, c) => s + c.randuri, 0),
      litri: izolateRows.reduce((s, c) => s + c.litri, 0),
    },
  };
}

// Fiecare alimentare a unei mașini din flotă în perioadă: benzol (cu oră) + foaia LDE (pe zi).
export async function getAlimentariMasina(vehicleId: string, from: string, to: string): Promise<Alimentare[]> {
  requireRole(await verifySession(), 'ADMIN');
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return [];
  const sb = getSupabase();
  const [b, f] = await Promise.all([
    sb.from('lde_fuel_alimentari').select('alimentat_at, litri, source')
      .eq('vehicle_id', vehicleId)
      .gte('alimentat_at', chisinauDayBounds(from).fromIso).lt('alimentat_at', chisinauDayBounds(to).toIso)
      .order('alimentat_at', { ascending: false }).limit(DETALIU_MAX),
    sb.from('lde_fuel_foaie').select('zi, litri, foaie, sofer, km_total')
      .eq('vehicle_id', vehicleId).gte('zi', from).lte('zi', to)
      .order('zi', { ascending: false }).limit(DETALIU_MAX),
  ]);
  const out: Alimentare[] = [];
  for (const r of b.data ?? []) {
    const local = new Date(r.alimentat_at).toLocaleString('sv-SE', { timeZone: 'Europe/Chisinau' });
    out.push({ zi: local.slice(0, 10), ora: local.slice(11, 16), litri: Number(r.litri), sursa: r.source, detaliu: null });
  }
  for (const r of f.data ?? []) {
    const km = r.km_total != null ? `${Math.round(Number(r.km_total))} km` : null;
    out.push({ zi: r.zi, ora: null, litri: Number(r.litri), sursa: `foaie ${r.foaie}`,
      detaliu: [r.sofer, km].filter(Boolean).join(' · ') || null });
  }
  return out.sort((a, b) => (b.zi + (b.ora ?? '')).localeCompare(a.zi + (a.ora ?? '')));
}

// Fiecare alimentare a unui consumator din afara flotei (toate variantele de scriere ale cheii).
export async function getAlimentariConsumator(variante: string[], denumire: string, from: string, to: string): Promise<Alimentare[]> {
  requireRole(await verifySession(), 'ADMIN');
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || !variante.length) return [];
  const sb = getSupabase();
  const { data } = await sb.from('lde_fuel_strain')
    .select('zi, alimentat_at, litri, sursa, foaie, placuta, sofer, observatii')
    .in('placuta_norm', variante.slice(0, 200)).gte('zi', from).lte('zi', to)
    .order('zi', { ascending: false }).limit(DETALIU_MAX);
  return (data ?? []).map((r: any) => {
    const ora = r.alimentat_at
      ? new Date(r.alimentat_at).toLocaleString('sv-SE', { timeZone: 'Europe/Chisinau' }).slice(11, 16)
      : null;
    // plăcuța doar când e scrisă altfel decât denumirea rândului (CONSUMINTW sub CONSUMINTE)
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const altfel = norm(r.placuta ?? '') !== norm(denumire) ? r.placuta : null;
    const detaliu = [altfel, r.sofer, r.observatii].filter(Boolean).join(' · ') || null;
    return { zi: r.zi, ora, litri: Number(r.litri), sursa: r.foaie ? `foaie ${r.foaie}` : r.sursa, detaliu };
  });
}
