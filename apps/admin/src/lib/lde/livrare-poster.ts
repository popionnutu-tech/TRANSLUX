import { getSupabase } from '../supabase';
import { sendTelegramPhoto } from '../telegram-notify';
import { generateLivrareImage, UZINA_SCURT, type LivrareRow, type BramburaRow } from './naveta-image';

/**
 * Posterul de LIVRARE (подача) pe rutele de uzină, la două săptămâni, în grupa Telegram.
 *
 * Ion, 19.09.2026: «Scrie livrare (подача). Fă-l de la 1.09. Să se trimită la fiecare
 * 2 săptămâni în grupă. Și pune acolo doar mașinile cu peste 50 km pe zi livrare.»
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
/** Prima luni de trimitere automată; apoi din 14 în 14 zile, pe cele 14 zile dinainte. */
export const PRIMA_LUNI_CADENTA = '2026-10-05';

export interface CursaLivrare {
  run_date: string;
  factory_route_id: string;
  vehicle_id: string;
  sens: 'tur' | 'retur';
  km_real: number | null;
  km_livrare: number | null;
  km_brambura: number | null;
  km_service: number | null;
  km_gol_ruta: number | null;
}
export interface RutaRef { id: string; uzina_id: string; route_number: number; stops_in_order: string | null }

