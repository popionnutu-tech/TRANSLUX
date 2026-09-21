// ============================================================================
// LDE — naveta făcută cu ALTĂ mașină decât autobuzul rutei.
//
// Ion, 21.09.2026: «include in analitica si asta livrare».
//
// Livrarea se numără pe autobuzul rutei. Ruta 25 «Vatici → SEBN MD» iese cu livrare 0 în
// fiecare zi — fiindcă autobuzul 820GXP chiar DOARME la Vatici. Omul, însă, e dus acolo
// de 073BRAO (Sprinter 312), care face Ocnița-Răzeși ↔ Vatici de trei ori pe zi, ~210
// km/zi, și așteaptă lângă autobuz exact cât ține schimbul. 4.500 km/lună care nu se
// vedeau nicăieri.
//
// Modul PUR, ca `km-core.mjs` și `places-index.mjs`: îl cheamă `etalon-aggregate.mjs`,
// se testează fără rețea. Citește doar opriri deja botezate — opririle navetei la punctul
// rutei țin 100–135 min, cu mult peste pragul de 90 s al lui `lde_gps_stops`, deci urma
// brută nu e necesară.
//
// Tiparul, așa cum se vede în date:
//   mașina navetei N-ARE nicio cursă în ziua aia (dacă are, km-ii ei sunt deja numărați)
//   ȘI stă de cel puțin două ori lângă locul unde stă un autobuz CU cursă
//   ȘI locul ăla e departe de poartă (altfel prindem așteptarea la uzină)
//   ȘI ea însăși doarme la peste 5 km de locul ăla (altfel prindem curtea comună).
//
// ⚠️ Ultima condiție e cea care taie curtea de la Fălești, unde stau împreună 827MUM,
// 807MUM, 783MUM, 537BRAT: acolo „potrivirea" e doar parcare comună, nu navetă.
// ============================================================================
import { hav } from './km-core.mjs';

export const PRAG_ASTEPTARE_MIN = 20;        // cât stă naveta lângă autobuz ca să fie așteptare
export const PRAG_STATIONARE_RUTA_MIN = 45;  // cât stă autobuzul la punctul lui ca să fie „punct de rută"
export const RAZA_ACELASI_LOC_KM = 0.3;      // două mașini „în același loc"
export const RAZA_POARTA_KM = 2.0;           // punctul de rută nu poate fi la uzină
export const PRAG_BAZA_MIN = 30;             // cât stă mașina navetei ca să fie „acasă"
export const DIST_MIN_BAZA_PUNCT_KM = 5;     // naveta vine de departe, nu din curtea de alături
export const MIN_ZILE_NAVETA = 3;            // sub atâtea zile e coincidență, nu tipar
const MAX_OCOL = 3;                          // drumul casă↔punct nu poate fi de 3× linia dreaptă + 20 km
const MARJA_OCOL_KM = 20;

const cheia = (vehicle_id, date) => `${vehicle_id}|${date}`;
const nr = (v) => (v == null ? 0 : Number(v) || 0);
const punct = (s) => ({ lat: Number(s.lat), lon: Number(s.lon) });

/**
 * @param opriri  lde_gps_stops: { vehicle_id, date, seq, lat, lon, dwell_min, km_from_prev, locality }
 * @param curse   lde_route_run: { vehicle_id, run_date, factory_route_id, km_real }
 * @param porti   lde_uzine_gates: { lat, lon }
 * @returns [{ run_date, vehicle_id, factory_route_id, km, drumuri, autobuz_id, locul }]
 */
