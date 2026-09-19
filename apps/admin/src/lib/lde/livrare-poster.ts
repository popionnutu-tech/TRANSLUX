import { getSupabase } from '../supabase';
import { sendTelegramPhoto } from '../telegram-notify';
import { generateLivrareImage, type LivrareRow } from './naveta-image';

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

export async function incarcaLivrare(from: string, to: string, prag = PRAG_LIVRARE_KM_ZI, uzine: string[] | 'all' = UZINE_IMPLICITE): Promise<LivrareRow[]> {
  const sb = getSupabase();
  const [curse, rute, etaloane, atribuiri, nopti, soferiRows] = await Promise.all([
    citesteTot<CursaLivrare>(() => sb.from('lde_route_run')
      .select('run_date,factory_route_id,vehicle_id,sens,km_real,km_livrare,km_brambura,km_service,km_gol_ruta')
      .gte('run_date', from).lte('run_date', to).not('km_real', 'is', null)),
    citesteTot<RutaRef>(() => sb.from('lde_factory_routes').select('id,uzina_id,route_number,stops_in_order').eq('active', true)),
    citesteTot<{ factory_route_id: string; sat_start_real: string | null }>(() => sb.from('lde_route_etalon')
      .select('factory_route_id,sat_start_real').not('sat_start_real', 'is', null)),
    citesteTot<{ vehicle_id: string; factory_route_id: string; driver_id: string | null }>(() => sb.from('lde_atribuiri_zilnice')
      .select('vehicle_id,factory_route_id,driver_id').gte('date', from).lte('date', to).eq('route_kind', 'uzina').not('driver_id', 'is', null)),
    citesteTot<{ vehicle_id: string; locality: string | null }>(() => sb.from('lde_gps_stops')
      .select('vehicle_id,locality').eq('is_base', true).gte('date', from).lte('date', to).not('locality', 'is', null)),
    citesteTot<{ id: string; full_name: string }>(() => sb.from('drivers').select('id,full_name')),
  ]);
  const numeSofer = new Map(soferiRows.map((d) => [d.id, d.full_name.split(' ')[0]]));
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
  return agregaLivrare({ curse, rute: ruteAlese, startReal, soferi: soferiMap, case: caseMap, prag });
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const zileLucratoare = (from: string, to: string) => {
  let n = 0;
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 86400000) { const d = new Date(t).getUTCDay(); if (d >= 1 && d <= 5) n++; }
  return n;
};

export async function generarePoster(from: string, to: string, prag = PRAG_LIVRARE_KM_ZI, uzine: string[] | 'all' = UZINE_IMPLICITE): Promise<{ png: Buffer; rows: LivrareRow[] }> {
  const rows = await incarcaLivrare(from, to, prag, uzine);
  const png = await generateLivrareImage(rows, {
    titlu: `LIVRARE (ПОДАЧА) PE RUTELE DE UZINĂ · peste ${prag} km/zi`,
    perioada: `${ddmm(from)} – ${ddmm(to)}.${to.slice(0, 4)}`,
    zileLucratoare: zileLucratoare(from, to),
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
