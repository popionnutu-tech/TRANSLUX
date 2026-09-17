'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { ZILE_MAX } from '@/lib/lde/trasee';

// Fereastra e plafonată explicit: 111 rute × 30 de zile × până la 3 schimburi × 2 sensuri
// trece cu mult peste plafonul PostgREST de 1000 de rânduri, iar tăierea e TĂCUTĂ.
// De aceea agregarea se face server-side, în `lde_trasee_sumar`, care întoarce un rând pe
// combinație — FĂRĂ geometrie. Geometria se cere separat, doar pentru ruta aleasă pe hartă
// (regula scrisă în migr. 206: «NICIODATĂ SELECT * în liste»).
// Constanta stă în lib/lde/trasee.ts, NU aici: într-un fișier 'use server' se pot exporta
// DOAR funcții async. `tsc` nu prinde regula asta — e a lui Next, nu a TypeScript — iar
// build-ul pică abia pe Vercel.

export type TraseuRand = {
  factory_route_id: string;
  uzina_id: string;
  route_number: number;
  stops_in_order: string | null;
  shift_number: number;
  slot: number;
  sens: 'tur' | 'retur';
  sate: { nume: string; pondere: number }[];
  km_median: number | null;
  observations: number;
  source: 'gps_trace' | 'operator_km';
  motiv_lipsa: string | null;
  curse: number;
  abatere_medie: number | null;
  km_goi_total: number | null;
  ambigue: number;
};

export type ImpacareZi = {
  gps_date: string;
  km_total: number;
  km_plin: number;
  km_gol: number;
  km_necunoscut: number;
  km_neatribuiti: number;   // DERIVAT, nu stocat — altfel identitatea ar fi adevărată prin definiție
  masini_esuate: number;
};

export async function getTrasee(zile = ZILE_MAX): Promise<TraseuRand[]> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const { data, error } = await sb.rpc('lde_trasee_sumar', { p_zile: Math.min(zile, ZILE_MAX) });
  if (error) throw new Error(`trasee: ${error.message}`);
  return (data ?? []) as TraseuRand[];
}

/**
 * Linia de împăcare, pe zi: km_total = utili + goi + necunoscut + neatribuiți.
 * `km_neatribuiti` se DERIVĂ aici, nu se citește dintr-o coloană: dacă ar fi stocat ca
 * rest, identitatea ar fi adevărată prin definiție și n-ar putea prinde niciodată un
 * segment pierdut — adică exact funcția pentru care există.
 */
export async function getImpacare(zile = 14): Promise<ImpacareZi[]> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const de = new Date(Date.now() - zile * 86400000).toISOString().slice(0, 10);

  const [{ data: contrib }, { data: zilnic }] = await Promise.all([
    sb.from('lde_route_day_contrib').select('gps_date, vehicle_id, km_plin, km_gol, km_necunoscut, stare').gte('gps_date', de),
    sb.from('lde_vehicle_gps_daily').select('date, vehicle_id, km_total').gte('date', de),
  ]);

  const kmMasinaZi = new Map<string, number>();
  for (const z of zilnic ?? []) kmMasinaZi.set(`${z.vehicle_id}|${z.date}`, Number(z.km_total) || 0);

  const peZi = new Map<string, ImpacareZi>();
  for (const c of contrib ?? []) {
    const z = c.gps_date as string;
    if (!peZi.has(z)) peZi.set(z, { gps_date: z, km_total: 0, km_plin: 0, km_gol: 0, km_necunoscut: 0, km_neatribuiti: 0, masini_esuate: 0 });
    const r = peZi.get(z)!;
    r.km_plin += Number(c.km_plin) || 0;
    r.km_gol += Number(c.km_gol) || 0;
    r.km_necunoscut += Number(c.km_necunoscut) || 0;
    r.km_total += kmMasinaZi.get(`${c.vehicle_id}|${z}`) ?? 0;
    if (c.stare === 'esuat') r.masini_esuate++;
  }
  for (const r of peZi.values()) {
    r.km_neatribuiti = +(r.km_total - r.km_plin - r.km_gol - r.km_necunoscut).toFixed(1);
    r.km_total = +r.km_total.toFixed(1); r.km_plin = +r.km_plin.toFixed(1);
    r.km_gol = +r.km_gol.toFixed(1); r.km_necunoscut = +r.km_necunoscut.toFixed(1);
  }
  return [...peZi.values()].sort((a, b) => b.gps_date.localeCompare(a.gps_date));
}

