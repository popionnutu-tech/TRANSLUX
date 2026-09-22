import { getSupabase } from '../supabase';
import { sendTelegramPhoto } from '../telegram-notify';
import { generateLivrareImage, LEI_PE_KM, leiPeKm, UZINA_SCURT, type LivrareRow, type BramburaRow } from './naveta-image';

/** Norma și categoria unei mașini — din ele și din prețul zilei iese costul unui km. */
export interface NormaMasinii { litri: number | null; categorie: string | null }

/**
 * Posterul de LIVRARE (подача) pe rutele de uzină, săptămânal, în grupa Telegram.
 *
 * Ion, 19.09.2026: «Scrie livrare (подача). Fă-l de la 1.09. Să se trimită la fiecare
 * 2 săptămâni în grupă. Și pune acolo doar mașinile cu peste 50 km pe zi livrare.»
 * Ion, 22.09.2026: «Fă postarea saptaminal pe Sebn + sebn Strășeni» — cadența a trecut
 * la o săptămână; uzinele erau deja cele cerute (UZINE_IMPLICITE).
 *
 * Livrare = km-ii șoferului în afara rutei (de acasă până la satul de start și înapoi),
 * fără brambura (excesul zilelor neobișnuite) și fără drumurile la service — exact
 * `km_livrare − km_brambura` din `lde_route_run`, cum le scrie worker-ul de noapte.
 *
 * Grupa NU e cea a șoferilor: posterul numește oamenii și satele lor. Se citește din
 * `app_config` (LIVRARE_POSTER_CHAT_KEY); fără cheie, nu pleacă nimic — ruta de cron
 * întoarce imaginea ca previzualizare.
 */
export const LIVRARE_POSTER_CHAT_KEY = 'livrare_poster_chat_id';
export const LIVRARE_POSTER_LAST_KEY = 'livrare_poster_last';
export const PRAG_LIVRARE_KM_ZI = 50;
/**
 * Prima luni de trimitere automată; apoi în fiecare luni, pe cele 7 zile dinainte.
 * Ion, 22.09.2026: «Fă postarea saptaminal». Ancora s-a mutat de pe 05.10 pe 28.09 —
 * cu pas de 7 zile ancorat pe 05.10, luni 28.09 ar fi căzut «înainte de prima» și
 * n-ar fi plecat nimic.
 */
export const PRIMA_LUNI_CADENTA = '2026-09-28';
export const ZILE_CADENTA = 7;

export interface CursaLivrare {
  run_date: string;
  factory_route_id: string;
  vehicle_id: string;
  sens: 'tur' | 'retur';
  shift_number?: number;
  km_real: number | null;
  km_livrare: number | null;
  km_brambura: number | null;
  km_service: number | null;
  km_gol_ruta: number | null;
}
export interface RutaRef { id: string; uzina_id: string; route_number: number; stops_in_order: string | null }

/**
 * O zi de navetă făcută cu ALTĂ mașină decât autobuzul rutei (`lde_naveta_sofer`, migr. 384).
 * Ion, 21.09: «include in analitica si asta livrare». Ruta 25 «Vatici» are livrare 0 pe
 * autobuz — el doarme la Vatici — dar omul e dus acolo cu 073BRAO, ~210 km/zi.
 */
export interface NavetaRand {
  run_date: string;
  vehicle_id: string;              // mașina care FACE naveta
  factory_route_id: string;        // ruta servită
  km: number;
  autobuz_id: string | null;       // mașina rutei, lângă care a așteptat
  casa: string | null;             // satul de unde pleacă naveta
}

/**
 * Uzinele validate cu Ion rută cu rută (18–19.09); celelalte intră doar la cerere (`?uzine=all`).
 * REZERVĂ: adevărul stă din 22.09 în `lde_uzine.livrare_validata` (migr. 386), ca să poată fi
 * marcat din pagină, nu dintr-o constantă. Constanta rămâne pentru cazul în care interogarea
 * nu întoarce nimic — posterul nu se oprește din cauza asta.
 */
export const UZINE_IMPLICITE = ['SEBN_ORHEI', 'SEBN_STRASENI'];