/** Uzinele validate cu Ion rută cu rută (18–19.09); celelalte intră doar la cerere (`?uzine=all`). */
export const UZINE_IMPLICITE = ['SEBN_ORHEI', 'SEBN_STRASENI'];
export const MIN_ZILE_RUTA = 3;   // sub atâtea zile cu curse media nu spune nimic
const primulSat = (s: string | null) => (s || '').replace(/->/g, '→').split('→')[0]?.trim() || '';
const eZiLucratoare = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`).getUTCDay(); return d >= 1 && d <= 5; };

/**
 * Agregarea pură: o linie pe (uzină, rută), media pe zilele lucrătoare cu curse.
 * `sofer` = numele cel mai des atribuit mașinii pe ruta aia + satul unde doarme mașina.
 */
export function agregaLivrare(input: {
  curse: CursaLivrare[];
  rute: RutaRef[];
  startReal: Map<string, string>;                  // factory_route_id → sat
  soferi: Map<string, string>;                     // `${vehicle_id}|${factory_route_id}` → «Popescu»
  case: Map<string, string>;                       // vehicle_id → sat
  masini?: Map<string, string>;                    // vehicle_id → «552BRAO · Sprinter 312»
  prag?: number;
  minZile?: number;
}): LivrareRow[] {
  const prag = input.prag ?? PRAG_LIVRARE_KM_ZI;
  const ruta = new Map(input.rute.map((r) => [r.id, r]));
  type Zi = { plin: number; liv: number; gol: number; serv: number; plinTur: number; tururi: number };
  const peRutaZi = new Map<string, Map<string, Zi>>();   // rid → date → sume
  const masiniRutei = new Map<string, Map<string, number>>();
  for (const c of input.curse) {
    if (c.km_real == null || !eZiLucratoare(c.run_date) || !ruta.has(c.factory_route_id)) continue;
    if (!peRutaZi.has(c.factory_route_id)) peRutaZi.set(c.factory_route_id, new Map());
    const zile = peRutaZi.get(c.factory_route_id)!;
    const z = zile.get(c.run_date) ?? { plin: 0, liv: 0, gol: 0, serv: 0, plinTur: 0, tururi: 0 };
    z.plin += Number(c.km_real) || 0;
    z.liv += Math.max(0, (Number(c.km_livrare) || 0) - (Number(c.km_brambura) || 0));
    z.gol += Number(c.km_gol_ruta) || 0;
    z.serv += Number(c.km_service) || 0;
    if (c.sens === 'tur' && Number(c.km_real) > 0) { z.plinTur += Number(c.km_real); z.tururi++; }
    zile.set(c.run_date, z);
    const m = masiniRutei.get(c.factory_route_id) ?? new Map<string, number>();
    m.set(c.vehicle_id, (m.get(c.vehicle_id) ?? 0) + 1);
    masiniRutei.set(c.factory_route_id, m);
  }
  const out: LivrareRow[] = [];
  for (const [rid, zile] of peRutaZi) {
    const r = ruta.get(rid)!;
    const n = zile.size;
    let plin = 0, liv = 0, gol = 0, serv = 0, plinTur = 0, tururi = 0;
    for (const z of zile.values()) { plin += z.plin; liv += z.liv; gol += z.gol; serv += z.serv; plinTur += z.plinTur; tururi += z.tururi; }
    const navetaZi = liv / n;
    // fără drum plin nu e rută (mașină fără curse, doar drumuri în afară); sub 3 zile nu e medie
    if (navetaZi < prag || plin <= 0 || n < (input.minZile ?? MIN_ZILE_RUTA)) continue;
    const masini = [...(masiniRutei.get(rid) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
    const sofer = masini.map((v) => {
      const nume = input.soferi.get(`${v}|${rid}`) ?? '—';
      const casa = input.case.get(v);
      return casa ? `${nume} (${casa})` : nume;
    }).filter((x, i, a) => a.indexOf(x) === i).slice(0, 2).join(', ');
    out.push({
      masina: input.masini?.get(masini[0]) ?? '—',
      uzina: r.uzina_id, ruta: r.route_number, start: primulSat(r.stops_in_order),
      start_real: input.startReal.get(rid) ?? null, sofer, zile: n,
      km_tur: tururi ? Math.round(plinTur / tururi) : null,
      total_zi: Math.round((plin + liv + gol + serv) / n),
      plin_zi: Math.round(plin / n), gol_ruta_zi: Math.round(gol / n),
      naveta_zi: Math.round(navetaZi), naveta_total: Math.round(liv),
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
export function descrieZiua(opriri: OprireZi[], sateRute: Set<string>, hh: (iso: string) => string, casa?: string | null): string {
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
  if (pauzaAcasa) return `acasă${casa ? ` (${casa})` : ''} ${hh(pauzaAcasa.de)}–${hh(pauzaAcasa.la)}, nimic în afara rutei`;
  return '';
}

/** Cadența: din 14 în 14 zile, luni, începând cu PRIMA_LUNI_CADENTA; acoperă cele 14 zile dinainte. */
export function perioadaCadentei(azi: string, primaLuni = PRIMA_LUNI_CADENTA): { from: string; to: string } | null {
  const t = Date.UTC(+azi.slice(0, 4), +azi.slice(5, 7) - 1, +azi.slice(8, 10));
  const p = Date.UTC(+primaLuni.slice(0, 4), +primaLuni.slice(5, 7) - 1, +primaLuni.slice(8, 10));
  const zile = Math.round((t - p) / 86400000);
  if (zile < 0 || zile % 14 !== 0) return null;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(t - 14 * 86400000), to: iso(t - 86400000) };
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

export async function incarcaLivrare(from: string, to: string, prag = PRAG_LIVRARE_KM_ZI, uzine: string[] | 'all' = UZINE_IMPLICITE): Promise<{ rows: LivrareRow[]; brambura: BramburaRow[] }> {
  const sb = getSupabase();
  const [curse, rute, etaloane, atribuiri, nopti, soferiRows, vehicule, norme, tipuri] = await Promise.all([
    citesteTot<CursaLivrare>(() => sb.from('lde_route_run')
      .select('run_date,factory_route_id,vehicle_id,sens,km_real,km_livrare,km_brambura,km_service,km_gol_ruta')
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
    citesteTot<{ id: string; display_name: string }>(() => sb.from('lde_vehicle_types').select('id,display_name')),
  ]);
  const numeSofer = new Map(soferiRows.map((d) => [d.id, d.full_name.split(' ')[0]]));
  // «552BRAO · Sprinter 312» — tipul din normele de consum (lde_vehicle_types), unde există
  const numeTip = new Map(tipuri.map((t) => [t.id, t.display_name]));
  const tipMasinii = new Map(norme.filter((n) => n.vehicle_type_id).map((n) => [n.vehicle_id, numeTip.get(n.vehicle_type_id!)]));
  const masiniMap = new Map(vehicule.map((v) => [v.id, tipMasinii.get(v.id) ? `${v.plate_number} · ${tipMasinii.get(v.id)}` : v.plate_number]));
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
    rows: agregaLivrare({ curse, rute: ruteAlese, startReal, soferi: soferiMap, case: caseMap, masini: masiniMap, prag }),
    brambura: await cuDescriere(agregaBrambura({ curse, rute: ruteAlese, masini: masiniMap, soferZi }), ruteAlese, atribuiri, caseMap),
  };
}

/** Umple `unde` pentru fiecare (mașină, zi) din listă, cu opririle zilei din lde_gps_stops. */
async function cuDescriere(
  brambura: BramburaRow[],
  rute: RutaRef[],
  atribuiri: { date: string; vehicle_id: string; factory_route_id: string }[],
  casa: Map<string, string>,
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
    out.push({ ...b, unde: descrieZiua((opriri ?? []) as OprireZi[], sate, hh, casa.get(vid) ?? null) });
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
  const { rows, brambura } = await incarcaLivrare(from, to, prag, uzine);
  const png = await generateLivrareImage(rows, {
    titlu: `LIVRARE (ПОДАЧА) PE RUTELE DE UZINĂ · peste ${prag} km/zi`,
    perioada: `${ddmm(from)} – ${ddmm(to)}.${to.slice(0, 4)}`,
    zileLucratoare: zileLucratoare(from, to),
    brambura,
  });
  return { png, rows };
}

export interface TrimitereLivrare {
  status: 'sent' | 'skipped' | 'error';
  from: string; to: string; rows: number; reason?: string; messageId?: number | null;
}

/** Trimite posterul în grupa din app_config; idempotent pe perioadă (LIVRARE_POSTER_LAST_KEY). */
export async function trimitePosterLivrare(opts: { from: string; to: string; force?: boolean; chatId?: string | null; uzine?: string[] | 'all' }): Promise<TrimitereLivrare> {
  const sb = getSupabase();
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
  const { png, rows } = await generarePoster(opts.from, opts.to, PRAG_LIVRARE_KM_ZI, opts.uzine ?? UZINE_IMPLICITE);
  if (!rows.length) return { status: 'skipped', from: opts.from, to: opts.to, rows: 0, reason: 'nicio rută peste prag' };
  const total = rows.reduce((s, r) => s + r.naveta_total, 0);
  const caption = `<b>Livrare (подача) ${ddmm(opts.from)} – ${ddmm(opts.to)}</b>\n${rows.length} rute cu peste ${PRAG_LIVRARE_KM_ZI} km/zi · ${Math.round(total).toLocaleString('ro-RO')} km în afara rutei`;
  const sent = await sendTelegramPhoto(chatId, png, caption, `livrare-${opts.from}-${opts.to}.png`);
  if (!sent.ok) return { status: 'error', from: opts.from, to: opts.to, rows: rows.length, reason: 'Telegram a refuzat poza' };
  await sb.from('app_config').upsert({ key: LIVRARE_POSTER_LAST_KEY, value: marca }, { onConflict: 'key' });
  return { status: 'sent', from: opts.from, to: opts.to, rows: rows.length, messageId: sent.messageId };
}