/** Geometria unei curse — cerută separat, NU în listă. */
export async function getGeometrie(factory_route_id: string, shift_number: number, slot: number, sens: string) {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const { data } = await sb.from('lde_route_etalon').select('geom')
    .eq('factory_route_id', factory_route_id).eq('shift_number', shift_number)
    .eq('slot', slot).eq('sens', sens).maybeSingle();
  return (data?.geom ?? null) as { type: string; coordinates: number[][][] } | null;
}

// ── propunerile de repartizare ────────────────────────────────────────────────
// ⚠️ Coloanele de aici sunt DATE DE DOMICILIU. Un tabel cu distanțele unui șofer către
// primele stații ale zecilor de rute cu coordonate știute îi localizează casa prin
// trilaterație, chiar dacă nu afișează nicio coordonată. Rămân ADMIN-only și NU intră în
// nicio lărgire de rol fără o decizie separată.
import { propuneriSchimb, economieCumulata, type RutaCost, type SoferCurent, type Propunere } from '@/lib/lde/trasee';

export type PropuneriRezultat = {
  propuneri: Propunere[];
  economie_km_zi: number;
  soferi_analizati: number;
  fara_baza: number;
  rute_fara_etalon: number;
  rute_incomplete: number;   // au etalon doar pe un sens → costul n-ar fi comparabil
};