/** Uzinele cu regulile livrării verificate (migr. 386); pe ele pleacă posterul implicit. */
export async function uzineValidate(): Promise<string[]> {
  try {
    const { data, error } = await getSupabase().from('lde_uzine').select('id').eq('active', true).eq('livrare_validata', true);
    if (error || !data?.length) return UZINE_IMPLICITE;
    return data.map((u) => u.id as string);
  } catch {
    return UZINE_IMPLICITE;
  }
}
export const MIN_ZILE_RUTA = 3;   // sub atâtea zile cu curse media nu spune nimic
const primulSat = (s: string | null) => (s || '').replace(/->/g, '→').split('→')[0]?.trim() || '';
const eZiLucratoare = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`).getUTCDay(); return d >= 1 && d <= 5; };

/**
 * Agregarea pură: o linie pe MAȘINĂ, media pe zilele lucrătoare cu curse.
 *
 * Ion, 19.09: «pune acolo doar mașinile cu peste 50 km pe zi livrare» — mașinile, nu
 * rutele. La Orhei era totuna: o mașină are aceeași rută în toate cele trei ture, deci
 * linia rutei ERA linia mașinii. La Ungheni nu: acolo mașina are o rută în schimbul 1 și
 * alta în schimbul 2 (032BRAT: r9 dimineața, r17 după-amiaza), iar livrarea ei se rupea în
 * două rânduri, fiecare sub prag. 732SHS face 118 km/zi și nu apărea deloc, fiindcă pe
 * rute e 66 + 52. Omul face naveta o dată pe zi, nu o dată pe rută — se numără pe mașină.
 *
 * `sofer` = numele cel mai des atribuit mașinii + satul unde doarme mașina.
 */
export function agregaLivrare(input: {
  curse: CursaLivrare[];
  rute: RutaRef[];
  startReal: Map<string, string>;                  // factory_route_id → sat
  soferi: Map<string, string>;                     // `${vehicle_id}|${factory_route_id}` → «Popescu»
  case: Map<string, string>;                       // vehicle_id → sat
  masini?: Map<string, string>;                    // vehicle_id → «552BRAO · Sprinter 312»
  // Ion, 21.09: costul unui km = norma mașinii × prețul ANRE al zilei + reparație + salariu.
  // De aceea NU mai primim un lei/km gata făcut, ci norma mașinii și prețul fiecărei zile:
  // prețul se schimbă în timpul perioadei (35,21 → 35,89 în 17–19.09), iar media se ia
  // PONDERATĂ cu livrarea zilei, nu pe zile goale.
  norme?: Map<string, NormaMasinii>;               // vehicle_id → { litri/100 km, categorie }
  pretZi?: Map<string, number>;                    // YYYY-MM-DD → lei/litru
  navete?: NavetaRand[];                           // naveta făcută cu altă mașină (migr. 384)
  prag?: number;
  minZile?: number;
}): LivrareRow[] {
  const prag = input.prag ?? PRAG_LIVRARE_KM_ZI;
  const ruta = new Map(input.rute.map((r) => [r.id, r]));
  type Zi = { plin: number; liv: number; gol: number; serv: number; plinTur: number; tururi: number };
  const peMasinaZi = new Map<string, Map<string, Zi>>();          // vehicle_id → date → sume
  const ruteleMasinii = new Map<string, Map<string, number>>();   // vehicle_id → rid → câte curse
  for (const c of input.curse) {
    if (c.km_real == null || !eZiLucratoare(c.run_date) || !ruta.has(c.factory_route_id)) continue;
    if (!peMasinaZi.has(c.vehicle_id)) peMasinaZi.set(c.vehicle_id, new Map());
    const zile = peMasinaZi.get(c.vehicle_id)!;
    const z = zile.get(c.run_date) ?? { plin: 0, liv: 0, gol: 0, serv: 0, plinTur: 0, tururi: 0 };
    z.plin += Number(c.km_real) || 0;
    z.liv += Math.max(0, (Number(c.km_livrare) || 0) - (Number(c.km_brambura) || 0));
    z.gol += Number(c.km_gol_ruta) || 0;
    z.serv += Number(c.km_service) || 0;
    if (c.sens === 'tur' && Number(c.km_real) > 0) { z.plinTur += Number(c.km_real); z.tururi++; }
    zile.set(c.run_date, z);
    const m = ruteleMasinii.get(c.vehicle_id) ?? new Map<string, number>();
    m.set(c.factory_route_id, (m.get(c.factory_route_id) ?? 0) + 1);
    ruteleMasinii.set(c.vehicle_id, m);
  }
  // «9 Mănoilești – Hîrcești + 17 Sineștii Vechi»: numărul rutei, satul din denumire și,
  // unde diferă, satul de start dedus din GPS (migr. 380)
  const etichetaRutelor = (rids: string[]) => rids.slice(0, 2).map((rid) => {
    const r = ruta.get(rid)!;
    const sat = primulSat(r.stops_in_order);
    const real = input.startReal.get(rid);
    return `${r.route_number} ${sat}` + (real && real.toLowerCase() !== sat.toLowerCase() ? ` – ${real}` : '');
  }).join(' + ') + (rids.length > 2 ? ` +${rids.length - 2}` : '');

  // media prețului, ponderată cu km-ii de livrare ai fiecărei zile
  const costulKm = (vid: string, kmPeZi: Map<string, number>): number => {
    let km = 0, lei = 0;
    for (const [zi, k] of kmPeZi) {
      const p = input.pretZi?.get(zi);
      if (k <= 0) continue;
      km += k; lei += k * (p ?? 0);
    }
    const pret = km > 0 && lei > 0 ? lei / km : undefined;
    const n = input.norme?.get(vid);
    return leiPeKm({ litri: n?.litri, categorie: n?.categorie, pret });
  };

  const out: LivrareRow[] = [];
  for (const [vid, zile] of peMasinaZi) {
    const n = zile.size;
    let plin = 0, liv = 0, gol = 0, serv = 0, plinTur = 0, tururi = 0;
    for (const z of zile.values()) { plin += z.plin; liv += z.liv; gol += z.gol; serv += z.serv; plinTur += z.plinTur; tururi += z.tururi; }
    const navetaZi = liv / n;
    // fără drum plin nu e mașină pe rută (doar drumuri în afară); sub 3 zile nu e medie
    if (navetaZi < prag || plin <= 0 || n < (input.minZile ?? MIN_ZILE_RUTA)) continue;
    // rutele mașinii, cea mai des făcută prima; uzina = a rutei principale
    const rids = [...(ruteleMasinii.get(vid) ?? new Map()).entries()]
      .sort((a, b) => b[1] - a[1]).map(([rid]) => rid);
    const principala = ruta.get(rids[0])!;
    const eticheta = etichetaRutelor(rids);
    const nume = rids.map((rid) => input.soferi.get(`${vid}|${rid}`)).find((x) => x) ?? '—';
    const casa = input.case.get(vid);
    out.push({
      masina: input.masini?.get(vid) ?? '—',
      lei_km: costulKm(vid, new Map([...zile].map(([d, z]) => [d, z.liv]))),
      uzina: principala.uzina_id, ruta: eticheta,
      sofer: casa ? `${nume} (${casa})` : nume, zile: n,
      km_tur: tururi ? Math.round(plinTur / tururi) : null,
      total_zi: Math.round((plin + liv + gol + serv) / n),
      plin_zi: Math.round(plin / n), gol_ruta_zi: Math.round(gol / n),
      naveta_zi: Math.round(navetaZi), naveta_total: Math.round(liv),
    });
  }

  // ── naveta făcută cu ALTĂ mașină (migr. 384) ──
  // Mașina asta nu face rută: plin 0, «Rută, km» gol, tot kilometrajul e livrare. Linia ei
  // poartă eticheta rutei pe care o servește, cu «· navetă», și numele șoferului
  // autobuzului — omul pe care îl duce. Lei/km se iau după TIPUL ei (Sprinter = microbuz),
  // nu după al autobuzului: km-ii i-a făcut ea.
  const peNaveta = new Map<string, { zile: Map<string, number>; rute: Map<string, number>; autobuze: Map<string, number>; casa: string | null }>();
  for (const n of input.navete ?? []) {
    if (!eZiLucratoare(n.run_date) || !ruta.has(n.factory_route_id)) continue;
    const km = Number(n.km) || 0;
    if (km <= 0) continue;
    const v = peNaveta.get(n.vehicle_id) ?? { zile: new Map(), rute: new Map(), autobuze: new Map(), casa: null };
    v.zile.set(n.run_date, (v.zile.get(n.run_date) ?? 0) + km);
    v.rute.set(n.factory_route_id, (v.rute.get(n.factory_route_id) ?? 0) + km);
    if (n.autobuz_id) v.autobuze.set(n.autobuz_id, (v.autobuze.get(n.autobuz_id) ?? 0) + 1);
    v.casa = v.casa ?? n.casa;
    peNaveta.set(n.vehicle_id, v);
  }
  for (const [vid, v] of peNaveta) {
    const zile = v.zile.size;
    const km = [...v.zile.values()].reduce((s, x) => s + x, 0);
    if (km / zile < prag || zile < (input.minZile ?? MIN_ZILE_RUTA)) continue;
    const rids = [...v.rute.entries()].sort((a, b) => b[1] - a[1]).map(([rid]) => rid);
    const autobuz = [...v.autobuze.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const nume = (autobuz ? rids.map((rid) => input.soferi.get(`${autobuz}|${rid}`)).find((x) => x) : null) ?? '—';
    const casa = v.casa ?? input.case.get(vid);
    out.push({
      masina: input.masini?.get(vid) ?? '—',
      // norma MAȘINII DE NAVETĂ, nu a autobuzului: km-ii i-a făcut ea
      lei_km: costulKm(vid, v.zile),
      uzina: ruta.get(rids[0])!.uzina_id,
      ruta: `${etichetaRutelor(rids)} · navetă`,
      sofer: casa ? `${nume} (${casa})` : nume,
      zile, km_tur: null,
      total_zi: Math.round(km / zile), plin_zi: 0, gol_ruta_zi: 0,
      naveta_zi: Math.round(km / zile), naveta_total: Math.round(km),
    });
  }
  return out.sort((a, b) => b.naveta_total - a.naveta_total);
}

/**
 * Km NEAGREAȚI (brambura) pe perioadă — Ion, 19.09: «sub listă, pe perioada asta, ce
 * mașini au făcut kilometraj neagreat, brambura». O linie pe (mașină, zi) cu excesul
 * scris de agregator (`km_brambura`), peste `min` km.
 */
export const MIN_BRAMBURA_KM = 20;
export function agregaBrambura(input: {
  curse: CursaLivrare[];
  rute: RutaRef[];
  masini: Map<string, string>;                    // vehicle_id → «552BRAO · Sprinter 312»
  soferZi: Map<string, string>;                   // `${vehicle_id}|${date}` → «Popescu»
  unde?: Map<string, string>;                     // `${vehicle_id}|${date}` → «Bălți 08:43–10:36»
  min?: number;
}): BramburaRow[] {
  const min = input.min ?? MIN_BRAMBURA_KM;
  const ruta = new Map(input.rute.map((r) => [r.id, r]));
  const peZi = new Map<string, { km: number; rute: Set<string> }>();
  for (const c of input.curse) {
    const b = Number(c.km_brambura) || 0;
    const r = ruta.get(c.factory_route_id);
    if (b <= 0 || !r) continue;
    const k = `${c.vehicle_id}|${c.run_date}`;
    const z = peZi.get(k) ?? { km: 0, rute: new Set<string>() };
    z.km += b; z.rute.add(`${UZINA_SCURT[r.uzina_id] ?? r.uzina_id} ${r.route_number}`);
    peZi.set(k, z);
  }
  const out: BramburaRow[] = [];
  for (const [k, z] of peZi) {
    if (z.km < min) continue;
    const [vehicle_id, data] = k.split('|');
    out.push({ vehicle_id, data, masina: input.masini.get(vehicle_id) ?? '—', sofer: input.soferZi.get(k) ?? '—', ruta: [...z.rute].join(', '), unde: input.unde?.get(k) ?? '', km: Math.round(z.km) });
  }
  return out.sort((a, b) => b.km - a.km || a.data.localeCompare(b.data));
}

export interface OprireZi { locality: string; arrival_at: string; departure_at: string | null; is_base: boolean }
const CARTIERE_ORHEI = new Set(['bucuria', 'mitoc', 'nordic', 'centru', 'pelivan', 'orhei', 'slobozia doamnei', 'nistreană']);
const normSat = (s: string) => s.toLowerCase().replace(/ă|â/g, 'a').replace(/î/g, 'i').replace(/ș|ş/g, 's').replace(/ț|ţ/g, 't').trim();

/**
 * «Unde a fost, în afara rutei, și când» — Ion, 19.09: «nu trebuie ruta; aici trebuie
 * descrierea: unde a plecat, la ce localitate, și în ce interval de timp». Opririle zilei
 * (≥90 s) care nu sunt în satele rutelor mașinii și nu-s cartierele Orheiului, grupate pe
 * localitate: prima sosire – ultima plecare. Casa apare marcată «(acasă)»: pauza lungă
 * acasă e de multe ori tot excesul zilei.
 */
export function descrieZiua(opriri: OprireZi[], sateRute: Set<string>, hh: (iso: string) => string, casa?: string | null,
  drumuri?: CursaLivrare[]): string {
  const kCasa = casa ? normSat(casa) : null;
  const la = (s: OprireZi) => s.departure_at ?? s.arrival_at;
  const minute = (s: OprireZi) => Math.max(0, (Date.parse(la(s)) - Date.parse(s.arrival_at)) / 60000);
  // EPISOADE: opriri consecutive în aceeași localitate, în afara rutei și în afara satului
  // de casă — nu «toate opririle din Bălți din zi», ci «Bălți 08:43–10:36». Casa nu se
  // unește peste zi: oprirea de noapte începe la 03:00 și se termină la 02:59, adică nimic.
  const episoade: { nume: string; de: string; la: string; min: number }[] = [];
  let pauzaAcasa: { de: string; la: string; min: number } | null = null;
  for (const s of [...opriri].sort((a, b) => a.arrival_at.localeCompare(b.arrival_at))) {
    const k = normSat(s.locality);
    const eAcasa = s.is_base || (kCasa != null && k === kCasa);
    if (eAcasa) {
      const m = minute(s);
      if (m >= 30 && (!pauzaAcasa || m > pauzaAcasa.min)) pauzaAcasa = { de: s.arrival_at, la: la(s), min: m };
      continue;
    }
    if (CARTIERE_ORHEI.has(k) || sateRute.has(k)) continue;
    const ultim = episoade[episoade.length - 1];
    if (ultim && ultim.nume === s.locality && Date.parse(s.arrival_at) - Date.parse(ultim.la) < 60 * 60000) {
      ultim.la = la(s); ultim.min += minute(s);
    } else episoade.push({ nume: s.locality, de: s.arrival_at, la: la(s), min: minute(s) });
  }
  const alese = episoade.filter((e) => e.min >= 3).sort((a, b) => b.min - a.min).slice(0, 3)
    .sort((a, b) => a.de.localeCompare(b.de));
  if (alese.length) return alese.map((e) => `${e.nume} ${hh(e.de)}–${hh(e.la)}`).join(' · ');
  // Nimic străin pe urmă: km-ii nu s-au făcut ACASĂ, ci pe drumul în plus până acasă și
  // înapoi între ture (Ion, 19.09: «cum pot face km acasă? scrie pe unde au mers»). Se
  // spun drumurile zilei cu km în afara rutei și pauza de acasă dintre ele.
  // cele mai mari trei drumuri, în ordinea zilei — textul trebuie să încapă pe un rând;
  // fără «↔»: Open Sans n-are glifa
  const drumuriInPlus = (drumuri ?? [])
    .filter((c) => (Number(c.km_livrare) || 0) >= 10)
    .sort((a, b) => Number(b.km_livrare) - Number(a.km_livrare)).slice(0, 3)
    .sort((a, b) => (a.shift_number ?? 0) - (b.shift_number ?? 0) || a.sens.localeCompare(b.sens))
    .map((c) => `${c.sens}${c.shift_number ? ` s${c.shift_number}` : ''} +${Math.round(Number(c.km_livrare))}`);
  const acasa = pauzaAcasa ? `acasă ${hh(pauzaAcasa.de)}–${hh(pauzaAcasa.la)}` : '';
  if (drumuriInPlus.length) return `${casa ? `${casa}–rută` : 'acasă–rută'} în plus: ${drumuriInPlus.join(', ')} km${acasa ? ` · ${acasa}` : ''}`;
  return acasa ? `${acasa}${casa ? ` (${casa})` : ''}, nimic în afara rutei` : '';
}

/** Cadența: în fiecare luni, începând cu PRIMA_LUNI_CADENTA; acoperă cele 7 zile dinainte. */
export function perioadaCadentei(azi: string, primaLuni = PRIMA_LUNI_CADENTA): { from: string; to: string } | null {
  const t = Date.UTC(+azi.slice(0, 4), +azi.slice(5, 7) - 1, +azi.slice(8, 10));
  const p = Date.UTC(+primaLuni.slice(0, 4), +primaLuni.slice(5, 7) - 1, +primaLuni.slice(8, 10));
  const zile = Math.round((t - p) / 86400000);
  if (zile < 0 || zile % ZILE_CADENTA !== 0) return null;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(t - ZILE_CADENTA * 86400000), to: iso(t - 86400000) };
}

async function citesteTot<T>(q: () => { range: (de: number, la: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }): Promise<T[]> {
  const out: T[] = []; const pas = 1000;
  for (let de = 0; ; de += pas) {
    const { data, error } = await q().range(de, de + pas - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < pas) break;
  }
  return out;
}

export async function incarcaLivrare(from: string, to: string, prag = PRAG_LIVRARE_KM_ZI, uzine: string[] | 'all' = UZINE_IMPLICITE): Promise<{ rows: LivrareRow[]; brambura: BramburaRow[]; pretMotorina: number }> {
  const sb = getSupabase();
  const [curse, rute, etaloane, atribuiri, nopti, soferiRows, vehicule, norme, tipuri, navete, preturi] = await Promise.all([
    citesteTot<CursaLivrare>(() => sb.from('lde_route_run')
      .select('run_date,factory_route_id,vehicle_id,sens,shift_number,km_real,km_livrare,km_brambura,km_service,km_gol_ruta')
      .gte('run_date', from).lte('run_date', to).not('km_real', 'is', null)),
    citesteTot<RutaRef>(() => sb.from('lde_factory_routes').select('id,uzina_id,route_number,stops_in_order').eq('active', true)),
    citesteTot<{ factory_route_id: string; sat_start_real: string | null }>(() => sb.from('lde_route_etalon')
      .select('factory_route_id,sat_start_real').not('sat_start_real', 'is', null)),
    citesteTot<{ date: string; vehicle_id: string; factory_route_id: string; driver_id: string | null }>(() => sb.from('lde_atribuiri_zilnice')
      .select('date,vehicle_id,factory_route_id,driver_id').gte('date', from).lte('date', to).eq('route_kind', 'uzina').not('driver_id', 'is', null)),
    citesteTot<{ vehicle_id: string; locality: string | null }>(() => sb.from('lde_gps_stops')
      .select('vehicle_id,locality').eq('is_base', true).gte('date', from).lte('date', to).not('locality', 'is', null)),
    citesteTot<{ id: string; full_name: string }>(() => sb.from('drivers').select('id,full_name')),
    citesteTot<{ id: string; plate_number: string }>(() => sb.from('vehicles').select('id,plate_number')),
    citesteTot<{ vehicle_id: string; vehicle_type_id: string | null }>(() => sb.from('lde_vehicle_norms').select('vehicle_id,vehicle_type_id')),
    citesteTot<{ id: string; display_name: string; category: string | null; norm_l_per_100km: number | null }>(() =>
      sb.from('lde_vehicle_types').select('id,display_name,category,norm_l_per_100km')),
    // naveta făcută cu altă mașină (migr. 384) — mașini care nu fac rută, deci n-au curse
    citesteTot<NavetaRand>(() => sb.from('lde_naveta_sofer')
      .select('run_date,vehicle_id,factory_route_id,km,autobuz_id,casa').gte('run_date', from).lte('run_date', to)),
    // prețul ANRE al motorinei (oglindit din TLX de price-worker). Se ia și o lună dinainte:
    // prima zi a perioadei poate cădea într-o zi fără rând nou, și atunci moștenește prețul
    // anterior — altfel ziua aia ar fi socotită la prețul implicit și cifra ar minți tăcut.
    citesteTot<{ valid_from: string; price_lei: number }>(() => sb.from('lde_diesel_price')
      .select('valid_from,price_lei').lte('valid_from', to)
      .gte('valid_from', new Date(Date.parse(`${from}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10))),
  ]);
  const numeSofer = new Map(soferiRows.map((d) => [d.id, d.full_name.split(' ')[0]]));
  // «552BRAO · Sprinter 312» — tipul din normele de consum (lde_vehicle_types), unde există
  const numeTip = new Map(tipuri.map((t) => [t.id, t.display_name]));
  const tipMasinii = new Map(norme.filter((n) => n.vehicle_type_id).map((n) => [n.vehicle_id, numeTip.get(n.vehicle_type_id!)]));
  const masiniMap = new Map(vehicule.map((v) => [v.id, tipMasinii.get(v.id) ? `${v.plate_number} · ${tipMasinii.get(v.id)}` : v.plate_number]));
  // norma și categoria fiecărei mașini — din ele iese costul unui km (Ion, 21.09)
  const categorieTip = new Map(tipuri.map((t) => [t.id, t.category]));
  const litriTip = new Map(tipuri.map((t) => [t.id, t.norm_l_per_100km == null ? null : Number(t.norm_l_per_100km)]));
  const normeMap = new Map<string, NormaMasinii>(norme.filter((n) => n.vehicle_type_id).map((n) =>
    [n.vehicle_id, { litri: litriTip.get(n.vehicle_type_id!) ?? null, categorie: categorieTip.get(n.vehicle_type_id!) ?? null }]));
  // prețul fiecărei zile din perioadă: rândul zilei, altfel ultimul de dinaintea ei
  const pretZi = new Map<string, number>();
  const scara = [...preturi].map((p) => ({ zi: p.valid_from, lei: Number(p.price_lei) }))
    .filter((p) => Number.isFinite(p.lei) && p.lei > 0).sort((a, b) => a.zi.localeCompare(b.zi));
  let ultim: number | null = null, i = 0;
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) {
    const zi = new Date(t).toISOString().slice(0, 10);
    while (i < scara.length && scara[i].zi <= zi) ultim = scara[i++].lei;
    if (ultim != null) pretZi.set(zi, ultim);
  }
  const preturiFolosite = [...pretZi.values()];
  const pretMotorina = preturiFolosite.length
    ? preturiFolosite.reduce((s, x) => s + x, 0) / preturiFolosite.length
    : (scara.at(-1)?.lei ?? 0);
  const soferZi = new Map<string, string>();
  for (const a of atribuiri) if (a.driver_id && numeSofer.has(a.driver_id)) soferZi.set(`${a.vehicle_id}|${a.date}`, numeSofer.get(a.driver_id)!);
  const startReal = new Map<string, string>();
  for (const e of etaloane) if (e.sat_start_real && !startReal.has(e.factory_route_id)) startReal.set(e.factory_route_id, e.sat_start_real);
  // valoarea cea mai des întâlnită pe fiecare cheie (cheia poate conține «|»)
  const mode = (rows: { k: string; v: string }[]) => {
    const n = new Map<string, Map<string, number>>();
    for (const { k, v } of rows) { const m = n.get(k) ?? new Map<string, number>(); m.set(v, (m.get(v) ?? 0) + 1); n.set(k, m); }
    const out = new Map<string, string>();
    for (const [k, m] of n) out.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    return out;
  };
  const soferiMap = mode(atribuiri.filter((a) => a.driver_id && numeSofer.has(a.driver_id))
    .map((a) => ({ k: `${a.vehicle_id}|${a.factory_route_id}`, v: numeSofer.get(a.driver_id!)! })));
  const caseMap = mode(nopti.map((s) => ({ k: s.vehicle_id, v: s.locality! })));
  // «Slobozia Doamnei» e Orheiul — numele cartierului derutează pe poster
  for (const [k, v] of caseMap) if (/slobozia doamnei|nordic|bucuria|centru|mitoc/i.test(v)) caseMap.set(k, 'Orhei');
  const ruteAlese = uzine === 'all' ? rute : rute.filter((r) => uzine.includes(r.uzina_id));
  return {
    rows: agregaLivrare({ curse, rute: ruteAlese, startReal, soferi: soferiMap, case: caseMap, masini: masiniMap, norme: normeMap, pretZi, navete, prag }),
    brambura: await cuDescriere(agregaBrambura({ curse, rute: ruteAlese, masini: masiniMap, soferZi }), ruteAlese, atribuiri, caseMap, curse),
    pretMotorina,
  };
}