export function detecteazaNaveta({ opriri, curse, porti = [], minZile = MIN_ZILE_NAVETA }) {
  // ── ce mașină a făcut rută în ce zi, și care e ruta ei principală ──
  const ruteZi = new Map();                       // `${vehicle}|${date}` → Map(rid → curse)
  for (const c of curse) {
    if (nr(c.km_real) <= 0) continue;
    const k = cheia(c.vehicle_id, c.run_date);
    const m = ruteZi.get(k) ?? new Map();
    m.set(c.factory_route_id, (m.get(c.factory_route_id) ?? 0) + 1);
    ruteZi.set(k, m);
  }
  // ruta zilei = cea mai des făcută; la egalitate, id-ul mai mic — ca rularea să fie repetabilă
  const rutaZilei = new Map();
  for (const [k, m] of ruteZi) {
    rutaZilei.set(k, [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]);
  }

  // ── opririle, pe mașină-zi, în ordinea urmei ──
  const peMasinaZi = new Map();
  for (const s of opriri) {
    const k = cheia(s.vehicle_id, s.date);
    if (!peMasinaZi.has(k)) peMasinaZi.set(k, []);
    peMasinaZi.get(k).push(s);
  }
  for (const list of peMasinaZi.values()) list.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  const langaPoarta = (p) => porti.some((g) => hav(p, { lat: Number(g.lat), lon: Number(g.lon) }) <= RAZA_POARTA_KM);

  // ── punctele de rută ale fiecărei zile: unde stă un autobuz CU cursă ──
  const punctePeZi = new Map();                   // date → [{ p, vehicle_id, factory_route_id, locality }]
  for (const [k, list] of peMasinaZi) {
    const rid = rutaZilei.get(k);
    if (!rid) continue;                           // mașina n-a făcut rută în ziua aia
    const [vehicle_id, date] = [list[0].vehicle_id, list[0].date];
    for (const s of list) {
      if (nr(s.dwell_min) < PRAG_STATIONARE_RUTA_MIN) continue;
      const p = punct(s);
      if (langaPoarta(p)) continue;
      if (!punctePeZi.has(date)) punctePeZi.set(date, []);
      punctePeZi.get(date).push({ p, vehicle_id, factory_route_id: rid, locality: s.locality ?? null });
    }
  }

  // ── zilele de navetă ──
  const brute = [];
  for (const [k, list] of peMasinaZi) {
    if (rutaZilei.has(k)) continue;               // are cursă proprie: km-ii ei sunt deja numărați
    const date = list[0].date, vehicle_id = list[0].vehicle_id;
    const puncte = (punctePeZi.get(date) ?? []).filter((x) => x.vehicle_id !== vehicle_id);
    if (!puncte.length) continue;

    // fiecare oprire: ancoră (așteaptă lângă un autobuz), acasă (stă mult, dar nu lângă el), sau nimic
    const marcaje = list.map((s) => {
      const p = punct(s);
      const langa = puncte.find((x) => hav(p, x.p) <= RAZA_ACELASI_LOC_KM);
      if (langa && nr(s.dwell_min) >= PRAG_ASTEPTARE_MIN) return { fel: 'ancora', punct: langa, p };
      if (nr(s.dwell_min) >= PRAG_BAZA_MIN) return { fel: 'acasa', p, dwell: nr(s.dwell_min), locality: s.locality ?? null };
      return null;
    });
    const ancore = marcaje.filter((m) => m?.fel === 'ancora');
    const case_ = marcaje.filter((m) => m?.fel === 'acasa');
    if (ancore.length < 2 || !case_.length) continue;
    // curtea comună: dacă mașina doarme chiar acolo, nu face navetă — parchează
    const deDeparte = case_.some((c) => ancore.every((a) => hav(c.p, a.p) >= DIST_MIN_BAZA_PUNCT_KM));
    if (!deDeparte) continue;

    // km-ii drumurilor care CHIAR leagă casa de punctul rutei; un ocol care nu se termină
    // la punctul rutei nu intră (17.09 la 073BRAO: drumul la Bălți)
    const idx = marcaje.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
    const peRuta = new Map();                     // rid → { km, drumuri, autobuz_id, locul }
    for (let j = 0; j + 1 < idx.length; j++) {
      const a = marcaje[idx[j]], b = marcaje[idx[j + 1]];
      if (a.fel === b.fel) continue;              // casă→casă sau ancoră→ancoră: nu e drum de navetă
      let km = 0;
      for (let t = idx[j] + 1; t <= idx[j + 1]; t++) km += nr(list[t].km_from_prev);
      const direct = hav(a.p, b.p);
      if (km > MAX_OCOL * direct + MARJA_OCOL_KM) continue;   // drumul ăsta a fost pe altundeva
      const anc = a.fel === 'ancora' ? a : b;
      const cur = peRuta.get(anc.punct.factory_route_id)
        ?? { km: 0, drumuri: 0, autobuz_id: anc.punct.vehicle_id, locul: anc.punct.locality };
      cur.km += km; cur.drumuri++;
      peRuta.set(anc.punct.factory_route_id, cur);
    }
    // casa mașinii navetei = cea mai lungă staționare care nu e lângă autobuz. Nu se poate
    // lua din `is_base`: 073BRAO n-are nicio oprire cu steagul ăla în septembrie.
    const casa = case_.reduce((b, c) => (c.dwell > (b?.dwell ?? -1) ? c : b), null)?.locality ?? null;
    for (const [factory_route_id, v] of peRuta) {
      if (v.km <= 0) continue;
      brute.push({ run_date: date, vehicle_id, factory_route_id, km: +v.km.toFixed(2), drumuri: v.drumuri, autobuz_id: v.autobuz_id, locul: v.locul, casa });
    }
  }

  // ── pragul de tipar: o singură potrivire e coincidență ──
  const zilePePereche = new Map();
  for (const r of brute) {
    const k = `${r.vehicle_id}|${r.factory_route_id}`;
    zilePePereche.set(k, (zilePePereche.get(k) ?? new Set()).add(r.run_date));
  }
  return brute
    .filter((r) => (zilePePereche.get(`${r.vehicle_id}|${r.factory_route_id}`)?.size ?? 0) >= minZile)
    .sort((a, b) => a.run_date.localeCompare(b.run_date) || (a.vehicle_id < b.vehicle_id ? -1 : 1));
}
