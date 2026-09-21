// ============================================================================
// LIVRAREA (подача) PE CURSELE INTERURBANE — analiză, ION-22.
//
// Ion, 21.09.2026: «fa o analiza la livrari pe cursele interurbane, tu cunosti detailat
// traseul, vezi cat in fiecare zi se face pe livrari, inca un moment daca soferul nu
// pleaca la capat de ruta seara iar pleaca acolo dimineata - nu e livrare».
//
//   node --env-file=apps/admin/.env scripts/livrare-interurban.mjs [--de=2026-09-01] [--pana=2026-09-19] [--csv=out.csv] [--zi=…] [--ruta=N]
//
// IDEEA. O rută interurbană e o LINIE cu kilometraj propriu: `interurban_v2_stops` dă
// fiecărei stații `km_from_start`, de la capătul de nord (0) până la Chișinău (242–302).
// Autobuzul doarme acasă la șofer, adică într-un punct B de pe linia asta (sau lângă ea).
// Ziua lui, citită din `lde_gps_stops`, e o coborâre spre capăt, un urcuș până la Chișinău
// și o coborâre înapoi. Golul e la capete:
//
//   · livrarea de dimineață = B → punctul de unde începe efectiv cursa (sub B)
//   · livrarea de seară     = ultimul punct servit → B (urcuș gol, după ce a lăsat lumea)
//
// Km-ii sunt MĂSURAȚI pe drum (`km_from_prev`, scris de gps-worker din urma GPS), nu în
// linie dreaptă. Drumul de dimineață, care trece peste miezul nopții, nu are `km_from_prev`;
// el se ia ca `lde_vehicle_gps_daily.km_total − Σ km_from_prev` al zilei.
//
// Dacă mașina coboară sub bază fără să se oprească (trece prin sat, ia oamenii și se
// întoarce), punctul de întoarcere T nu e o oprire. Se află din aritmetica liniei:
// M = (B − T) + (F − T) ⇒ T = (B + F − M) / 2, unde F e prima oprire înregistrată.
// Proba: 652AKD, 17.09 — B = Colicăuți 47,6 · F = Briceni 44,5 · M = 17,1 ⇒ T = 37,5,
// adică exact Caracușenii Noi, stația de pe listă.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { hav } from '../lde-geo-worker/km-core.mjs';

const arg = (n, d = null) => (process.argv.find((a) => a.startsWith(`${n}=`)) ?? '').split('=')[1] ?? d;
const DE = arg('--de', '2026-09-01');
const PANA = arg('--pana', '2026-09-19');
const CSV = arg('--csv', null);
const DOAR_ZI = arg('--zi', null);
const DOAR_RUTA = arg('--ruta', null);
const DETALIU = process.argv.includes('--detaliu');

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// PostgREST taie tăcut la 1000 de rânduri (vezi etalon-aggregate.mjs).
async function fetchAll(table, select, aplica = (q) => q) {
  const out = []; const pas = 1000;
  for (let de = 0; ; de += pas) {
    const { data, error } = await aplica(supa.from(table).select(select)).range(de, de + pas - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < pas) break;
  }
  return out;
}

// ── normalizare de nume (diacritice, «Ș»/«Ş», spații) ────────────────────────
const norm = (s) => (s ?? '').toString().toLowerCase()
  .replace(/ș|ş/g, 's').replace(/ț|ţ/g, 't').replace(/ă/g, 'a').replace(/â|î/g, 'i')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const CHISINAU = { lat: 47.0245, lon: 28.8322 };
const RAZA_CAPITALA_KM = 25;       // orice oprire mai aproape de atât e „în capitală"
const RAZA_STATIE_KM = 5;          // cât de aproape trebuie să fie o oprire de o stație ca să-i ia km-ul
const RAZA_BAZA_KM = 12;           // la capetele zilei (unde doarme mașina) raza e mai largă
const TOL_CAPAT_KM = 2;            // cât se iartă la «a fost la capătul rutei»
const TOL_INTOARCERE_KM = 2;       // sub atât, drumul de dimineață e drept, fără coborâre ascunsă
const REPARATIE_DAF = 1.5, REPARATIE = 1.0, SALARIU = 1.0, NORMA_IMPLICITA = 12.5;  // ION-19