/** Umple `unde` pentru fiecare (mașină, zi) din listă, cu opririle zilei din lde_gps_stops. */
async function cuDescriere(
  brambura: BramburaRow[],
  rute: RutaRef[],
  atribuiri: { date: string; vehicle_id: string; factory_route_id: string }[],
  casa: Map<string, string>,
  curse: CursaLivrare[] = [],
): Promise<BramburaRow[]> {
  if (!brambura.length) return brambura;
  const sb = getSupabase();
  const etaloane = await citesteTot<{ factory_route_id: string; sate: { nume: string }[] | null }>(() =>
    sb.from('lde_route_etalon').select('factory_route_id,sate').in('factory_route_id', rute.map((r) => r.id)));
  const sateRutei = new Map<string, Set<string>>();
  for (const e of etaloane) {
    const s = sateRutei.get(e.factory_route_id) ?? new Set<string>();
    for (const x of e.sate ?? []) if (x?.nume) s.add(normSat(x.nume));
    sateRutei.set(e.factory_route_id, s);
  }
  const hh = (iso: string) => new Date(iso).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit' });
  const out: BramburaRow[] = [];
  for (const b of brambura) {
    const vid = b.vehicle_id;
    if (!vid) { out.push(b); continue; }
    const { data: opriri } = await sb.from('lde_gps_stops').select('locality,arrival_at,departure_at,is_base')
      .eq('vehicle_id', vid).eq('date', b.data).not('locality', 'is', null).order('arrival_at');
    const sate = new Set<string>();
    for (const a of atribuiri) if (a.vehicle_id === vid && a.date === b.data) for (const s of sateRutei.get(a.factory_route_id) ?? []) sate.add(s);
    const drumuri = curse.filter((c) => c.vehicle_id === vid && c.run_date === b.data);
    out.push({ ...b, unde: descrieZiua((opriri ?? []) as OprireZi[], sate, hh, casa.get(vid) ?? null, drumuri) });
  }
  return out;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const zileLucratoare = (from: string, to: string) => {
  let n = 0;
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 86400000) { const d = new Date(t).getUTCDay(); if (d >= 1 && d <= 5) n++; }
  return n;
};

