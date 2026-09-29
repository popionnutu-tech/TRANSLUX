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

  const [fl, co] = await Promise.all([
    sb.rpc('lde_fuel_flota', { de: f, pana: t }),
    sb.rpc('lde_fuel_consumatori', { de: f, pana: t }),
  ]);

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
export async function getAlimentariConsumator(variante: string[], from: string, to: string): Promise<Alimentare[]> {
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
    const detaliu = [variante.length > 1 ? r.placuta : null, r.sofer, r.observatii].filter(Boolean).join(' · ') || null;
    return { zi: r.zi, ora, litri: Number(r.litri), sursa: r.foaie ? `foaie ${r.foaie}` : r.sursa, detaliu };
  });
}
