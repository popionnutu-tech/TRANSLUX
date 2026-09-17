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
import { construiesteCosturi, propuneriSchimb, propuneriComasare, propuneriAngajare, economieCumulata,
  type RutaCost, type SoferCurent, type Propunere, type PropunereComasare, type PropunereAngajare } from '@/lib/lde/trasee';

export type PropuneriRezultat = {
  propuneri: Propunere[];
  economie_km_zi: number;
  soferi_analizati: number;
  fara_baza: number;
  rute_fara_etalon: number;
  rute_incomplete: number;   // au etalon doar pe un sens → costul n-ar fi comparabil
  comasari: PropunereComasare[];
  angajari: PropunereAngajare[];
};

/**
 * PostgREST taie TĂCUT la 1000 de rânduri. Verificat 17.09: `getPropuneri` citea 1.000
 * din 3.438 de atribuiri și 1.000 din 4.242 de opriri de bază — cifra afișată descria un
 * grafic vechi de 16 zile, iar propunerea de vârf ieșea 84 km în loc de 42. Regula era
 * deja scrisă în comentariul lui `getTrasee`, dar nu era aplicată și aici.
 */
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

export async function getPropuneri(): Promise<PropuneriRezultat> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const de = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [{ data: etaloane }, atribuiri, baze, { data: soferi }, { data: rute }, { data: porti }, { data: granite }] =
    await Promise.all([
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
    citesteTot<{ driver_id: string; vehicle_id: string | null; factory_route_id: string; shift_number: number; date: string }>(
      () => sb.from('lde_atribuiri_zilnice').select('driver_id, vehicle_id, factory_route_id, shift_number, date')
        .eq('route_kind', 'uzina').gte('date', de)
        .not('driver_id', 'is', null).not('factory_route_id', 'is', null)),
    citesteTot<{ vehicle_id: string; lat: number; lon: number }>(
      () => sb.from('lde_gps_stops').select('vehicle_id, lat, lon').eq('is_base', true).gte('date', de)),
    sb.from('drivers').select('id, full_name').eq('active', true),
    sb.from('lde_factory_routes').select('id, uzina_id, route_number').eq('active', true),
    sb.from('lde_uzine_gates').select('uzina_id, lat, lon').eq('active', true),
    sb.from('lde_uzina_shift_boundaries').select('uzina_id, shift_number, tip, minute_zi'),
  ]);

  const { ruteCost, fereastraRutei, soferi: lista, fara_baza, rute_incomplete } = construiesteCosturi({
    etaloane: etaloane ?? [], atribuiri, baze: baze ?? [], soferi: soferi ?? [],
    rute: rute ?? [], porti: porti ?? [], granite: granite ?? [],
  });

  const propuneri = propuneriSchimb(lista, ruteCost);
  const { aplicabile, km_zi } = economieCumulata(propuneri);
  const comasari = propuneriComasare(lista, ruteCost, fereastraRutei).slice(0, 10);
  const angajari = propuneriAngajare(lista, ruteCost).slice(0, 10);
  return {
    propuneri: aplicabile.slice(0, 20),
    economie_km_zi: km_zi,
    soferi_analizati: lista.length,
    fara_baza,
    rute_fara_etalon: (rute ?? []).length - ruteCost.size,
    rute_incomplete,
    comasari, angajari,
  };
}

export type GranitaRand = {
  uzina_id: string; shift_number: number; tip: 'inceput' | 'sfarsit';
  minute_zi: number | null; minute_declarat: number | null;
  sursa: 'invatat' | 'declarat'; motiv: string | null; observations: number;
};

/**
 * Ceasul pe care se judecă plin/gol. Se arată pentru că de el atârnă toată cifra km-ilor
 * goi: o graniță rămasă pe orarul scris de mână nu e greșită, dar nici verificată de
 * nimeni. Acum 12 din 30 sunt învățate din atingerile de poartă; restul se țin pe text,
 * fiecare cu motivul lui — la Orhei fiindcă gruparea e bimodală (uzina și-a mutat
 * programul în fereastră), la Strășeni fiindcă are prea puține curse ca să se poată învăța.
 */
export async function getGranite(): Promise<GranitaRand[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data, error } = await getSupabase()
    .from('lde_uzina_shift_boundaries')
    .select('uzina_id, shift_number, tip, minute_zi, minute_declarat, sursa, motiv, observations')
    .order('uzina_id').order('shift_number').order('tip');
  if (error) throw new Error(`granițe: ${error.message}`);
  return (data ?? []) as GranitaRand[];
}