export async function getPropuneri(): Promise<PropuneriRezultat> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const de = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [{ data: etaloane }, { data: atribuiri }, { data: baze }, { data: soferi }, { data: rute }] = await Promise.all([
    // ordonat DETERMINIST: schimbul 1, slotul 1, apoi cel cu cele mai multe observații.
    // O rută are un etalon pe fiecare (schimb × slot × sens) — la Orhei 17 sunt două de
    // tur, cu puncte de plecare diferite. Fără ordonare, „primul citit" era la voia bazei,
    // iar costul aceleiași rute putea ieși altul la fiecare încărcare a paginii.
    sb.from('lde_route_etalon').select('factory_route_id, sens, shift_number, slot, observations, prima_statie, ultima_statie')
      .or('prima_statie.not.is.null,ultima_statie.not.is.null')
      .order('shift_number', { ascending: true }).order('slot', { ascending: true })
      .order('observations', { ascending: false }),
    // Ruta unui șofer NU se ia din `lde_active_assignments`: acolo `route_id` e gol pe
    // toate cele 80 de rânduri active — atribuirea de lungă durată leagă doar șoferul de
    // mașină. Ruta trăiește în graficul zilnic, deci se ia ruta pe care omul a fost cel
    // mai des în ultimele 30 de zile.
    sb.from('lde_atribuiri_zilnice').select('driver_id, vehicle_id, factory_route_id')
      .eq('route_kind', 'uzina').gte('date', de)
      .not('driver_id', 'is', null).not('factory_route_id', 'is', null),
    sb.from('lde_gps_stops').select('vehicle_id, lat, lon').eq('is_base', true).gte('date', de),
    sb.from('drivers').select('id, full_name').eq('active', true),
    sb.from('lde_factory_routes').select('id, uzina_id, route_number').eq('active', true),
  ]);

  // baza unei mașini = mediana nopților ei; o singură noapte nu face o casă
  const puncte = new Map<string, { lat: number; lon: number }[]>();
  for (const b of baze ?? []) {
    if (b.lat == null || b.lon == null) continue;
    if (!puncte.has(b.vehicle_id)) puncte.set(b.vehicle_id, []);
    puncte.get(b.vehicle_id)!.push({ lat: Number(b.lat), lon: Number(b.lon) });
  }
  const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const bazaMasina = new Map<string, { lat: number; lon: number }>();
  for (const [vid, ps] of puncte) {
    if (ps.length < 3) continue;   // sub trei nopți nu tragem concluzii despre unde stă omul
    bazaMasina.set(vid, { lat: mediana(ps.map((p) => p.lat)), lon: mediana(ps.map((p) => p.lon)) });
  }

  const numeSofer = new Map((soferi ?? []).map((d) => [d.id, d.full_name as string]));
  const eticheta = new Map((rute ?? []).map((r) => [r.id, `${r.uzina_id} #${r.route_number}`]));

  const ruteCost = new Map<string, RutaCost>();
  for (const e of etaloane ?? []) {
    const id = e.factory_route_id as string;
    const cur = ruteCost.get(id) ?? { factory_route_id: id, eticheta: eticheta.get(id) ?? id, primaStatie: null, ultimaStatie: null };
    // Capetele vin din OPRIRILE STABILE, nu din geometrie. Capătul geometriei e primul
    // punct al zilei, adică locul unde doarme mașina — măsurat 17.09: în 730 din 1.099
    // de cazuri era la sub 1 km de bază. Costul compara casa unui șofer cu casa altuia.
    // PRIMUL din ordinea de mai sus câștigă; nu se suprascrie cu rândurile următoare.
    const pct = (v: unknown) => {
      const o = v as { lat?: number; lon?: number } | null;
      return o && o.lat != null && o.lon != null ? { lat: Number(o.lat), lon: Number(o.lon) } : null;
    };
    if (e.sens === 'tur') cur.primaStatie = cur.primaStatie ?? pct(e.prima_statie);
    else cur.ultimaStatie = cur.ultimaStatie ?? pct(e.ultima_statie);
    ruteCost.set(id, cur);
  }
  // rutele cu un singur capăt nu se pot compara cu celelalte — ies din calcul, nu
  // primesc jumătate de formulă
  let ruteIncomplete = 0;
  for (const [id, r] of [...ruteCost]) {
    if (!r.primaStatie || !r.ultimaStatie) { ruteCost.delete(id); ruteIncomplete++; }
  }

  // ruta „curentă" a unui șofer = cea pe care a fost cel mai des; mașina lui la fel
  const nrRute = new Map<string, Map<string, number>>();
  const nrMasini = new Map<string, Map<string, number>>();
  const numara = (m: Map<string, Map<string, number>>, k: string, v: string) => {
    if (!m.has(k)) m.set(k, new Map());
    const x = m.get(k)!; x.set(v, (x.get(v) ?? 0) + 1);
  };
  for (const a of atribuiri ?? []) {
    const d = a.driver_id as string;
    numara(nrRute, d, a.factory_route_id as string);
    if (a.vehicle_id) numara(nrMasini, d, a.vehicle_id as string);
  }
  const celMaiDes = (m?: Map<string, number>) =>
    m ? [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null : null;

  const lista: SoferCurent[] = [];
  let faraBaza = 0;
  for (const [driver_id, rute_] of nrRute) {
    const ruta = celMaiDes(rute_);
    if (!ruta || !ruteCost.has(ruta)) continue;
    const masina = celMaiDes(nrMasini.get(driver_id));
    const baza = masina ? bazaMasina.get(masina) ?? null : null;
    if (!baza) faraBaza++;
    lista.push({ driver_id, nume: numeSofer.get(driver_id) ?? '?', baza, factory_route_id: ruta });
  }

  const propuneri = propuneriSchimb(lista, ruteCost);
  const { aplicabile, km_zi } = economieCumulata(propuneri);
  return {
    propuneri: aplicabile.slice(0, 20),
    economie_km_zi: km_zi,
    soferi_analizati: lista.length,
    fara_baza: faraBaza,
    rute_fara_etalon: (rute ?? []).length - ruteCost.size,
    rute_incomplete: ruteIncomplete,
  };
}