export async function generarePoster(from: string, to: string, prag = PRAG_LIVRARE_KM_ZI, uzine: string[] | 'all' = UZINE_IMPLICITE): Promise<{ png: Buffer; rows: LivrareRow[] }> {
  const { rows, brambura, pretMotorina } = await incarcaLivrare(from, to, prag, uzine);
  const png = await generateLivrareImage(rows, {
    // Ion, 19.09: «sus să scrie că e pentru SEBN»
    titlu: `LIVRARE (ПОДАЧА) · ${numeleUzinelor(uzine === 'all' ? rows.map((r) => r.uzina) : uzine).toUpperCase()} · peste ${prag} km/zi`,
    perioada: `${ddmm(from)} – ${ddmm(to)}.${to.slice(0, 4)}`,
    zileLucratoare: zileLucratoare(from, to),
    brambura, pretMotorina,
  });
  return { png, rows };
}

/** Textul de sub poster, în română: cât se poate economisi și unde. */
export function textulEconomiei(rows: LivrareRow[], from: string, to: string): string {
  // Ion, 19.09: «textul foarte scurt, minimalist: ce e, de ce, ce facem». E și caption-ul pozei.
  const nr = (v: number) => Math.round(v).toLocaleString('ro-RO');
  const leiR = (r: LivrareRow) => r.naveta_total * (r.lei_km ?? LEI_PE_KM);
  const km = rows.reduce((s, r) => s + r.naveta_total, 0);
  const lei = rows.reduce((s, r) => s + leiR(r), 0);
  const zile = Math.max(1, ...rows.map((r) => r.zile));
  const top = [...rows].sort((a, b) => leiR(b) - leiR(a)).slice(0, 3)
    .map((r) => `${r.sofer.split(' (')[0]} ${nr(leiR(r))}`).join(' · ');
  return [
    `<b>Livrare (подача) · ${numeleUzinelor(rows.map((r) => r.uzina))} · ${ddmm(from)}–${ddmm(to)}</b>`,
    `Km goi de acasă până la rută: <b>${nr(km)} km = ${nr(lei)} lei</b> în ${zile} zile.`,
    top ? `${top} lei.` : '',
    `De făcut: șoferi din satul de start pe rutele roșii.`,
  ].filter(Boolean).join('\n');
}

