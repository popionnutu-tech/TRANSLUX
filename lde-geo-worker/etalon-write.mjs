// ============================================================================
// LDE — scrierea curselor și a contribuțiilor pe ziua GPS.
//
// Partea cu I/O; logica pură stă în etalon-labels.mjs. Chemată din gps-worker,
// DUPĂ ce s-au scris km_total și opririle — ordinea nu e cosmetică: bucla worker-ului
// n-are try/catch, iar km_total duce salariile (praguri 6.000/7.000 km) și facturarea
// per_km. O excepție în etichetare, scrisă înainte, ar lăsa restul flotei fără km
// pe noaptea aia.
// ============================================================================
import { simplifica } from './geom-simplify.mjs';
import { hav } from './km-core.mjs';
import {
  secvente, treceriPorti, sateDeservite, segmenteZi, imperecheazaTreceri,
  opririScurte, popasuri, kmInterval, PRAG_SAT_KM,
} from './etalon-labels.mjs';

/**
 * Capetele REALE ale unei curse: prima și ultima oprire stabilă care NU e baza.
 *
 * Nu primul/ultimul punct al urmei — acelea sunt casa șoferului, iar km-ii de acolo
 * până la prima stație sunt tocmai livrarea pe care o măsurăm. Ion, 17.09: «unde se
 * începe și se termină ruta după ultima și prima oprire stabilă față locul de trai la
 * șofer». Măsurat atunci: în 730 din 1.099 de cazuri capătul geometriei era la sub 1 km
 * de locul unde doarme mașina.
 */
function capeteReale(stops, pts, from, to, scurte = []) {
  const t0 = pts[from].t, t1 = pts[to].t;
  const inSegment = stops.filter((st) => !st.isBase && st.arrival >= t0 && st.arrival <= t1)
    .map((st) => ({ lat: st.lat, lon: st.lon, locality: st.locality ?? null, arrival: st.arrival }));
  // Plus opririle SCURTE din sat (≥40 s) — același martor pe care îl folosim la «a oprit
  // în satele rutei». Cu doar opririle stabile de 90 s, un tur cu șase opriri de un minut
  // prin sate ieșea „livrare" pe toată lungimea: Lopatenco, 09.09, 29,6 km livrare dintr-un
  // tur de 29,7. Oamenii urcă într-un minut; 90 de secunde e pragul opririi, nu al stației.
  for (const p of scurte)
    if (p.i >= from && p.i <= to)
      inSegment.push({ lat: pts[p.i].lat, lon: pts[p.i].lon, locality: p.locality ?? null, arrival: pts[p.i].t });
  inSegment.sort((a, b) => a.arrival - b.arrival);
  if (!inSegment.length) return { prima: null, ultima: null, iPrima: null, iUltima: null };
  const pct = (st) => ({ lat: st.lat, lon: st.lon, locality: st.locality ?? null });
  // indicele punctului la care mașina a ajuns în stație — de acolo începe cursa cu pasageri
  const idx = (st) => {
    for (let i = from; i <= to; i++) if (pts[i].t >= st.arrival) return i;
    return to;
  };
  const p = inSegment[0], u = inSegment[inSegment.length - 1];
  return { prima: pct(p), ultima: pct(u), iPrima: idx(p), iUltima: idx(u) };
}

/**
 * LIVRAREA: drumul gol dintre casa șoferului și capătul rutei.
 *
 * E lucrul pe care Ion l-a cerut din prima frază — «să minimizăm livrarea» — și tocmai el
 * NU se socotea: segmentul de dimineață începe de acasă, deci km-ii casă → prima stație
 * stăteau ascunși în `km_real` al cursei pline. Măsurat pe 01-17.09: circa 1.000 km/zi pe
 * flotă, din care 431 la Draxelmaier și 335 la Orhei. Orhei părea că are 3% gol, fiindcă
 * nu merge acasă între ture (3 schimburi la rând) — dar tot pleacă de acasă dimineața și
 * se întoarce seara.
 *
 * Tăietura e la prima (respectiv ultima) oprire stabilă care nu e baza: înainte de ea
 * mașina merge goală după oameni, după ea îi duce. La segmentele de peste zi bucata iese
 * zero, fiindcă ele încep deja în sat sau la poartă — deci regula se aplică uniform, fără
 * cazuri speciale.
 */
/**
 * Golul care trece pe ACASĂ — partea optimizabilă prin repartizare.
 *
 * Ion, 18.09: «trebuie să facem distincție între km goi care pot fi optimizați și goi care
 * nu pot fi optimizați». Un drum gol de la poartă înapoi în zona de unde se iau oamenii
 * schimbului următor e impus de felul în care uzina își împarte rutele — noi nu-l putem
 * tăia fără să tăiem serviciul. Un drum gol care trece pe la casa șoferului ține de
 * REPARTIZARE: cine stă lângă poartă îl face scurt, cine stă departe îl face lung.
 */
function golPrinCasa(seg, pts, calc, baze, razaKm = 1.0) {
  if (seg.stare !== 'gol' || !baze.length) return 0;
  // Drumul ÎNTREG, dacă atinge casa — nu doar kilometrii de lângă ea. Prima variantă
  // aduna doar pașii aflați în raza de 1 km, deci dintr-un drum de 60 km poartă → acasă
  // conta un kilometru și jumătate: ieșeau 137 km/zi la Draxelmaier, deși măsurasem că
  // mașina oprește acasă în 79% din zilele cu două atingeri de poartă. Un drum care
  // trece pe acasă ține de REPARTIZARE pe toată lungimea lui: alt șofer, alt drum.
  const atingeCasa = (() => {
    for (let i = seg.from; i <= seg.to; i++)
      if (baze.some((b) => hav(pts[i], b) <= razaKm)) return true;
    return false;
  })();
  return atingeCasa ? seg.km : 0;
}

function taieLivrarea(seg, capete, calc) {
  if (seg.stare !== 'plin' || !capete) return null;
  const i = seg.tip === 'apropiere' ? capete.iPrima : capete.iUltima;
  if (i == null || i <= seg.from || i >= seg.to) return null;
  return seg.tip === 'apropiere'
    ? { livrare: kmInterval(calc.stepKm, seg.from, i), plin: kmInterval(calc.stepKm, i, seg.to), from: i, to: seg.to, sursa: 'oprire' }
    : { livrare: kmInterval(calc.stepKm, i, seg.to), plin: kmInterval(calc.stepKm, seg.from, i), from: seg.from, to: i, sursa: 'oprire' };
}

/**
 * LIVRAREA după regula lui Ion, 18.09: «ruta începe la primul sat din denumire și se
 * termină la uzină; tot ce e în afara ei e livrare». Popescu, 552BRAO: ruta «Vatici →
 * Strășeni» e 29 km, făcută de 6 ori pe zi = 175 km; ceilalți 240 km — Chiperceni ↔
 * Vatici de 6 ori — sunt ai șoferului, nu ai rutei. Tăietura pe OPRIRI (de mai sus) îi
 * dădea 77: oprirea din Vatici e sub 40 s sau în afara centrului. Aici nu contează nicio
 * oprire: turul începe la prima intrare în raza satului care dă numele rutei, returul se
 * termină la ultima ieșire din ea. Cine locuiește în satul ăla iese cu livrare zero.
 * Dacă urma nu intră deloc în raza satului (nume care nu e localitate — 14% din rute —
 * sau drum care îl ocolește), se cade înapoi pe tăietura la oprire.
 */