const zileIntre = (a, b) => { const o = []; for (let d = new Date(`${a}T00:00:00Z`); d <= new Date(`${b}T00:00:00Z`); d = new Date(+d + 86400000)) o.push(d.toISOString().slice(0, 10)); return o; };
const ziAnterioara = (z) => new Date(+new Date(`${z}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const nr = (v) => (v == null ? 0 : Number(v) || 0);
const r1 = (v) => Math.round(v * 10) / 10;

async function main() {
  const zile = zileIntre(DE, PANA);
  const deCitit = [ziAnterioara(DE), ...zile];

  // ── 1. rutele interurbane și traseul lor detaliat ──────────────────────────
  const rute = await fetchAll('crm_routes', 'id,dest_from_ro,dest_to_ro,time_nord,time_chisinau,tariff_id_tur,route_type,active',
    (q) => q.eq('route_type', 'interurban').eq('active', true));
  const tarife = await fetchAll('interurban_v2_tariffs', 'id,name,tariff_tur_id,tariff_retur_id,total_km');
  const statii = await fetchAll('interurban_v2_stops', 'tariff_id,branch,stop_order,name_ro,km_from_start');

  // ── 2. atribuirile, mașinile, oamenii ──────────────────────────────────────
  const atrib = await fetchAll('daily_assignments', 'assignment_date,crm_route_id,vehicle_id,driver_id',
    (q) => q.gte('assignment_date', DE).lte('assignment_date', PANA));
  const masini = new Map((await fetchAll('vehicles', 'id,plate_number')).map((v) => [v.id, v.plate_number]));
  const soferi = new Map((await fetchAll('drivers', 'id,full_name')).map((d) => [d.id, d.full_name]));

  const idRuta = new Set(rute.map((r) => r.id));
  const atribuiri = atrib.filter((a) => idRuta.has(a.crm_route_id) && a.vehicle_id);
  // Aceeași mașină poate avea în ziua aia ȘI o rută suburbană (263NSX: ruta 29 Ocnița și
  // ruta 51 Trebisăuți–Briceni). Atunci drumul „gol" de dimineață e de fapt cursa cealaltă,
  // deci ziua se marchează și nu intră în cifra livrării.
  const alteRute = new Map();
  for (const a of atrib) {
    if (!a.vehicle_id) continue;
    const k = `${a.vehicle_id}|${a.assignment_date}`;
    if (!alteRute.has(k)) alteRute.set(k, new Set());
    alteRute.get(k).add(a.crm_route_id);
  }
  const vehicule = [...new Set(atribuiri.map((a) => a.vehicle_id))];

  // ── 3. GPS: lanțul de opriri și km-ii zilei ────────────────────────────────
  const opriri = [];
  for (let i = 0; i < vehicule.length; i += 20) {
    const felie = vehicule.slice(i, i + 20);
    opriri.push(...await fetchAll('lde_gps_stops', 'vehicle_id,date,seq,locality,lat,lon,arrival_at,departure_at,dwell_min,km_from_prev',
      (q) => q.in('vehicle_id', felie).gte('date', deCitit[0]).lte('date', PANA).order('vehicle_id').order('date').order('seq')));
  }
  const kmZi = new Map();
  for (let i = 0; i < vehicule.length; i += 20) {
    const felie = vehicule.slice(i, i + 20);
    for (const d of await fetchAll('lde_vehicle_gps_daily', 'vehicle_id,date,km_total,km_patched',
      (q) => q.in('vehicle_id', felie).gte('date', deCitit[0]).lte('date', PANA))) kmZi.set(`${d.vehicle_id}|${d.date}`, { km: nr(d.km_total), patched: nr(d.km_patched) });
  }

  // ── 4. gazeteer: numele stației → coordonate, din opririle ÎNTREGII flote ──
  // Nu doar ale autobuzelor noastre: ele opresc la Bălți în punctul numit «Autogara», așa
  // că «Bălți» n-ar avea coordonate și tot drumul de retur ar ieși în afara traseului.
  const puncteBrute = await fetchAll('lde_gps_stops', 'locality,lat,lon',
    (q) => q.gte('date', deCitit[0]).lte('date', PANA).not('locality', 'is', null));
  const puncte = new Map();
  for (const o of puncteBrute) {
    if (!o.locality || o.lat == null) continue;
    const k = norm(o.locality);
    const p = puncte.get(k) ?? { lat: 0, lon: 0, n: 0 };
    p.lat += +o.lat; p.lon += +o.lon; p.n++;
    puncte.set(k, p);
  }
  const coord = (nume) => { const p = puncte.get(norm(nume)); return p ? { lat: p.lat / p.n, lon: p.lon / p.n } : null; };

  // ── 5. linia fiecărei rute: stațiile cu km și coordonate ──────────────────
  const tarifDupaTur = new Map(tarife.map((t) => [t.tariff_tur_id, t]));
  const statiiDupaTarif = new Map();
  for (const s of statii) {
    const k = `${s.tariff_id}|${s.branch}`;
    if (!statiiDupaTarif.has(k)) statiiDupaTarif.set(k, []);
    statiiDupaTarif.get(k).push(s);
  }
  /** «Criva (Larga) - Chișinău» → «Criva»; ruta scrisă din Chișinău → capătul e destinația. */
  const numeleCapatului = (r) => {
    const stanga = (r.dest_from_ro ?? '').split(' - ')[0].trim();
    const brut = /chi[sș]in[aă]u/i.test(stanga) ? (r.dest_to_ro ?? '').split(' - ')[0].trim() : stanga;
    return brut.replace(/\s*\(.*$/, '').trim();
  };
  const linii = new Map();     // crm_route_id → { statii:[{nume,km,lat,lon}], capat, capatKm, totalKm, tarif }
  for (const r of rute) {
    const t = tarifDupaTur.get(r.tariff_id_tur);
    if (!t) { console.warn(`ruta ${r.id}: tarif ${r.tariff_id_tur} necunoscut în interurban_v2_tariffs`); continue; }
    const capat = numeleCapatului(r);
    // ramura potrivită = cea care conține capătul rutei; altfel «main»
    const ramuri = [...statiiDupaTarif.keys()].filter((k) => k.startsWith(`${t.id}|`));
    const cuCapat = ramuri.filter((k) => statiiDupaTarif.get(k).some((s) => norm(s.name_ro) === norm(capat)));
    const cheie = (cuCapat.find((k) => k.endsWith('|main')) ?? cuCapat[0] ?? ramuri.find((k) => k.endsWith('|main')) ?? ramuri[0]);
    const lista = (statiiDupaTarif.get(cheie) ?? []).slice().sort((a, b) => a.stop_order - b.stop_order);
    const cuCoord = lista.map((s) => ({ nume: s.name_ro, km: nr(s.km_from_start), ...(coord(s.name_ro) ?? {}) })).filter((s) => s.lat != null);
    const capatSt = lista.find((s) => norm(s.name_ro) === norm(capat));
    linii.set(r.id, {
      ruta: r, tarif: t, ramura: cheie, statii: cuCoord, capat,
      capatKm: capatSt ? nr(capatSt.km_from_start) : null,
      totalKm: Math.max(...lista.map((s) => nr(s.km_from_start))),
    });
  }

  // ── 6. costul unui km (ION-19) ────────────────────────────────────────────
  const norme = new Map();
  for (const n of await fetchAll('lde_vehicle_norms', 'vehicle_id,vehicle_type_id')) norme.set(n.vehicle_id, n.vehicle_type_id);
  const tipuri = new Map((await fetchAll('lde_vehicle_types', 'id,display_name,category,norm_l_per_100km')).map((t) => [t.id, t]));
  const preturi = (await fetchAll('lde_diesel_price', 'valid_from,price_lei')).sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const pretZi = (zi) => { let p = null; for (const x of preturi) { if (x.valid_from <= zi) p = nr(x.price_lei); } return p ?? nr(preturi.at(-1)?.price_lei); };
  const leiPeKm = (vehicle_id, zi) => {
    const t = tipuri.get(norme.get(vehicle_id));
    const litri = t ? nr(t.norm_l_per_100km) : NORMA_IMPLICITA;
    const rep = t && /daf|autobuz_mare/i.test(`${t.display_name} ${t.category}`) ? REPARATIE_DAF : REPARATIE;
    return (litri / 100) * pretZi(zi) + rep + SALARIU;
  };

  // ── 7. ziua fiecărei mașini ───────────────────────────────────────────────
  const peVehiculZi = new Map();
  for (const o of opriri) {
    const k = `${o.vehicle_id}|${o.date}`;
    if (!peVehiculZi.has(k)) peVehiculZi.set(k, []);
    peVehiculZi.get(k).push(o);
  }
  for (const v of peVehiculZi.values()) v.sort((a, b) => a.seq - b.seq);

  const randuri = [];
  for (const a of atribuiri) {
    if (DOAR_ZI && a.assignment_date !== DOAR_ZI) continue;
    if (DOAR_RUTA && String(a.crm_route_id) !== String(DOAR_RUTA)) continue;
    const L = linii.get(a.crm_route_id);
    if (!L) continue;
    const stops = peVehiculZi.get(`${a.vehicle_id}|${a.assignment_date}`) ?? [];
    const rand = {
      zi: a.assignment_date, ruta: a.crm_route_id, capat: L.capat, capatKm: L.capatKm, totalKm: L.totalKm,
      tarif: `${L.tarif.name}/${L.ramura.split('|')[1]}`,
      masina: masini.get(a.vehicle_id) ?? '?', sofer: soferi.get(a.driver_id) ?? '—', vehicle_id: a.vehicle_id,
      kmGps: (kmZi.get(`${a.vehicle_id}|${a.assignment_date}`) ?? {}).km ?? null,
      kmCarpit: (kmZi.get(`${a.vehicle_id}|${a.assignment_date}`) ?? {}).patched ?? 0,
      opriri: stops.length, motiv: null,
      alteRute: [...(alteRute.get(`${a.vehicle_id}|${a.assignment_date}`) ?? [])].filter((x) => x !== a.crm_route_id).join('+') || '',
    };
    if (!stops.length || rand.kmGps == null) { rand.motiv = 'fără GPS'; randuri.push(rand); continue; }

    // nodurile zilei: baza (unde a dormit) + opririle, fiecare cu km-ul drumului până la el
    //
    // Drumul de dimineață nu are `km_from_prev` (prima oprire a zilei n-are „precedentă"):
    // se ia ca rest, km_total − Σ. Din rest se scot ÎNTÂI km-ii cârpiți (`km_patched`), care
    // nu intră în tronsoane: la 805BXI, 17.09, restul era 39,7 km cu mașina parcată toată
    // noaptea acasă — exact cei 39,4 km de cârpeală. La 652AKD restul de 17,1 devine 13,4,
    // iar punctul de întoarcere iese la km 39,4 — adică Grimăncăuți (40,0), capătul rutei.
    const ieri = peVehiculZi.get(`${a.vehicle_id}|${ziAnterioara(a.assignment_date)}`) ?? [];
    const baza = ieri.at(-1) ?? null;
    const kmIntra = stops.reduce((s, o) => s + nr(o.km_from_prev), 0);
    const kmNoapte = Math.max(0, (rand.kmGps ?? 0) - rand.kmCarpit - kmIntra);
    const noduri = [];
    if (baza) noduri.push({ o: baza, km: 0, baza: true });
    stops.forEach((o, i) => noduri.push({ o, km: i === 0 ? (baza ? kmNoapte : 0) : nr(o.km_from_prev), baza: false }));
    if (!baza) noduri[0].baza = true;

    // poziția pe linia rutei + capitala
    // Raza mică (5 km) pe traseu — altfel o oprire de la marginea drumului se lipește de o
    // stație greșită și strică minimul. La CAPETELE zilei (unde doarme mașina) raza e mai
    // largă: satul șoferului poate fi la 9 km de linie (Clocușna, la 8,9 km de Ocnița), iar
    // fără poziție tot drumul de retur ar ieși gol.
    const pozitia = (o, raza) => {
      let best = null, bd = Infinity;
      for (const s of L.statii) { const d = hav({ lat: +o.lat, lon: +o.lon }, { lat: s.lat, lon: s.lon }); if (d < bd) { bd = d; best = s; } }
      return bd <= raza ? { km: best.km, nume: best.nume, d: bd } : { departe: best, d: bd };
    };
    for (const [i, n] of noduri.entries()) {
      const capAlZilei = i <= 1 || i >= noduri.length - 1;
      const q = pozitia(n.o, capAlZilei ? RAZA_BAZA_KM : RAZA_STATIE_KM);
      n.p = q && q.nume ? q : null; n.aproape = q;
      n.capitala = hav({ lat: +n.o.lat, lon: +n.o.lon }, CHISINAU) <= RAZA_CAPITALA_KM;
    }
    // ── forma zilei ───────────────────────────────────────────────────────
    // Ziua obișnuită: mașina doarme în nord, urcă la Chișinău, se întoarce. Șase rute
    // (10, 11, 12, 14, 15, 58) o fac invers: dorm în Chișinău și capătul de nord e
    // punctul cel mai depărtat al zilei. Ca să nu scriu logica de două ori, pozițiile se
    // măsoară pe o axă `u` care CREȘTE spre punctul depărtat: u = ±km_from_start.
    const bazaInCapitala = noduri[0].capitala;
    const s = bazaInCapitala ? -1 : +1;
    const u = (n) => (n.p ? s * n.p.km : null);
    const cuPoz = noduri.filter((n) => n.p != null);
    if (cuPoz.length < 3) { rand.motiv = 'prea puține opriri pe traseu'; randuri.push(rand); continue; }
    const uMax = Math.max(...cuPoz.map((n) => u(n)));
    const laCapat = (n) => u(n) != null && u(n) >= uMax - 5;      // „a ajuns la punctul depărtat"
    const iAncFirst = noduri.findIndex(laCapat);
    const iAncLast = noduri.map(laCapat).lastIndexOf(true);
    if (iAncFirst < 0) { rand.motiv = 'fără punct depărtat'; randuri.push(rand); continue; }

    /** Partea GOALĂ a unui tronson: la ducere, coborârea sub capătul lui; la întoarcere, urcușul.
     *  `excedent` = cât e drumul măsurat peste diferența de poziție — o ieșire dus-întors
     *  sub ambele capete (satul luat din mers, fără oprire). Jumătate din el e gol. */
    const excedent = (i) => {
      const a = u(noduri[i - 1]), b = u(noduri[i]);
      if (a == null || b == null) return 0;
      // Satul de lângă linie se plătește de două ori: dus și întors. Fără abaterile astea,
      // Clocușna (8,9 km de Ocnița) ar arăta ca o coborâre ascunsă de 18 km.
      const abatere = (noduri[i - 1].p?.d ?? 0) + (noduri[i].p?.d ?? 0);
      return Math.max(0, noduri[i].km - Math.abs(a - b) - abatere);
    };

    // ── ducerea: de la bază până la punctul de unde începe efectiv cursa ──
    // Punctul de plecare al cursei = ULTIMA oprire de dimineață aflată cel mai jos pe linie
    // (ultima, nu prima: 263NSX doarme la Ocnița, umblă o oră prin Briceni și Hădărăuți și
    // se întoarce la Ocnița — cursa începe la a doua trecere, deci golul le cuprinde pe toate).
    const dus = noduri.slice(0, iAncFirst + 1);
    let m = 0, uMin = u(dus[0]) ?? Infinity;
    dus.forEach((n, i) => { const v = u(n); if (v != null && v <= uMin) { uMin = v; m = i; } });
    const B = u(noduri[0]);
    // Coborârea fără oprire se caută pe TOT drumul de dimineață, nu doar pe ultimul tronson:
    // la 652AKD ea e chiar în primul (Colicăuți → Briceni, 13,4 km măsurați pe 3,1 de
    // diferență), iar mașina mai stă de trei ori la Briceni după ea.
    // …și se caută DOAR dacă opririle înregistrate n-au ajuns deja la capăt: dacă mașina a
    // oprit la Otaci, n-are rost să-i mai deducem o coborâre sub Otaci.
    const subCapat = L.capatKm != null && uMin !== Infinity && (s * uMin) <= L.capatKm + TOL_CAPAT_KM;
    const exDim = m > 0 && !subCapat ? Math.max(...Array.from({ length: m }, (_, k) => excedent(k + 1))) : 0;
    let livrareDim = m > 0
      ? noduri.slice(1, m + 1).reduce((x, n) => x + n.km, 0) - exDim / 2
      : 0;
    const T = uMin === Infinity ? null : uMin - exDim / 2;
    const ascunsa = exDim > TOL_INTOARCERE_KM;

    // ── întoarcerea: cât merge gol după ce a lăsat ultimii oameni ──
    const intors = noduri.slice(iAncLast);
    let j = 0, uMinS = u(intors[0]) ?? Infinity;
    intors.forEach((n, i) => { const v = u(n); if (v != null && v < uMinS) { uMinS = v; j = i; } });
    const jAbs = iAncLast + j;
    let livrareSeara = 0, E = uMinS === Infinity ? null : uMinS;
    if (jAbs < noduri.length - 1) {
      // Seara se corectează DOAR tronsonul care pleacă din ultimul punct servit: acolo poate
      // fi o coborâre mai adâncă, fără oprire. Pe restul drumului spre casă, diferența
      // dintre km-ii măsurați și cei de tarif e a tarifului, nu o ieșire (Briceni → Colicăuți:
      // 7,5 km de drum pe 3,1 km de tarif).
      const ex = excedent(jAbs + 1);
      livrareSeara = noduri.slice(jAbs + 1).reduce((x, n) => x + n.km, 0) - ex / 2;
      E = uMinS - ex / 2;
    }
    livrareDim = Math.max(0, livrareDim); livrareSeara = Math.max(0, livrareSeara);

    // ── ruta efectiv făcută (pe kilometrajul tarifului), restul ──
    const kmRuta = (T != null ? uMax - T : 0) + (E != null ? uMax - E : 0);
    const rest = (rand.kmGps ?? 0) - kmRuta - livrareDim - livrareSeara;

    // «a fost la capătul rutei?» — pe axa reală a rutei, nu pe u
    const pozT = T == null ? null : s * T, pozE = E == null ? null : s * E;
    const capatAtins = (p) => L.capatKm != null && p != null && p <= L.capatKm + TOL_CAPAT_KM;
    const laCapatDim = bazaInCapitala ? capatAtins(s * uMax) : capatAtins(pozT);
    const laCapatSeara = bazaInCapitala ? capatAtins(s * uMax) : capatAtins(pozE);
    // regula lui Ion: n-a fost la capăt seara, dar pleacă acolo dimineața → dimineața nu e livrare
    const exceptie = !bazaInCapitala && !laCapatSeara && laCapatDim;

    if (DETALIU) {
      console.log(`\n── ruta ${rand.ruta} «${rand.capat}» (${rand.tarif}, capăt la km ${L.capatKm}, total ${L.totalKm}) · ${rand.masina} · ${rand.sofer} · ${rand.zi}`);
      console.log(`   km GPS ${rand.kmGps} · Σ opriri ${r1(kmIntra)} · drumul de noapte ${r1(kmNoapte)}`);
      const ora = (t) => (t ? new Date(t).toLocaleTimeString('ro-MD', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit' }) : '  —  ');
      noduri.forEach((n, i) => console.log(
        `   ${String(i).padStart(2)}${i === iAncFirst || i === iAncLast ? '*' : ' '}${n.baza ? 'BAZA ' : '     '}${(n.o.locality ?? '—').padEnd(18)} km+${String(r1(n.km)).padStart(6)}  poz ${n.p ? String(n.p.km).padStart(6) + ' ' + n.p.nume : `   off-route (${n.aproape?.departe?.nume ?? '?'} la ${r1(n.aproape?.d ?? 0)} km)`}${n.capitala ? '  [capitală]' : ''}  ${ora(n.o.arrival_at)}→${ora(n.o.departure_at)}`));
      console.log(`   ${bazaInCapitala ? 'baza în capitală (zi întoarsă)' : 'baza în nord'} · T=${pozT == null ? '—' : r1(pozT)} E=${pozE == null ? '—' : r1(pozE)} · livrare dim ${r1(livrareDim)}${ascunsa ? ' (coborâre dedusă din km)' : ''} + seara ${r1(livrareSeara)} · rută ${r1(kmRuta)} · rest ${r1(rest)}`);
    }
    Object.assign(rand, {
      baza: baza ? (baza.locality ?? '—') : '—', bazaKm: B == null ? null : r1(s * B), intoarsa: bazaInCapitala,
      T: pozT == null ? null : r1(pozT), E: pozE == null ? null : r1(pozE),
      ascunsa, livrareDim: r1(livrareDim), livrareSeara: r1(livrareSeara),
      livrareBruta: r1(livrareDim + livrareSeara),
      livrareRegula: r1(exceptie ? livrareSeara : livrareDim + livrareSeara),
      exceptie, laCapatDim, laCapatSeara,
      capatNeservitDim: L.capatKm != null && pozT != null ? r1(Math.max(0, (bazaInCapitala ? s * uMax : pozT) - L.capatKm)) : null,
      capatNeservitSeara: L.capatKm != null && pozE != null ? r1(Math.max(0, (bazaInCapitala ? s * uMax : pozE) - L.capatKm)) : null,
      kmRuta: r1(kmRuta), rest: r1(rest), leiKm: leiPeKm(a.vehicle_id, a.assignment_date),
    });
    randuri.push(rand);
  }

  // ── 8. ieșire ─────────────────────────────────────────────────────────────
  const cuDoua = randuri.filter((r) => !r.motiv && r.alteRute);
  const bune = randuri.filter((r) => !r.motiv && !r.alteRute);
  const perZi = new Map();
  for (const r of bune) {
    const z = perZi.get(r.zi) ?? { km: 0, reg: 0, lei: 0, rest: 0, gps: 0, ruta: 0, n: 0, exc: 0 };
    z.km += r.livrareBruta; z.reg += r.livrareRegula; z.lei += r.livrareRegula * r.leiKm;
    z.rest += r.rest; z.gps += r.kmGps; z.ruta += r.kmRuta; z.n++; z.exc += r.exceptie ? 1 : 0;
    perZi.set(r.zi, z);
  }
  console.log(`\n=== LIVRARE INTERURBAN ${DE}…${PANA} — ${bune.length} zile-rută din ${randuri.length} · ${randuri.length - bune.length - cuDoua.length} fără date · ${cuDoua.length} cu a doua rută pe aceeași mașină (scoase) ===\n`);
  if (cuDoua.length) {
    const pe = new Map();
    for (const r of cuDoua) pe.set(`${r.ruta}+${r.alteRute}`, (pe.get(`${r.ruta}+${r.alteRute}`) ?? 0) + 1);
    console.log(`   zile scoase: ${[...pe.entries()].map(([k, v]) => `rutele ${k}: ${v}`).join(' · ')}\n`);
  }
  console.log('zi          curse  km GPS   km rută  livrare  cu regula  lei     rest    excepții');
  for (const z of [...perZi.keys()].sort()) {
    const v = perZi.get(z);
    console.log(`${z}  ${String(v.n).padStart(4)}  ${String(Math.round(v.gps)).padStart(7)}  ${String(Math.round(v.ruta)).padStart(7)}  ${String(Math.round(v.km)).padStart(6)}  ${String(Math.round(v.reg)).padStart(8)}  ${String(Math.round(v.lei)).padStart(6)}  ${String(Math.round(v.rest)).padStart(6)}  ${String(v.exc).padStart(6)}`);
  }

  const perRuta = new Map();
  for (const r of bune) {
    const k = r.ruta;
    const x = perRuta.get(k) ?? { ruta: k, capat: r.capat, capatKm: r.capatKm, masini: new Set(), soferi: new Set(), baze: new Map(), zile: 0, dim: 0, seara: 0, bruta: 0, reg: 0, lei: 0, leiBrut: 0, rest: 0, gps: 0, exc: 0, neservit: 0, seaLaCapat: 0, dimLaCapat: 0 };
    x.masini.add(r.masina); x.soferi.add(r.sofer);
    x.baze.set(r.baza, (x.baze.get(r.baza) ?? 0) + 1);
    x.zile++; x.dim += r.livrareDim; x.seara += r.livrareSeara; x.bruta += r.livrareBruta;
    x.reg += r.livrareRegula; x.lei += r.livrareRegula * r.leiKm; x.leiBrut += r.livrareBruta * r.leiKm;
    x.rest += r.rest; x.gps += r.kmGps;
    x.exc += r.exceptie ? 1 : 0; x.neservit += (r.capatNeservitDim ?? 0);
    x.seaLaCapat += r.laCapatSeara ? 1 : 0; x.dimLaCapat += r.laCapatDim ? 1 : 0;
    perRuta.set(k, x);
  }
  console.log('\nrută  capăt              zile  bază              km/zi GPS  dim  seara  livrare/zi  lei/zi  la capăt (dim/seara)  cu regula  lei/zi  rest/zi  cap.neservit');
  for (const x of [...perRuta.values()].sort((a, b) => b.bruta / b.zile - a.bruta / a.zile)) {
    const baza = [...x.baze.entries()].sort((p, q) => q[1] - p[1])[0][0];
    console.log(`${String(x.ruta).padStart(4)}  ${(x.capat ?? '?').slice(0, 17).padEnd(17)} ${String(x.zile).padStart(4)}  ${baza.slice(0, 16).padEnd(16)} ${String(Math.round(x.gps / x.zile)).padStart(9)}  ${String(r1(x.dim / x.zile)).padStart(4)} ${String(r1(x.seara / x.zile)).padStart(6)}  ${String(r1(x.bruta / x.zile)).padStart(10)}  ${String(Math.round(x.leiBrut / x.zile)).padStart(6)}  ${String(x.dimLaCapat).padStart(9)}/${String(x.seaLaCapat).padEnd(10)} ${String(r1(x.reg / x.zile)).padStart(9)}  ${String(Math.round(x.lei / x.zile)).padStart(6)}  ${String(Math.round(x.rest / x.zile)).padStart(7)}  ${String(r1(x.neservit / x.zile)).padStart(12)}`);
  }
  const tot = bune.reduce((s, r) => ({ bruta: s.bruta + r.livrareBruta, reg: s.reg + r.livrareRegula, lei: s.lei + r.livrareRegula * r.leiKm, leiBrut: s.leiBrut + r.livrareBruta * r.leiKm, rest: s.rest + r.rest, gps: s.gps + r.kmGps }), { bruta: 0, reg: 0, lei: 0, leiBrut: 0, rest: 0, gps: 0 });
  const nZile = perZi.size;
  console.log(`\nTOTAL ${nZile} zile · livrare brută ${Math.round(tot.bruta)} km (${Math.round(tot.bruta / nZile)} km/zi, ${Math.round(tot.leiBrut / nZile)} lei/zi) · cu regula ${Math.round(tot.reg)} km (${Math.round(tot.reg / nZile)} km/zi, ${Math.round(tot.lei / nZile)} lei/zi) · rest neexplicat ${Math.round(tot.rest)} km · GPS ${Math.round(tot.gps)} km`);
  console.log(`zile cu excepția lui Ion: ${bune.filter((r) => r.exceptie).length} din ${bune.length} · zile cu capătul atins seara: ${bune.filter((r) => r.laCapatSeara).length}`);
  const mari = bune.filter((r) => r.rest > 60).sort((a, b) => b.rest - a.rest);
  console.log(`\nzile cu rest mare (>60 km, ieșiri în afara rutei): ${mari.length}`);
  for (const r of mari.slice(0, 12)) console.log(`   ${r.zi} ruta ${r.ruta} ${r.masina} ${r.sofer} — rest ${r.rest} km (GPS ${r.kmGps}, rută ${r.kmRuta})`);

  if (CSV) {
    const { writeFileSync } = await import('node:fs');
    const cap = ['zi', 'ruta', 'capat', 'capatKm', 'tarif', 'masina', 'sofer', 'baza', 'bazaKm', 'T', 'E', 'ascunsa', 'kmGps', 'kmRuta', 'livrareDim', 'livrareSeara', 'livrareBruta', 'livrareRegula', 'exceptie', 'laCapatDim', 'laCapatSeara', 'capatNeservitDim', 'capatNeservitSeara', 'rest', 'leiKm', 'opriri', 'motiv'];
    writeFileSync(CSV, [cap.join(','), ...randuri.map((r) => cap.map((c) => (r[c] ?? '')).join(','))].join('\n'));
    console.log(`\nCSV: ${CSV} (${randuri.length} rânduri)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