/** «SEBN Orhei + Strășeni», «Draxelmaier Bălți», «toate uzinele» */
export function numeleUzinelor(uzine: string[]): string {
  const NUME: Record<string, string> = {
    SEBN_ORHEI: 'SEBN Orhei', SEBN_STRASENI: 'SEBN Strășeni', DRAXELMAIER_BALTI: 'Draxelmaier Bălți',
    LEAR_UNGHENI: 'LEAR Ungheni', LEAR_FLORESTI: 'LEAR Florești', TROX_BRICENI: 'Trox Briceni',
  };
  const u = [...new Set(uzine)];
  if (u.length >= 4) return 'toate uzinele';
  const sebn = u.filter((x) => x.startsWith('SEBN_'));
  const rest = u.filter((x) => !x.startsWith('SEBN_')).map((x) => NUME[x] ?? x);
  const s = sebn.length === 2 ? ['SEBN Orhei + Strășeni'] : sebn.map((x) => NUME[x] ?? x);
  return [...s, ...rest].join(' + ') || 'uzine';
}

export interface TrimitereLivrare {
  status: 'sent' | 'skipped' | 'error';
  from: string; to: string; rows: number; reason?: string; messageId?: number | null;
}

/** Trimite posterul în grupa din app_config; idempotent pe perioadă (LIVRARE_POSTER_LAST_KEY). */
export async function trimitePosterLivrare(opts: { from: string; to: string; force?: boolean; chatId?: string | null; uzine?: string[] | 'all' }): Promise<TrimitereLivrare> {
  const sb = getSupabase();
  // fără listă cerută: uzinele marcate ca validate în bază (migr. 386), nu constanta
  const uzine = opts.uzine ?? (await uzineValidate());
  const cfg = async (key: string) => {
    const { data } = await sb.from('app_config').select('value').eq('key', key).maybeSingle();
    return ((data as { value?: string } | null)?.value ?? '').trim() || null;
  };
  const chatId = opts.chatId ?? (await cfg(LIVRARE_POSTER_CHAT_KEY));
  if (!chatId) return { status: 'skipped', from: opts.from, to: opts.to, rows: 0, reason: `grupa nu e setată (app_config.${LIVRARE_POSTER_CHAT_KEY})` };
  const marca = `${opts.from}_${opts.to}`;
  if (!opts.force && (await cfg(LIVRARE_POSTER_LAST_KEY)) === marca) {
    return { status: 'skipped', from: opts.from, to: opts.to, rows: 0, reason: 'perioada a plecat deja' };
  }
  const { png, rows } = await generarePoster(opts.from, opts.to, PRAG_LIVRARE_KM_ZI, uzine);
  if (!rows.length) return { status: 'skipped', from: opts.from, to: opts.to, rows: 0, reason: 'nicio rută peste prag' };
  // Ion, 19.09: «pe lângă poză, un text în română — foarte scurt». Un singur mesaj: textul e
  // caption-ul pozei, nu al doilea mesaj.
  const sent = await sendTelegramPhoto(chatId, png, textulEconomiei(rows, opts.from, opts.to), `livrare-${opts.from}-${opts.to}.png`);
  if (!sent.ok) return { status: 'error', from: opts.from, to: opts.to, rows: rows.length, reason: 'Telegram a refuzat poza' };
  await sb.from('app_config').upsert({ key: LIVRARE_POSTER_LAST_KEY, value: marca }, { onConflict: 'key' });
  return { status: 'sent', from: opts.from, to: opts.to, rows: rows.length, messageId: sent.messageId };
}