function imparteLaSat(seg, pts, calc, sat, razaKm = PRAG_SAT_KM) {
  if (!sat) return null;
  let i = null;
  if (seg.tip === 'apropiere') { for (let k = seg.from; k <= seg.to; k++) if (hav(pts[k], sat) <= razaKm) { i = k; break; } }
  else { for (let k = seg.to; k >= seg.from; k--) if (hav(pts[k], sat) <= razaKm) { i = k; break; } }
  if (i == null) return null;
  return seg.tip === 'apropiere'
    ? { afara: kmInterval(calc.stepKm, seg.from, i), inauntru: kmInterval(calc.stepKm, i, seg.to), from: i, to: seg.to }
    : { afara: kmInterval(calc.stepKm, i, seg.to), inauntru: kmInterval(calc.stepKm, seg.from, i), from: seg.from, to: i };
}

function taiePeSat(seg, pts, calc, sat, razaKm = PRAG_SAT_KM) {
  if (seg.stare !== 'plin') return null;
  const t = imparteLaSat(seg, pts, calc, sat, razaKm);
  return t ? { livrare: t.afara, plin: t.inauntru, from: t.from, to: t.to, sursa: 'sat' } : null;
}

// Golul care NU se poate optimiza — partea drumului gol care stă PE rută, între satul-nume
// și poartă — e `inauntru` din `imparteLaSat` pe drumul gol. Ion, 18.09: «trebuie să facem
// distincție între km goi care pot fi optimizați și care nu». Întoarcerea goală Strășeni →
// Vatici după ce a livrat schimbul e a uzinei (așa și-a împărțit turele); de la Vatici la
// Chiperceni e a șoferului. Un drum gol care nu intră deloc în satul-nume are 0 pe rută.

const norm = (s) => (s || '').toLowerCase()
  .replace(/ă|â/g, 'a').replace(/î/g, 'i').replace(/ș|ş/g, 's').replace(/ț|ţ/g, 't')
  .replace(/[-\s]+/g, ' ').trim();

/** Contextul unei zile: porți, atribuiri, granițe. Se încarcă o dată, nu per mașină. */
export async function incarcaContext(supa, day) {
  const [{ data: gates }, { data: atrib }, { data: granite }, { data: rute }, { data: etaloane }] = await Promise.all([
    supa.from('lde_uzine_gates').select('uzina_id,label,lat,lon,radius_km').eq('active', true),
    supa.from('lde_atribuiri_zilnice')
      .select('factory_route_id,shift_number,slot,vehicle_id,vehicle_id_retur,direction,status')
      .eq('date', day).eq('route_kind', 'uzina').not('vehicle_id', 'is', null),
    supa.from('lde_uzina_shift_boundaries').select('uzina_id,shift_number,tip,minute_zi'),
    supa.from('lde_factory_routes').select('id,uzina_id,stops_in_order').eq('active', true),
    // Satele ETALON ale fiecărei rute — ce face ruta de obicei, nu cum se numește.
    // Ion, 17.09: «denumirea rutei e 1-2 sate, de obicei cursa e mai lungă». Numele dă un
    // semnal slab când trebuie spus a cui e cursa (33 de rute au două nume, drumul real
    // trece prin 18,8 sate); etalonul dă treisprezece-nouăsprezece. Se ia doar etalonul
    // cu ≥5 observații, construit DOAR din curse neambigue — deci nu se hrănește din
    // propriile lui ghiciri.
    supa.from('lde_route_etalon').select('factory_route_id,sate,observations,km_median,shift_number,sens,sat_start_real').gte('observations', 5),
  ]);
  const porti = new Map(), granitePeUz = new Map(), sateRuta = new Map(), uzinaRutei = new Map();
  for (const g of gates ?? []) {
    if (!porti.has(g.uzina_id)) porti.set(g.uzina_id, []);
    porti.get(g.uzina_id).push({ ...g, lat: +g.lat, lon: +g.lon });
  }
  for (const b of granite ?? []) {
    if (!granitePeUz.has(b.uzina_id)) granitePeUz.set(b.uzina_id, []);
    // baza scrie minute_zi (snake_case), modulul pur așteaptă minuteZi — fără maparea
    // asta toate cursele ieșeau 'necunoscut', km_plin 0, km_gol 0.
    granitePeUz.get(b.uzina_id).push({ minuteZi: b.minute_zi, tip: b.tip, shift_number: b.shift_number });
  }
  for (const r of rute ?? []) uzinaRutei.set(r.id, r.uzina_id);
  const ruteUzinei = new Map();
  for (const r of rute ?? []) {
    if (!ruteUzinei.has(r.uzina_id)) ruteUzinei.set(r.uzina_id, []);
    ruteUzinei.get(r.uzina_id).push(r.id);
  }
  for (const r of rute ?? []) sateRuta.set(r.id, (r.stops_in_order || '').replace(/->/g, '→').split('→').map((s) => norm(s)).filter(Boolean));
  // rutele ADM («Chișinău → SEBN MD (ADM)», «Bălți → SEBN MD (ADM)»): orar de birou, nu de
  // schimb — se recunosc după oraș, nu după ceas (vezi `scrieCurse`)
  const ruteAdm = new Set((rute ?? []).filter((x) => /\badm\b/i.test(x.stops_in_order || '')).map((x) => x.id));
  const sateEtalon = new Map();
  for (const e of etaloane ?? []) {
    const nume = (e.sate ?? []).map((x) => norm(x.nume)).filter(Boolean);
    if (!nume.length) continue;
    const ex = sateEtalon.get(e.factory_route_id);
    // o rută are etalon pe fiecare schimb×slot×sens; pentru «a cui e cursa» ajunge reuniunea
    sateEtalon.set(e.factory_route_id, ex ? [...new Set([...ex, ...nume])] : nume);
  }
  // km-ul etalon pe (rută, schimb, sens) — judecata de verosimilitate din `scrieCurse`:
  // o rută nu poate fi „recunoscută" pe un drum de cu totul altă lungime decât al ei
  const kmEtalon = new Map();
  for (const e of etaloane ?? []) {
    if (e.km_median == null) continue;
    if (!kmEtalon.has(e.factory_route_id)) kmEtalon.set(e.factory_route_id, new Map());
    kmEtalon.get(e.factory_route_id).set(`${e.shift_number}|${e.sens}`, Number(e.km_median));
  }
  // satele etalonului de tur ÎN ORDINEA traseului (etalonul cu cele mai multe observații)
  // — rezerva satului-nume, când drumul nu intră în el
  // satul de start REAL al rutei, dedus de agregator din opririle care se repetă (migr. 380)
  const satStartReal = new Map();
  for (const e of etaloane ?? []) if (e.sat_start_real) satStartReal.set(e.factory_route_id, norm(e.sat_start_real));
  const sateEtalonTur = new Map(), obsTur = new Map();
  for (const e of etaloane ?? []) {
    if (e.sens !== 'tur' || !e.sate?.length) continue;
    if ((obsTur.get(e.factory_route_id) ?? 0) >= e.observations) continue;
    obsTur.set(e.factory_route_id, e.observations);
    sateEtalonTur.set(e.factory_route_id, e.sate.map((x) => norm(x.nume)).filter(Boolean));
  }
  // atribuirile mașinii, inclusiv cele unde e doar mașina de retur
  const peMasina = new Map();
  for (const a of atrib ?? []) {
    for (const vid of [a.vehicle_id, a.vehicle_id_retur]) {
      if (!vid) continue;
      if (!peMasina.has(vid)) peMasina.set(vid, []);
      peMasina.get(vid).push({ ...a, eRetur: vid === a.vehicle_id_retur && vid !== a.vehicle_id });
    }
  }
  return { porti, peMasina, granitePeUz, sateRuta, sateEtalon, kmEtalon, sateEtalonTur, satStartReal, uzinaRutei, ruteUzinei, ruteAdm };
}

