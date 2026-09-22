'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';

/**
 * Regulile livrării, pe uzină — Ion, 22.09.2026: «fiecare livrare uzina are ai reguli,
 * trebuie sa marcam».
 *
 * Cifrele NU se scriu de mână în pagină: se numără la fiecare deschidere din bază, ca să nu
 * îmbătrânească. Textul regulii și steagul de validare se marchează de ADMIN (migr. 386).
 */
export type RegulaUzinei = {
  id: string;
  nume: string;
  oras: string | null;
  validata: boolean;
  reguli: string | null;
  marcata_la: string | null;
  rute: number;
  porti: number;
  granite_invatate: number;
  granite_total: number;
  start_real: number;     // rute×schimb cu sat de start dedus din opriri (migr. 380)
  pe_oprire: number;      // rute×schimb care se taie la prima urcare (migr. 385)
};

async function citesteTot<T>(
  q: () => { range: (de: number, la: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> },
): Promise<T[]> {
  const out: T[] = []; const pas = 1000;
  for (let de = 0; ; de += pas) {
    const { data, error } = await q().range(de, de + pas - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < pas) break;
  }
  return out;
}

export async function getReguliUzine(): Promise<RegulaUzinei[]> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const [uzine, rute, porti, granite, etaloane] = await Promise.all([
    citesteTot<{ id: string; display_name: string; city: string | null; livrare_validata: boolean; reguli_livrare: string | null; reguli_livrare_la: string | null }>(
      () => sb.from('lde_uzine').select('id,display_name,city,livrare_validata,reguli_livrare,reguli_livrare_la').eq('active', true).order('id')),
    citesteTot<{ id: string; uzina_id: string }>(() => sb.from('lde_factory_routes').select('id,uzina_id').eq('active', true)),
    citesteTot<{ uzina_id: string }>(() => sb.from('lde_uzine_gates').select('uzina_id').eq('active', true)),
    citesteTot<{ uzina_id: string; sursa: string | null }>(() => sb.from('lde_uzina_shift_boundaries').select('uzina_id,sursa')),
    citesteTot<{ factory_route_id: string; sat_start_real: string | null; taie_pe_oprire: boolean | null }>(
      () => sb.from('lde_route_etalon').select('factory_route_id,sat_start_real,taie_pe_oprire')),
  ]);

  const uzinaRutei = new Map(rute.map((r) => [r.id, r.uzina_id]));
  const nr = <T>(list: T[], cheie: (x: T) => string | undefined) => {
    const m = new Map<string, number>();
    for (const x of list) { const k = cheie(x); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };
  const nrRute = nr(rute, (r) => r.uzina_id);
  const nrPorti = nr(porti, (g) => g.uzina_id);
  const nrGranite = nr(granite, (b) => b.uzina_id);
  const nrInvatate = nr(granite.filter((b) => b.sursa === 'invatat'), (b) => b.uzina_id);
  const nrStart = nr(etaloane.filter((e) => e.sat_start_real), (e) => uzinaRutei.get(e.factory_route_id));
  const nrOprire = nr(etaloane.filter((e) => e.taie_pe_oprire), (e) => uzinaRutei.get(e.factory_route_id));

  return uzine.map((u) => ({
    id: u.id, nume: u.display_name, oras: u.city,
    validata: !!u.livrare_validata, reguli: u.reguli_livrare, marcata_la: u.reguli_livrare_la,
    rute: nrRute.get(u.id) ?? 0,
    porti: nrPorti.get(u.id) ?? 0,
    granite_invatate: nrInvatate.get(u.id) ?? 0,
    granite_total: nrGranite.get(u.id) ?? 0,
    start_real: nrStart.get(u.id) ?? 0,
    pe_oprire: nrOprire.get(u.id) ?? 0,
  })).sort((a, b) => b.rute - a.rute);
}

/** Marchează regula unei uzine. Textul e al lui Ion; data se pune singură. */
export async function salveazaRegulaUzinei(uzina_id: string, reguli: string, validata: boolean): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const text = reguli.trim();
  const { error } = await getSupabase().from('lde_uzine').update({
    reguli_livrare: text || null,
    livrare_validata: validata,
    reguli_livrare_la: new Date().toISOString(),
  }).eq('id', uzina_id);
  if (error) throw new Error(`nu s-a putut salva regula uzinei: ${error.message}`);
  revalidatePath('/lde/livrare-reguli');
}