/**
 * Scrie cursele unei mașini-zi + contribuția ei pe ziua GPS.
 * Idempotent: cursele de ZI se șterg și se rescriu pe (run_date, vehicle_id); cele de
 * noapte se COMPLETEAZĂ (upsert pe cheia cursei), fiindcă turul lor a fost scris de
 * rularea de ieri, ale cărei puncte nu mai sunt în memorie.
 */
export async function scrieCurse(supa, { vehicle_id, plate }, day, r, ctx) {
  const listaToata = ctx.peMasina.get(vehicle_id) ?? [];
  // Rutele ADM nu intră în împerecherea pe ceas: merg pe orar de birou. Vartic duce în
  // fiecare seară oameni la Chișinău (ruta 24), Scurtu la Orhei de la Bălți (ruta 23) —
  // ceasul schimburilor le punea pe ruta 20, respectiv „necunoscut". Se scriu separat, jos.
  const listaAdm = listaToata.filter((a) => ctx.ruteAdm?.has(a.factory_route_id));
  const lista = listaToata.filter((a) => !ctx.ruteAdm?.has(a.factory_route_id));
  if (!listaToata.length || !r.pts || r.pts.length < 2) return { curse: 0 };
  // UZINELE mașinii, nu prima dintre ele. Ion, 17.09: «schimburile nu pot fi interzise,
  // ele sunt planificate de client; dacă vorbim de Draxelmaier, el are 2 uzine». Măsurat:
  // 29 de mașini-zile din 16 au atribuiri la DOUĂ uzine, iar codul lua porțile doar de la
  // prima — deci la cealaltă nu vedea nicio trecere și toată ziua ieșea „necunoscut".
  // 9.651 km din 13.089 se pierdeau exact așa (74%). Cazul găsit: 283BRAT pe 16.09, cu
  // Ungheni #3 prima în listă și Orhei #15 lucrată efectiv — 586 km, toți necunoscuți.
  const uzineGrafic = [...new Set(listaToata.map((a) => ctx.uzinaRutei.get(a.factory_route_id) ?? a.direction).filter(Boolean))];
  // Porțile TUTUROR uzinelor, nu doar ale celor din grafic. Ion, 18.09: «GPS-ul e faptic,
  // cum a mers; graficul de mână nu» — și se înșală și despre UZINĂ, nu doar despre rută
  // sau schimb. 073BRAO e trecută 13 zile la rând pe Trox #1, dar la orele schimbului
  // oprește la Bucuria — poarta SEBN Orhei, la 166 km de Briceni. Cu porțile luate doar
  // din grafic nu vedea nicio trecere și ieșea «fara_trecere» zi de zi, cu 235 km.
  // Măsurat pe 13 zile lucrătoare: 34 de mașini-zile ating poarta altei uzine decât cea
  // din grafic (18 Ungheni→Orhei, 11 Trox→Orhei).
  const gts = [...ctx.porti.values()].flat();

  // Ziua se rescrie de la zero pentru mașina asta. Fără ștergere, o re-rulare după o
  // corecție de segmentare lasă în urmă cursele pe care noul calcul NU le mai produce —
  // și ele rămân în fereastra de 60 de zile a etalonului, cu km și abateri de la o logică
  // care nu mai există. Ștergerea e pe (zi, mașină), cheie pe care worker-ul o DEȚINE.
  // Cursele de noapte ale zilei de IERI nu sunt atinse: ele poartă run_date = ieri, iar
  // rularea de azi le completează prin upsert, nu le rescrie.
  await supa.from('lde_route_run').delete().eq('run_date', day).eq('vehicle_id', vehicle_id);

  const secv = secvente(r.pts, r.calc);
  // La o uzină pe care graficul N-O ARE, atingerea trebuie să fie o OPRIRE, nu o trecere.
  // Sochircă, ruta 4 Orhei: returul trece zilnic pe lângă poarta LEAR Florești fără să
  // oprească (1–2 minute în rază), iar din asta ieșea zi de zi o cursă de 1,5 km pe ruta 5
  // Florești, cu `uzina_din_gps` — o cursă-fantomă, care intra și în etalonul rutei 5.
  // La uzina din grafic pragul nu se aplică: acolo o atingere scurtă e tot o atingere.
  // Și la ORICE uzină, o atingere fără oprire în rază e o trecere, nu o atingere
  // (`oprit` — vezi `treceriPorti`): Popescu trece prin poarta Orhei de trei ori pe zi
  // în drum spre Strășeni, iar Orhei E în graficul lui, deci pragul de mai sus nu-l prindea.
  // Măsurat pe flotă, 16.09 (310 atingeri): sub un minut în rază, 1 din 23 oprită; peste
  // 10 minute, 218 — toate ale uzinei, chiar dacă la 17 dintre ele oprirea e la marginea
  // razei (mașina trece, stă lângă poartă, trece iar; debounce-ul le unește). Deci: oprit
  // în rază, SAU cel puțin 10 minute în jurul porții.
  const STATIONARE_MIN_UZINA_STRAINA = 5;
  const STATIONARE_LUNGA_MIN = 10;
  const tr = treceriPorti(r.pts, secv, gts).filter((t) => {
    const min = (t.tOut - t.tIn) / 60000;
    if (!t.oprit && min < STATIONARE_LUNGA_MIN) return false;
    return uzineGrafic.includes(t.uzina_id) || min >= STATIONARE_MIN_UZINA_STRAINA;
  });

  // Împerecherea se face PE FIECARE UZINĂ: fiecare poartă are orarul ei, iar o atingere
  // la Orhei nu poate primi rolul unui schimb de la Ungheni. Capacitatea unui (schimb,
  // rol) = câte rute are mașina în schimbul ăla la uzina aia — o mașină cu două rute în
  // același schimb face două livrări și două ridicări.
  const perechi = tr.map(() => ({ livrare: null, ridicare: null }));
  // uzinele zilei = cele din grafic + cele ale căror porți le-a atins efectiv
  const uzine = [...new Set([...uzineGrafic, ...tr.map((t) => t.uzina_id)])];
  for (const u of uzine) {
    const indici = tr.map((t, i) => ({ t, i })).filter((x) => x.t.uzina_id === u);
    if (!indici.length) continue;
    const aleUzinei = lista.filter((a) => (ctx.uzinaRutei.get(a.factory_route_id) ?? a.direction) === u);
    // la o uzină pe care graficul n-o are, toate schimburile ei sunt „atribuite" cu
    // capacitate 1 — altfel bugetul de roluri ar fi zero și ziua s-ar pierde iar
    const atribuite = aleUzinei.length
      ? [...new Set(aleUzinei.map((a) => a.shift_number).filter((x) => x != null))]
      : [...new Set((ctx.granitePeUz.get(u) ?? []).map((g) => g.shift_number))];
    // TOATE schimburile uzinei intră în împerechere, nu doar cele scrise în grafic.
    // Graficul spune corect CE RUTĂ face mașina, dar se înșală despre CÂND: cele patru
    // cazuri din 17.09 aveau ambele rute trecute pe schimbul 1, iar operaționalul a
    // confirmat că fac câte două ture. GPS-ul le arată: atingerea de la 23:54 cade fix pe
    // sfârșitul schimbului 2 (00:06 învățat), la 8 ore de granița schimbului 1 — deci
    // rămânea fără rol, iar drumurile ei, pline de oameni, se scriau ca „gol". Ceasul e
    // dovada mai tare despre ORĂ; graficul rămâne dovada despre RUTĂ.
    const shifturi = [...new Set([...atribuite,
      ...(ctx.granitePeUz.get(u) ?? []).map((g) => g.shift_number)])];
    const capacitate = new Map();
    for (const sh of shifturi)
      capacitate.set(String(sh), Math.max(1, new Set(aleUzinei.filter((a) => a.shift_number === sh)
        .map((a) => a.factory_route_id)).size));
    const p = imperecheazaTreceri(indici.map((x) => x.t), ctx.granitePeUz.get(u) ?? [], shifturi, undefined, capacitate, atribuite);
    indici.forEach((x, k) => { perechi[x.i] = p[k]; });
  }
  const segs = segmenteZi(r.pts, r.calc, tr, perechi);

  // contribuția pe ziua GPS — cheia e (mașină, zi GPS), diferită de cheia cursei
  // Livrarea (casă ↔ capătul rutei) se scade din plin și se adună la gol — altfel ea
  // rămâne ascunsă în cursa cu pasageri, iar cifra care trebuie micșorată nu se vede.
  const contrib = { km_plin: 0, km_gol: 0, km_necunoscut: 0, km_livrare: 0, km_gol_acasa: 0 };
  const bazeP = (r.stops ?? []).filter((st) => st.isBase).map((st) => ({ lat: st.lat, lon: st.lon }));
  // «în sat» = la cel mult 500 m de o localitate cunoscută. Nu 2 km (pragul de etichetare):
  // aproape orice punct din Moldova e la 2 km de ceva, deci n-ar despărți nimic.
  const RAZA_OPRIRE_SAT_KM = 0.5;
  const locul = (p) => ctx.placesIdx?.nearestWithin(p, RAZA_OPRIRE_SAT_KM)?.name ?? null;
  const inSat = (p) => locul(p) != null;
  // opririle scurte ale zilei care pot fi capete de cursă (vezi `capeteReale`): din sat
  // (≥40 s), sau de cel puțin 2 minute oriunde — o oprire de 2 minute pe drum nu e
  // semafor, e o stație al cărei sat stă la peste 500 m de șosea (Popescu, 552BRAO:
  // oprirea din Vatici, 15:14, 2 min, fără localitate în rază). Nu acasă, nu la poartă.
  // Satul care dă numele rutei (primul din grafic), ca punct: dintre locurile cu numele
  // ăla se ia cel mai apropiat de poarta uzinei — sunt trei „Slobozia" în țară.
  if (!ctx.locuriPeNume && ctx.placesIdx?.places) {
    ctx.locuriPeNume = new Map();
    for (const p of ctx.placesIdx.places) {
      const n = norm(p.name);
      if (!ctx.locuriPeNume.has(n)) ctx.locuriPeNume.set(n, []);
      ctx.locuriPeNume.get(n).push(p);
    }
  }
  // Dintre locurile cu același nume se ia cel de care DRUMUL trece cel mai aproape, nu cel
  // mai apropiat de poartă: sunt două Mihailovca, iar cea mai apropiată de Orhei nu e cea
  // de pe ruta 9 — Maliovanii, care locuiește chiar în Mihailovca, ieșea cu 52 km livrare.
  const loculNumit = (nume, seg) => {
    const locuri = nume ? ctx.locuriPeNume?.get(nume) : null;
    if (!locuri?.length) return null;
    if (locuri.length === 1 || !seg) return locuri[0];
    const dist = (p) => { let m = Infinity; for (let k = seg.from; k <= seg.to; k += 3) m = Math.min(m, hav(r.pts[k], p)); return m; };
    return locuri.reduce((b, p) => (dist(p) < dist(b) ? p : b));
  };
  // Satul de start al rutei, pentru DRUMUL dat: cel din denumire; dacă drumul nu intră în
  // el, satele etalonului în ordinea traseului, dar numai cele la peste 5 km de poartă.
  // Ruta 20 se numește «Voroteț», capătul cel mai depărtat, care nu se atinge la fiecare
  // tură; Vartic intră uneori direct în Biești/Cihoreni, fără Chiperceni — fără rezerva
  // asta cursele lui ieșeau «ruta neatinsă». Iar pragul de 5 km: etalonul are și cartierele
  // Orheiului de lângă poartă, prin care trece ORICE drum — inclusiv cel la Chișinău.
  const RAZA_LANGA_POARTA_KM = 5;
  const satulRutei = (rid, seg) => {
    // Ion, 19.09: «dacă se întâmplă sistematic, zilnic — e rută; scrii sub denumirea rutei
    // primul sat de unde urcă». Satul de start REAL (dedus din opririle care se repetă)
    // bate satul din denumire: ruta 2 «Cișmea» pleacă zilnic din Ocnița-Răzeși.
    const real = loculNumit(ctx.satStartReal?.get(rid), seg);
    if (real && seg && imparteLaSat(seg, r.pts, r.calc, real)) return real;
    const numit = loculNumit((ctx.sateRuta.get(rid) ?? [])[0], seg);
    if (!seg) return real ?? numit;
    if (numit && imparteLaSat(seg, r.pts, r.calc, numit)) return numit;
    const poarta = (ctx.porti.get(ctx.uzinaRutei.get(rid)) ?? [])[0];
    for (const nume of ctx.sateEtalonTur?.get(rid) ?? []) {
      const loc = loculNumit(nume, seg);
      if (!loc || (poarta && hav(loc, poarta) <= RAZA_LANGA_POARTA_KM)) continue;
      if (imparteLaSat(seg, r.pts, r.calc, loc)) return loc;
    }
    return numit;
  };
  const OPRIRE_ORIUNDE_S = 120;
  const scurteInSat = popasuri(r.pts, 0, r.pts.length - 1)
    .map((p) => ({ i: p.from, secunde: p.secunde, locality: locul(r.pts[p.from]) }))
    .filter((p) => (p.locality != null || p.secunde >= OPRIRE_ORIUNDE_S)
      && !bazeP.some((b) => hav(r.pts[p.i], b) <= 0.5)
      && !gts.some((g) => hav(r.pts[p.i], g) <= 1.0));
  for (const s of segs) {
    if (s.stare === 'plin') {
      // ruta cursei nu e încă știută aici; se încearcă satele-nume ale rutelor mașinii
      // la uzina asta și se ia tăietura cea mai mică — apoi, dacă niciuna, oprirea
      const peSat = lista
        .filter((a) => (ctx.uzinaRutei.get(a.factory_route_id) ?? a.direction) === s.uzina_id)
        .map((a) => taiePeSat(s, r.pts, r.calc, satulRutei(a.factory_route_id, s)))
        .filter(Boolean).sort((x, y) => x.livrare - y.livrare)[0];
      const t = peSat ?? taieLivrarea(s, capeteReale(r.stops ?? [], r.pts, s.from, s.to, scurteInSat), r.calc);
      if (t) { contrib.km_plin += t.plin; contrib.km_gol += t.livrare; contrib.km_livrare += t.livrare; }
      else contrib.km_plin += s.km;
    } else if (s.stare === 'gol') {
      contrib.km_gol += s.km;
      contrib.km_gol_acasa += golPrinCasa(s, r.pts, r.calc, bazeP);
    }
    else contrib.km_necunoscut += s.km;
  }
  await supa.from('lde_route_day_contrib').upsert({
    vehicle_id, gps_date: day,
    km_plin: +contrib.km_plin.toFixed(2), km_gol: +contrib.km_gol.toFixed(2),
    km_necunoscut: +contrib.km_necunoscut.toFixed(2),
    km_livrare: +contrib.km_livrare.toFixed(2),
    km_gol_acasa: +contrib.km_gol_acasa.toFixed(2),
    stare: 'ok', motiv: null, updated_at: new Date().toISOString(),
  }, { onConflict: 'vehicle_id,gps_date' });

  if (!tr.length) {
    // n-a mers, GPS-ul a avut gaură, sau mașina a făcut cu totul altceva? Trei motive
    // distincte, nu unul. Ion, 18.09: «dacă a făcut km, trebuia să fie ruta; ori dacă nu
    // a avut opriri conform etalon — să plece la reparații». Prima variantă scria chiar
    // `posibil_service`, dar Ion a cerut să numărăm întâi cazurile, și bine a făcut: pe
    // 17.09 sunt ZERO. Km-ii fără rută sunt ai camioanelor (11 mașini, 1.664 km) și ai
    // autobuzelor de pe rute regulate fără atribuire (12 mașini, 2.662 km) — nu ai
    // reparațiilor. Deci motivul scrie ce s-a văzut, nu de ce: `fara_ruta_pe_urma`.
    // Deci: fără nicio atingere de poartă, se întreabă urma dacă a trecut totuși prin
    // satele rutelor mașinii. Dacă da — a făcut ruta, dar n-a ajuns la poartă (sau poarta
    // n-a fost prinsă). Dacă nu — ziua ei n-are nimic de-a face cu rutele, iar km-ii ei
    // sunt drum la service, nu curse ratate. Amestecate, primele ar părea la fel de rele
    // ca ultimele, iar operatorul ar căuta o problemă acolo unde nu e.
    const acoperire = r.calc.stepAccepted.filter(Boolean).length / r.pts.length;
    const sateZi = new Set(sateDeservite(r.pts, ctx.placesIdx, 0, r.pts.length - 1, PRAG_SAT_KM).map(norm));
    const aleMasinii = new Set();
    for (const a of lista)
      for (const x of ctx.sateEtalon?.get(a.factory_route_id) ?? ctx.sateRuta.get(a.factory_route_id) ?? [])
        aleMasinii.add(x);
    const potrivite = [...aleMasinii].filter((x) => sateZi.has(x)).length;
    const acoperireRuta = aleMasinii.size ? potrivite / aleMasinii.size : 0;
    const motiv = acoperire < 0.8 ? 'gaura_semnal'
      : acoperireRuta < 0.2 ? 'fara_ruta_pe_urma' : 'fara_trecere';
    for (const a of lista) {
      await supa.from('lde_route_run').upsert({
        run_date: day, factory_route_id: a.factory_route_id, shift_number: a.shift_number,
        slot: a.slot ?? 1, sens: a.eRetur ? 'retur' : 'tur', vehicle_id,
        stare: 'necunoscut', ambiguu: true, motiv,
      }, { onConflict: 'run_date,factory_route_id,shift_number,slot,sens' });
    }
    return { curse: 0, motiv };
  }

  // ── de la segmente la CURSE ────────────────────────────────────────────────
  // O cursă are un sens și un singur drum cu pasageri. Ziua unui schimb are patru
  // segmente, nu două, și ele se împerechează câte două:
  //
  //   tur   = apropierea PLINĂ (aduce oamenii) + plecarea GOALĂ de după ea
  //   retur = apropierea GOALĂ (vine să-i ia)  + plecarea PLINĂ cu ei acasă
  //
  // Varianta dinainte scria fiecare segment ca pe o cursă separată, iar cheia cursei
  // are un singur rând pe (zi, rută, schimb, slot, sens): segmentul gol se scria PESTE
  // cel plin. De acolo veneau cele 545 de curse de „tur" marcate `gol` — nu era mașina
  // care mergea goală spre uzină, era drumul plin suprascris de repoziționare. Se vedea
  // și în numere: 366 de segmente scrise, 264 de rânduri rămase.
  let scrise = 0;
  // rândurile se strâng și se scriu la sfârșit: cursele ADM se scot din naveta celorlalte
  const randuri = [];
  // ce rute au primit deja cursă în ziua asta, ca o rută să nu fie scrisă de două ori
  // când se recuperează segmentele unui schimb care nu e în grafic
  const scriseRute = new Set();

  // Cheia e (uzină, schimb), nu doar schimbul: o mașină care lucrează la două uzine are
  // schimbul 1 la amândouă, iar un segment de la poarta Orhei n-are ce căuta pe atribuirea
  // de la Ungheni.
  const peSchimb = new Map();
  for (const a of lista) {
    if (a.shift_number == null) continue;
    const u = ctx.uzinaRutei.get(a.factory_route_id) ?? a.direction;
    const k = `${u}|${a.shift_number}`;
    if (!peSchimb.has(k)) peSchimb.set(k, { uzina: u, shift_number: a.shift_number, lista: [] });
    peSchimb.get(k).lista.push(a);
  }

  // poarta uzinei și baza șoferului nu spun nimic despre cursă: staționarea de la poartă
  // e 17-51 de minute, iar acasă mașina stă ore
  const baze = (r.stops ?? []).filter((st) => st.isBase).map((st) => ({ lat: st.lat, lon: st.lon, raza: 0.5 }));
  // Ziua de LUCRU a mașinii: de la prima până la ultima atingere de poartă. Ce e în afara
  // ei e naveta — mașina trebuie să ajungă de acasă la lucru și înapoi, indiferent cine
  // conduce. Ce e ÎNĂUNTRU și trece pe acasă e plimbarea din pauză, care se evită
  // așteptând. Ion, 18.09: «dacă auto nu are alte ture decât una pe zi și se întoarce
  // înapoi acasă în sat — neglijență, trebuie să aștepte». Fără despărțirea asta, regula
  // prindea și naveta: 293QVT pe 17.09 stă acasă peste noapte, pleacă 70 km la lucru și se
  // întoarce 73 km — n-are ce aștepta, e altă problemă (șofer prea departe).
  const intrePorti = tr.length ? { de: tr[0].iOut, la: tr[tr.length - 1].iIn } : null;
  const golDinPauza = (seg) =>
    intrePorti && seg.from >= intrePorti.de && seg.to <= intrePorti.la
      ? golPrinCasa(seg, r.pts, r.calc, bazeP) : 0;
  const deSarit = (seg) => [...baze, seg.gate ? { lat: +seg.gate.lat, lon: +seg.gate.lon, raza: 1.0 } : null];
  // `locul` / `inSat` sunt definite mai sus, lângă contribuții — aceleași și aici.
  // «a oprit într-un sat AL RUTEI LUI» — regula lui Ion, 18.09. Lista de referință e
  // etalonul rutei (satele ei deduse din cursele neambigue), nu numele scris în grafic:
  // numele are 1-2 sate, etalonul are 13-19.
  // «În satul vreuneia dintre rutele mașinii» — pentru drumul GOL. Ion, 18.09: «dacă au
  // două rute, înseamnă că trebuie să se întoarcă în zonă ca să ridice oamenii de acolo».
  // O mașină cu două rute în același schimb primește cursă doar pentru una; drumul plin al
  // celeilalte e luat drept întoarcerea goală a primei. Dacă pe el sunt opriri în satele
  // ei, drumul n-a fost gol — și nimeni nu are voie să fie acuzat de neglijență.
  const toateSateleMasinii = (() => {
    const t = new Set();
    for (const a of lista)
      for (const x of ctx.sateEtalon?.get(a.factory_route_id) ?? ctx.sateRuta.get(a.factory_route_id) ?? [])
        t.add(x);
    return t;
  })();
  const inSatulMasinii = toateSateleMasinii.size
    ? (p) => { const n = locul(p); return n != null && toateSateleMasinii.has(norm(n)); }
    : null;

  const inSatulRutei = (rid) => {
    const ale = new Set(ctx.sateEtalon?.get(rid) ?? ctx.sateRuta.get(rid) ?? []);
    return ale.size ? (p) => { const n = locul(p); return n != null && ale.has(norm(n)); } : null;
  };

  // Segmentele unui schimb pe care mașina nu-l are în grafic NU se aruncă: ele sunt ale
  // uneia dintre rutele ei, pe care graficul a pus-o în alt schimb. Ion, 18.09: «GPS-ul e
  // faptic, cum a mers; graficul de mână nu». Cazul: Guzun Ivan are rutele 6 și 8, ambele
  // trecute pe schimbul 1; oamenii rutei 8 lucrează însă schimbul 2, iar mașina îi aduce la
  // 15:00. Ceasul citește corect «livrare schimb 2», dar cursa se pierdea, fiindcă în
  // grafic mașina n-avea nimic pe schimbul 2 — și ruta 8 rămânea goală toată ziua.
  const schimburiCuSegmente = [...new Set(segs.filter((x) => x.shift_number != null && x.uzina_id)
    .map((x) => `${x.uzina_id}|${x.shift_number}`))];
  for (const k of schimburiCuSegmente) {
    if (peSchimb.has(k)) continue;
    const [u, shs] = k.split('|');
    const aleUzinei = lista.filter((a) => (ctx.uzinaRutei.get(a.factory_route_id) ?? a.direction) === u);
    if (aleUzinei.length) { peSchimb.set(k, { uzina: u, shift_number: Number(shs), lista: aleUzinei, dinAltSchimb: true }); continue; }
    // UZINA DIN GPS: graficul n-o are deloc, dar mașina i-a atins poarta. Candidații sunt
    // toate rutele acelei uzine care au etalon — ruta se alege după sate, iar cursa se
    // însemnează `uzina_din_gps`, ca să se vadă că graficul a fost contrazis la uzină.
    const candidati = (ctx.ruteUzinei.get(u) ?? [])
      .filter((rid) => (ctx.sateEtalon?.get(rid) ?? []).length > 0)
      .map((rid) => ({ factory_route_id: rid, shift_number: Number(shs), slot: 1, eRetur: false, direction: u }));
    if (candidati.length) peSchimb.set(k, { uzina: u, shift_number: Number(shs), lista: candidati, dinAltSchimb: true, dinAltaUzina: true });
  }

  for (const { uzina, shift_number: sh, lista: candidati, dinAltSchimb, dinAltaUzina } of peSchimb.values()) {
    // TOATE segmentele schimbului, nu primul din fiecare fel. O mașină cu două rute în
    // același schimb face DOUĂ strângeri și două aduceri; varianta dinainte lua `find`,
    // deci scria o singură cursă de tur și una de retur pe schimb, oricâte rute ar fi
    // avut. A doua rută nu primea nimic — iar fără curse nu-și face etalon, deci nu putea
    // fi recunoscută nici mai târziu, la potrivirea pe sate. Capcană închisă.
    // Verificat pe Orhei/17.09: 823MUM (Dulghieri Andrei) face șase drumuri
    // Slobozia Doamnei ↔ Bucuria, toate scrise pe ruta 11; ruta 8, a lui, a rămas goală.
    const aleSchimbului = (tip, stare) =>
      segs.filter((x) => x.shift_number === sh && x.uzina_id === uzina
        && x.tip === tip && x.stare === stare && x.km >= 1)
        .sort((x, y) => x.from - y.from);

    const perechi = [];
    for (const [sens, pline, goale] of [
      ['tur', aleSchimbului('apropiere', 'plin'), aleSchimbului('plecare', 'gol')],
      ['retur', aleSchimbului('plecare', 'plin'), aleSchimbului('apropiere', 'gol')],
    ]) pline.forEach((p, i) => perechi.push([sens, p, goale[i] ?? null]));

    // o rută primește o singură cursă pe sens în schimbul ăsta: două drumuri ale aceleiași
    // mașini sunt ale unor rute diferite, nu aceeași cursă scrisă de două ori
    const luate = new Set();

    for (const [sens, plin, gol] of perechi) {
      if (!plin) continue;                       // fără drumul cu pasageri nu există cursă
      // satele DRUMULUI ÎNTREG, pentru «a cui e cursa»; satele cursei se iau după tăietură
      const sate = sateDeservite(r.pts, ctx.placesIdx, plin.from, plin.to, PRAG_SAT_KM);
      const vazute = new Set(sate.map(norm));

      // A CUI e cursa, când mașina are două rute în același schimb (22 din 169 de
      // perechi mașină×schimb pe 16.09). Întrebarea se pune pe SATE, nu se ocolește:
      // 302YEK avea rutele 14 și 32; urma ei trece prin toate cele șase sate ale rutei
      // 14 și prin niciunul dintre cele opt ale rutei 32. Marcând totul `ambiguu`,
      // rutele Draxelmaier rămâneau fără etalon deși dovada era în date.
      // Rămâne `ambiguu` doar când dovada chiar lipsește: nicio potrivire, sau două
      // rute la fel de bune.
      const potrivire = (rid) => {
        // întâi etalonul rutei (13-19 sate), apoi numele ei (2-9) dacă n-are încă etalon
        const ref = ctx.sateEtalon?.get(rid) ?? ctx.sateRuta.get(rid) ?? [];
        if (!ref.length) return 0;
        return ref.filter((x) => vazute.has(x)).length / ref.length;
      };
      const eligibili = candidati.filter((x) => (sens === 'tur' ? !x.eRetur : true))
        .filter((x) => !luate.has(`${sens}|${x.factory_route_id}`))
        // pe un schimb pe care graficul nu-l are, se iau doar rutele rămase fără cursă în
        // ziua asta — altfel o rută deja scrisă ar primi o a doua cursă pe același sens
        .filter((x) => !dinAltSchimb || !scriseRute.has(`${sens}|${x.factory_route_id}`));
      if (!eligibili.length) continue;
      const cuScor = eligibili
        .map((x) => ({ a: x, scor: potrivire(x.factory_route_id) }))
        .sort((p, q) => q.scor - p.scor);
      let a = cuScor[0].a;
      const alDoilea = cuScor.find((x) => x.a.factory_route_id !== a.factory_route_id);
      // `ambiguu` înseamnă «nu se poate spune A CUI e cursa». Dacă mașina are o SINGURĂ
      // rută în schimbul ăsta, n-are cu cine s-o confunzi — chiar dacă satele nu se
      // potrivesc cu numele scris în grafic. La Ungheni asta ținea uzina blocată: numele
      // rutelor sunt stații de autobuz, nu sate (26 din 109), deci potrivirea dădea zero,
      // cursa ieșea ambiguă, ambiguele nu intră în etalon, iar fără etalon potrivirea
      // rămânea zero. Cerc închis, 24 de curse din 40 pe 17.09.
      // Nepotrivirea rămâne însemnată în `motiv` — e o constatare despre grafic, nu un
      // motiv să arunci cursa.
      const concurenta = new Set(eligibili.map((x) => x.factory_route_id)).size > 1;
      let ambiguu = concurenta
        && (cuScor[0].scor < 0.34 || (alDoilea != null && alDoilea.scor >= cuScor[0].scor - 0.1));
      // la o uzină pe care graficul n-o are, ruta trebuie DOVEDITĂ pe sate — n-avem alt
      // reper; sub 50% potrivire cursa rămâne ambiguă, nu se inventează o rută
      if (dinAltaUzina && cuScor[0].scor < 0.5) ambiguu = true;
      let nepotrivit = cuScor[0].scor < 0.34;
      let motivGrafic = dinAltaUzina ? 'uzina_din_gps' : null;

      // GPS-UL BATE GRAFICUL. Ion, 18.09: «GPS-ul e faptic, cum a mers; graficul de mână nu».
      // Până aici căutam ruta doar printre cele scrise în grafic pentru mașina asta. Dacă
      // graficul greșește ruta, cursa se scria pe ruta greșită — cu km reali și abatere
      // fabricată, adică exact minciuna pe care funcția asta trebuie s-o prindă.
      // Acum se caută și printre TOATE rutele uzinei, iar graficul e depășit doar când
      // dovada e clară: potrivire de cel puțin 60% și cu 20 de puncte peste tot ce zice
      // graficul. Altfel rămâne ce scrie omul — o bănuială slabă nu răstoarnă un document.
      // Graficul poate fi contrazis DOAR dacă ruta pe care o scrie are ea însăși etalon:
      // altfel n-avem cu ce compara, iar o rută fără etalon ar pierde mereu în fața uneia
      // învățate — și n-ar căpăta niciodată curse din care să-și facă unul. Cazul real:
      // 034BRAT, ruta 3 Orhei (fără etalon), i s-a luat cursa de ruta 14.
      // VEROSIMILITATE PE KM, nu doar pe sate. Ruta 11 e orașul Orhei (Nordic, Bucuria,
      // Centru…), prin care trece ORICE cursă a uzinei — deci orice drum care nu-și
      // potrivea ruta din grafic „devenea" ruta 11: Lopatenco, 09.09, 64 km scriși pe o
      // rută de 14; Vartic, drumul de 2,8 km de la poartă până acasă, scris drept returul
      // rutei 11. Se acceptă doar o rută al cărei km etalon, pe schimbul și sensul ăsta,
      // e de același ordin cu drumul măsurat: între jumătate și 1,6×. Fără km etalon nu
      // se poate judeca — deci nu se suprascrie, rămâne ce scrie graficul, cu `nepotrivit`.
      // Se compară DRUMUL ÎNTREG cu km-ul etalon al candidatei, nu drumul tăiat la satul
      // candidatei: ruta 2 «Cișmea» are 9 km și Cișmea e la marginea Orheiului, deci orice
      // drum lung tăiat la Cișmea „avea" 9 km și devenea ruta 2 — Sochircă, de la Florești,
      // ajungea pe ea. Drumul întreg e mai lung decât ruta, de aceea marja de sus e largă.
      const kmPlin = plin.km;
      const verosimil = (rid) => {
        const ref = ctx.kmEtalon?.get(rid)?.get(`${sh}|${sens}`);
        return ref != null && kmPlin >= 0.5 * ref && kmPlin <= 1.6 * ref;
      };
      const areEtalon = (ctx.sateEtalon?.get(cuScor[0].a.factory_route_id) ?? []).length > 0;
      if (areEtalon && cuScor[0].scor < 0.6) {
        let best = null;
        for (const rid of ctx.ruteUzinei.get(uzina) ?? []) {
          if (eligibili.some((x) => x.factory_route_id === rid)) continue;
          if (!verosimil(rid)) continue;
          const sc = potrivire(rid);
          if (!best || sc > best.scor) best = { rid, scor: sc };
        }
        if (best && best.scor >= 0.6 && best.scor >= cuScor[0].scor + 0.2) {
          a = { ...a, factory_route_id: best.rid };
          ambiguu = false;
          motivGrafic = 'ruta_din_gps';
        }
      }

      // Tăietura livrării, pe ruta DECISĂ: întâi la satul care-i dă numele, altfel la oprire.
      // Satele, capetele și geometria cursei se iau din bucata rămasă — altfel etalonul
      // ar începe acasă la șofer (Popescu: «Începe: Chiperceni», care e casa lui).
      const satA = satulRutei(a.factory_route_id, plin);
      let taiat = taiePeSat(plin, r.pts, r.calc, satA);
      // Satul-nume e cunoscut, dar drumul „plin" nu intră deloc în el: n-a fost cursa rutei.
      // Vartic, 15.09: după tura de noapte pleacă de la poartă la ora „ridicării" și face 46
      // km la Chișinău — ceasul zicea plin, iar fără tăietură tot drumul se scria ca retur
      // pe ruta 20. Acum: 0 km pe rută, iar drumul întreg e al șoferului (navetă/brambura).
      // Doar când satul-nume nu e pe hartă se mai cade pe tăietura la oprire.
      const ocolita = !taiat && satA != null;
      if (!taiat && !satA) taiat = taieLivrarea(plin, capeteReale(r.stops ?? [], r.pts, plin.from, plin.to, scurteInSat), r.calc);
      if (ocolita) taiat = { livrare: plin.km, plin: 0, from: plin.from, to: plin.from, sursa: 'ocolit' };
      const cut = taiat ? { from: taiat.from, to: taiat.to } : { from: plin.from, to: plin.to };
      // Km-ii ȘOFERULUI = tot ce e în afara rutei, și pe drumul plin, și pe cel gol
      // (dincolo de satul de start). Ion, 19.09: naveta e livrare; brambura e «ceva ieșit
      // din comun, unic» — deci NU se desparte geometric aici (drumul lui Vartic la
      // Chișinău trece pe lângă casa lui din Orhei, iar naveta lui Popescu trece prin
      // Orhei, departe și de casă, și de rută: geometria le-ar încurca). Brambura o pune
      // agregatorul, ca EXCES față de zilele obișnuite ale aceleiași mașini.
      const golImpartit = gol ? imparteLaSat(gol, r.pts, r.calc, satulRutei(a.factory_route_id, gol)) : null;
      const kmGolRuta = golImpartit?.inauntru ?? 0;
      const kmLivrare = (taiat ? taiat.livrare : 0) + (gol ? Math.max(0, gol.km - kmGolRuta) : 0);
      const capete = capeteReale(r.stops ?? [], r.pts, cut.from, cut.to, scurteInSat);
      const sateCursa = ocolita ? [] : sateDeservite(r.pts, ctx.placesIdx, cut.from, cut.to, PRAG_SAT_KM);
      const ale = ctx.sateRuta.get(a.factory_route_id) ?? [];
      // bucățile din AFARA rutei (naveta), ca intervale de puncte — cursele ADM se scad din ele
      const afara = [];
      if (ocolita) afara.push([plin.from, plin.to]);
      else if (taiat) afara.push(plin.tip === 'apropiere' ? [plin.from, cut.from] : [cut.to, plin.to]);
      if (gol) afara.push(golImpartit ? (gol.tip === 'apropiere' ? [gol.from, golImpartit.from] : [golImpartit.to, gol.to]) : [gol.from, gol.to]);
      randuri.push({
        _afara: afara, _cut: ocolita ? null : cut,
        run_date: day, factory_route_id: a.factory_route_id, shift_number: sh,
        slot: a.slot ?? 1, sens, vehicle_id,
        // Satele lipsă/în plus NU se scriu aici: worker-ul n-are cu ce compara. Numele
        // rutei are 1-2 sate, drumul real are 13-19 (Ion, 17.09), deci comparat cu numele
        // aproape tot ieșea „în plus". Le umple agregatorul, față de ETALON, după ce
        // etalonul există.
        sate_atinse: sateCursa, sate_lipsa: [], sate_extra: [],
        // satele în care a OPRIT pe drumul plin ÎNTREG (nu doar pe bucata tăiată), în ordine
        // — din ele agregatorul deduce satul de start real (migr. 380)
        sate_oprire: (() => {
          const out = [];
          for (const p of scurteInSat) {
            if (p.i < plin.from || p.i > plin.to || !p.locality) continue;
            if (out[out.length - 1] !== p.locality) out.push(p.locality);
          }
          return out;
        })(),
        km_real: taiat ? taiat.plin : plin.km,
        km_goi: gol ? gol.km : 0,
        km_livrare: +kmLivrare.toFixed(2),
        km_brambura: 0,                          // o scrie agregatorul, ca exces față de zilele obișnuite
        km_gol_acasa: gol ? golPrinCasa(gol, r.pts, r.calc, bazeP) : 0,
        km_gol_pauza: gol ? golDinPauza(gol) : 0,
        km_gol_ruta: +kmGolRuta.toFixed(2),
        // prin câte sate ale rutelor mașinii a trecut drumul „gol" — adnotarea scrisă de
        // operațional pe hârtie («sate 2», «sate 4») e exact cifra asta
        sate_gol_pe_traseu: gol
          ? sateDeservite(r.pts, ctx.placesIdx, gol.from, gol.to, PRAG_SAT_KM)
              .filter((x) => toateSateleMasinii.has(norm(x))).length
          : null,
        opriri_gol_pe_traseu: gol && inSatulMasinii
          ? opririScurte(r.pts, gol.from, gol.to, { exclude: deSarit(gol), inSat: inSatulMasinii })
          : null,
        opriri_plin: opririScurte(r.pts, cut.from, cut.to, { exclude: deSarit(plin), inSat }),
        opriri_pe_traseu: (() => {
          const f = inSatulRutei(a.factory_route_id);
          return f ? opririScurte(r.pts, cut.from, cut.to, { exclude: deSarit(plin), inSat: f }) : null;
        })(),
        opriri_gol: gol ? opririScurte(r.pts, gol.from, gol.to, { exclude: deSarit(gol), inSat }) : null,
        prima_statie: capete.prima, ultima_statie: capete.ultima,
        stare: 'plin', ambiguu,
        motiv: (ocolita ? 'ruta_neatinsa' : null) ?? motivGrafic
          ?? (ambiguu ? (nepotrivit ? 'sate_nepotrivite' : 'doua_rute_la_fel')
            : (nepotrivit ? 'sate_nepotrivite' : null)),
        geom: ocolita ? null : simplifica(r.pts, r.calc, cut.from, cut.to),
      });
      luate.add(`${sens}|${a.factory_route_id}`);
      scriseRute.add(`${sens}|${a.factory_route_id}`);
      scrise++;
    }
  }

  // ── RUTELE ADM: pe orar de birou, nu pe schimburi ──────────────────────────
  // Ion, 19.09: «dacă se întâmplă sistematic, zilnic — e rută». Vartic are ruta 24
  // «Chișinău (ADM)» în grafic aproape zilnic și oprește în Chișinău la 18:30 în 10 zile
  // din 13; Scurtu are 23 «Bălți (ADM)». O vizită = intrare în raza orașului din nume cu o
  // staționare de ≥2 minute înăuntru. Cursa = drumul dintre vizită și cea mai apropiată
  // ANCORĂ: o atingere de poartă, capătul bucății de rută a unei curse deja scrise, sau o
  // staționare de ≥30 min (casa). Dus spre oraș = retur, întors = tur. Km-ii ăștia ies
  // din naveta curselor peste care se suprapun — nu se numără de două ori.
  const R_ADM_KM = 8, POPAS_ADM_S = 120, ANCORA_PAUZA_S = 1800;
  if (listaAdm.length) {
    const ancore = new Set([...tr.map((t) => t.iIn), ...tr.map((t) => t.iOut)]);
    for (const x of randuri) if (x._cut) { ancore.add(x._cut.from); ancore.add(x._cut.to); }
    for (const p of popasuri(r.pts, 0, r.pts.length - 1, { pragS: ANCORA_PAUZA_S })) { ancore.add(p.from); ancore.add(p.to); }
    const ordonate = [...ancore].sort((p, q) => p - q);
    for (const a of listaAdm) {
      const oras = loculNumit((ctx.sateRuta.get(a.factory_route_id) ?? [])[0], null);
      if (!oras) continue;
      const vizite = [];
      let cur = null;
      for (let i = 0; i < r.pts.length; i++) {
        if (hav(r.pts[i], oras) <= R_ADM_KM) { if (!cur) cur = { de: i, la: i }; else cur.la = i; }
        else if (cur) { vizite.push(cur); cur = null; }
      }
      if (cur) vizite.push(cur);
      const unite = [];
      for (const v of vizite) {
        const u = unite[unite.length - 1];
        if (u && (r.pts[v.de].t - r.pts[u.la].t) < 30 * 60000) u.la = v.la; else unite.push({ ...v });
      }
      for (const v of unite) {
        if (!popasuri(r.pts, v.de, v.la, { pragS: POPAS_ADM_S }).length) continue;   // trecere, nu vizită
        const inainte = ordonate.filter((k) => k < v.de).pop();
        const dupa = ordonate.find((k) => k > v.la);
        for (const [sens, de, la] of [['retur', inainte, v.de], ['tur', v.la, dupa]]) {
          if (de == null || la == null || la <= de) continue;
          const km = kmInterval(r.calc.stepKm, de, la);
          if (km < 3) continue;
          if (randuri.some((x) => x.factory_route_id === a.factory_route_id && x.sens === sens)) continue;
          randuri.push({
            _afara: [], _cut: null, _adm: [de, la],
            run_date: day, factory_route_id: a.factory_route_id, shift_number: a.shift_number ?? 1,
            slot: a.slot ?? 1, sens, vehicle_id,
            sate_atinse: sateDeservite(r.pts, ctx.placesIdx, de, la, PRAG_SAT_KM), sate_lipsa: [], sate_extra: [], sate_oprire: [],
            km_real: +km.toFixed(2), km_goi: 0, km_livrare: 0, km_brambura: 0, km_gol_acasa: 0, km_gol_pauza: 0, km_gol_ruta: 0,
            sate_gol_pe_traseu: null, opriri_gol_pe_traseu: null,
            opriri_plin: opririScurte(r.pts, de, la, { exclude: baze, inSat }), opriri_pe_traseu: null, opriri_gol: null,
            prima_statie: null, ultima_statie: null, stare: 'plin', ambiguu: false, motiv: 'adm',
            geom: simplifica(r.pts, r.calc, de, la),
          });
          scrise++;
        }
      }
    }
    const legAdm = randuri.filter((x) => x._adm).map((x) => x._adm);
    for (const x of randuri) {
      if (!x._afara?.length || !legAdm.length) continue;
      let scad = 0;
      for (const [a1, b1] of x._afara)
        for (const [a2, b2] of legAdm) { const de = Math.max(a1, a2), la = Math.min(b1, b2); if (la > de) scad += kmInterval(r.calc.stepKm, de, la); }
      if (scad > 0) x.km_livrare = +Math.max(0, x.km_livrare - scad).toFixed(2);
    }
  }
  for (const x of randuri) {
    const { _afara, _cut, _adm, ...row } = x;
    await supa.from('lde_route_run').upsert(row, { onConflict: 'run_date,factory_route_id,shift_number,slot,sens' });
  }
  return { curse: scrise, treceri: tr.length };
}

/** Rândul de statut când etichetarea a crăpat — „lipsă" și „eșec" nu arată la fel. */
export async function scrieEsec(supa, vehicle_id, day, motiv) {
  await supa.from('lde_route_day_contrib').upsert({
    vehicle_id, gps_date: day, km_plin: 0, km_gol: 0, km_necunoscut: 0,
    stare: 'esuat', motiv: String(motiv).slice(0, 300), updated_at: new Date().toISOString(),
  }, { onConflict: 'vehicle_id,gps_date' });
}
