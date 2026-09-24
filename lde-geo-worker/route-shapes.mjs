// Linia pe drum a rutelor interurbane → route_shapes (migr. 392, ION-43).
// Ion, 23.09: «pune totuși linia de traseu pe care merge mașina, fină să fie».
//
// Opririle din crm_stop_fares au doar nume. Aici: nume → localitate OSM (places-index),
// apoi Valhalla (costing bus) prin toate opririle găsite, în ordinea stop_order.
// Se rulează la mână (o dată, și când se schimbă opririle):
//   cd /root/lde-worker && node --env-file=.env route-shapes.mjs [--dry] [--jumps]
import pg from 'pg';
import { loadPlaces } from './places-index.mjs';
import { hav } from './km-core.mjs';
import { dp } from './geom-simplify.mjs';

const DRY = process.argv.includes('--dry');
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const VALHALLA = process.env.VALHALLA_URL || 'http://127.0.0.1:8002';

async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 || r.status === 201 ? null : r.json().catch(() => null);
}

// «Chișinău (Gara de Nord)» → «chisinau»; «Șeptelici» → «septelici».
const norm = (s) => String(s || '').replace(/\(.*?\)/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[şș]/g, 's').replace(/[ţț]/g, 't').replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();

const places = loadPlaces(process.env.PLACES_FILE);
const byName = new Map();
for (const p of places) {
  const k = norm(p.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(p);
}
// Moldova: numele fără ambiguitate sunt cele mai multe; la omonime alege vecinul de rută.
const MD = { latMin: 45.4, latMax: 48.6, lonMin: 26.6, lonMax: 30.2 };
const inMd = (p) => p.lat > MD.latMin && p.lat < MD.latMax && p.lon > MD.lonMin && p.lon < MD.lonMax;

function candidates(name) {
  const k = norm(name);
  let c = byName.get(k) ?? [];
  if (c.length === 0) { // «Bălți Autogara», «Edineț centru» — primul cuvânt
    const first = k.split(' ')[0];
    c = byName.get(first) ?? [];
  }
  return c.filter(inMd);
}

/** Opririle rutei cu coordonate: întâi cele unice, apoi omonimele după vecinul cel mai apropiat. */
function geocode(stops) {
  const out = stops.map((s) => ({ ...s, cand: candidates(s.name_ro) }));
  for (const s of out) if (s.cand.length === 1) s.pt = s.cand[0];
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < out.length; i++) {
      const s = out[i];
      if (s.pt || s.cand.length === 0) continue;
      const nb = [];
      for (let d = 1; d < out.length && nb.length < 2; d++) {
        if (out[i - d]?.pt) nb.push(out[i - d].pt);
        if (out[i + d]?.pt) nb.push(out[i + d].pt);
      }
      if (nb.length === 0) continue;
      s.pt = s.cand.reduce((b, c) => (Math.min(...nb.map((n) => hav(c, n))) < Math.min(...nb.map((n) => hav(b, n))) ? c : b));
    }
  }
  // Un punct departe de ambii vecini e un omonim greșit («Slobozia» luată după primul cuvânt
  // din «Slobozia Șirăuți», la 90 km): oprirea iese din linie, nu o trage în altă parte a țării.
  for (let i = 0; i < out.length; i++) {
    const s = out[i]; if (!s.pt) continue;
    const prev = out.slice(0, i).reverse().find((x) => x.pt), next = out.slice(i + 1).find((x) => x.pt);
    const ds = [prev, next].filter(Boolean).map((x) => hav(s.pt, x.pt));
    if (ds.length && Math.min(...ds) > 30) s.pt = null;
  }
  return out;
}

// Polyline cu precizie 6 (Valhalla).
function decode(str) {
  let i = 0, lat = 0, lon = 0; const pts = [];
  while (i < str.length) {
    for (const which of [0, 1]) {
      let b, shift = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (which === 0) lat += d; else lon += d;
    }
    pts.push({ lat: lat / 1e6, lon: lon / 1e6 });
  }
  return pts;
}

/**
 * Taie «cârligele»: Valhalla intră până în centrul fiecărui sat-oprire și iese pe același
 * drum, dar autobuzul merge pe traseu (Ion, 23.09: «noi nu intrăm direct în fiecare sat
 * sau oraș, noi mergem pe traseu»). Când linia revine la sub 60 m de un punct prin care a
 * trecut în ultimii 8 km, tot ce e între ele e un dus-întors și iese.
 */
export function taieCarlige(pts, razaM = 60, inapoiKm = 8, pastreaza = []) {
  // Dus-întorsul care trece printr-o autogară NU e cârlig: acolo rutiera chiar intră și
  // iese pe același drum (Ion, 24.09: «punctul Bălți gară nu e pus pe linia itinerar» —
  // intrarea în autogara din Bălți era tăiată ca un sat, iar linia trecea la 777 m de peron).
  const out = [];
  const atingeGara = (from) => out.slice(from).some((q) => pastreaza.some((g) => hav(q, g) * 1000 <= GARA_M));
  for (const p of pts) {
    let cut = -1, back = 0;
    for (let j = out.length - 2; j >= 0; j--) {
      back += hav(out[j], out[j + 1]);
      if (back > inapoiKm) break;
      if (back > 0.15 && hav(out[j], p) * 1000 < razaM) cut = j;
    }
    if (cut >= 0 && !atingeGara(cut + 1)) out.length = cut + 1;
    out.push(p);
  }
  return out;
}
/** Linia trece «prin» autogară dacă un punct al ei e la atât de peron. */
const GARA_M = 150;

/**
 * Localitățile în care rutiera intră de pe traseu, cu punctul exact unde oprește (Ion,
 * 23.09: «nu intrăm direct în fiecare sat… doar în Briceni, Bălți, Chișinău», «ți-am dat
 * punctele exacte unde intră în Briceni, Lipcani, Edineț și Chișinău; autogara din Ocnița
 * și din Rîșcani o găsești»). Chișinău, Bălți, Edineț, Briceni — punctele lui Ion din
 * apps/admin/src/lib/site-assistant/knowledge.ts. Lipcani, Ocnița, Rîșcani — celula de
 * ~100 m în care rutierele noastre au stat cel mai des ≥3 min în 7 zile (23.09; aceeași
 * metodă dă la Edineț și Briceni exact punctele lui Ion).
 */
const STATII = new Map([
  ['chisinau', { lat: 47.0237536, lon: 28.8627521 }],
  ['balti', { lat: 47.7697219, lon: 27.9417474 }],
  ['edinet', { lat: 48.1665595, lon: 27.3096485 }],
  ['briceni', { lat: 48.357826, lon: 27.092106 }],
  ['lipcani', { lat: 48.26297, lon: 26.805993 }],
  ['ocnita', { lat: 48.40768, lon: 27.487994 }],
  ['riscani', { lat: 47.949305, lon: 27.568182 }],
]);
/** Un sat la atât de linie e «pe traseu»: autobuzul trece pe lângă el. */
const PE_LANGA_KM = 3;
const departeDe = (p, line) => line.reduce((m, q) => Math.min(m, hav(p, q)), Infinity);

async function route(pts) {
  const body = {
    locations: pts.map((p, i) => ({ lat: p.lat, lon: p.lon, type: i === 0 || i === pts.length - 1 ? 'break' : 'through' })),
    costing: 'bus', units: 'kilometers', directions_type: 'none',
  };
  const r = await fetch(`${VALHALLA}/route`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`valhalla ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const pts2 = taieCarlige(j.trip.legs.flatMap((l) => decode(l.shape)), 60, 8, [...STATII.values()]);
  let km = 0; for (let i = 1; i < pts2.length; i++) km += hav(pts2[i - 1], pts2[i]);
  return { pts: pts2, km, kmValhalla: j.trip.summary.length };
}

// ── Urma GPS a unei curse reale ─────────────────────────────────────────────
// Trackerul (TRACKER_HOST) răspunde doar VPS-ului; track.w_date e UTC fără fus, x/y NMEA
// (vezi bus-live.mjs). Pentru ruta R: zilele recente în care daily_assignments a pus o
// mașină pe R — `vehicle_id` pe tur (orele hour_from_nord, spre Chișinău), `vehicle_id_retur`
// pe retur (hour_from_chisinau, dinspre Chișinău) —, punctele mașinii în fereastra cursei,
// tăiate între primul și ultimul capăt al rutei. Se ia prima zi a cărei urmă trece pe lângă
// cel puțin 85% din opririle găsite.
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const normPlate = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ZILE_INAPOI = 14;
// 0,80 (era 0,85): drumul e al GPS-ului, nu al graficului (Ion, 24.09: «drumul în baza GPS-ului
// nostru, nu cum Valhalla zice»). Ruta 58 nu merge niciodată până la Otaci — 84%; satele unde
// rutiera nu ajunge rămân în afara liniei, cum sunt în realitate.
const ACOPERIRE_MIN = 0.80;
let tracker = null, devsByPlate = null;

async function trackerReady() {
  if (tracker) return;
  tracker = new pg.Client({
    host: process.env.TRACKER_HOST, port: +(process.env.TRACKER_PORT || 5432),
    user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB,
  });
  await tracker.connect();
  const { rows: devs } = await tracker.query(`SELECT id, "CarName", "RegNo" FROM devices`);
  devsByPlate = new Map();
  for (const d of devs) for (const p of new Set([normPlate(d.CarName), normPlate(d.RegNo)])) {
    if (!p) continue;
    if (!devsByPlate.has(p)) devsByPlate.set(p, []);
    devsByPlate.get(p).push(d.id);
  }
}

/** «2026-09-22» + «6:55» (ora Chișinăului) → Date UTC. */
// Fereastra cursei ieșea decalată cu 3 ore: `new Date(toLocaleString(...))` se citește în
// fusul VPS-ului (Europe/Chisinau), nu în UTC, deci diferența se anula. Urma turului rutei 1
// începea la ~04:35 în loc de ~01:35 și rata tot nordul (Criva → Mihailenii Noi), iar cu
// 53% din opriri toate cele 30 de rute cădeau pe Valhalla (24.09). Aceeași formulă ca în
// stop-times.mjs: ghicim ora ca UTC, vedem ce oră locală iese și corectăm cu diferența.
function localToUtc(date, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const guess = Date.parse(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const local = new Date(guess).toLocaleString('sv-SE', { timeZone: 'Europe/Chisinau' }).replace(' ', 'T') + 'Z';
  return new Date(guess - (Date.parse(local) - guess));
}
const utcText = (ms) => new Date(ms).toISOString().replace("T", " ").replace("Z", "");
const toMin = (s) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/); const v = m ? +m[1] * 60 + +m[2] : 0; return v || null; };

async function gpsShape(rid, stops, found) {
  await trackerReady();
  const since = new Date(Date.now() - ZILE_INAPOI * 864e5).toISOString().slice(0, 10);
  const asg = await rest(`daily_assignments?or=(crm_route_id.eq.${rid},retur_route_id.eq.${rid})&assignment_date=gte.${since}&select=assignment_date,crm_route_id,vehicle_id,retur_route_id,vehicle_id_retur&order=assignment_date.desc`);
  const vIds = [...new Set(asg.flatMap((a) => [a.vehicle_id, a.vehicle_id_retur]).filter(Boolean))];
  if (!vIds.length) return null;
  const vehs = await rest(`vehicles?id=in.(${vIds.join(',')})&select=id,plate_number`);
  const plateOf = new Map(vehs.map((v) => [v.id, normPlate(v.plate_number)]));


  const tries = [];
  for (const a of asg) {
    if (a.crm_route_id === rid && a.vehicle_id) tries.push({ date: a.assignment_date, vid: a.vehicle_id, dir: 'tur', hourKey: 'hour_from_nord' });
    if (a.retur_route_id === rid && (a.vehicle_id_retur ?? a.vehicle_id)) tries.push({ date: a.assignment_date, vid: a.vehicle_id_retur ?? a.vehicle_id, dir: 'retur', hourKey: 'hour_from_chisinau' });
    // Returul făcut de mașina rutei însăși (fără preluare): ca buildReturAssignmentMap. Ruta 13
    // n-are tur din 09.09 (tur_ascuns), deci doar așa are urmă GPS.
    else if (a.crm_route_id === rid && !a.retur_route_id && (a.vehicle_id_retur ?? a.vehicle_id)) tries.push({ date: a.assignment_date, vid: a.vehicle_id_retur ?? a.vehicle_id, dir: 'retur', hourKey: 'hour_from_chisinau' });
  }
  let best = null, bestTur = null;
  for (const t of tries) {
    const plate = plateOf.get(t.vid);
    const devs = devsByPlate.get(plate);
    // RS_DEBUG=<ruta>: de ce e respinsă fiecare zi.
    const D = (m) => { if (process.env.RS_DEBUG === String(rid)) console.log(`    ${t.date} ${t.dir} ${plate}: ${m}`); };
    if (!devs?.length) { D("fără tracker"); continue; }
    // Orele în ordinea de mers; după miezul nopții continuă ziua cursei (ruta 8, returul:
    // Chișinău 20:00 → Criva 00:25).
    const inOrder = (t.dir === 'tur' ? stops : [...stops].reverse()).map((s) => toMin(s[t.hourKey])).filter((x) => x != null);
    if (inOrder.length < 2) continue;
    for (let i = 1; i < inOrder.length; i++) while (inOrder[i] < inOrder[i - 1] - 12 * 60) inOrder[i] += 1440;
    const a = inOrder[0], b = inOrder[inOrder.length - 1];
    if (b <= a) continue;
    // «a» poate trece de 24:00 (cursa pornește după miezul nopții): ziua în plus se adaugă separat.
    const from = new Date(localToUtc(t.date, `${Math.floor((a % 1440) / 60)}:${a % 60}`).getTime() + Math.floor(a / 1440) * 864e5), to = new Date(from.getTime() + (b - a) * 6e4);
    const { rows } = await tracker.query(
      `SELECT w_date, x, y FROM track WHERE id = ANY($1) AND w_date BETWEEN $2 AND $3 ORDER BY w_date`,
      // În UTC, fără fus: w_date e «timestamp» fără fus cu ora UTC; un Date ar pleca cu +03:00.
      [devs, utcText(from.getTime() - 30 * 6e4), utcText(to.getTime() + 60 * 6e4)],
    );
    // Punctele, fără salturi imposibile (>150 km/h) și fără stat pe loc.
    const pts = [];
    for (const r of rows) {
      const p = { lat: nmea(+r.x), lon: nmea(+r.y), at: r.w_date };
      if (!inMd(p)) continue;
      const q = pts[pts.length - 1];
      if (q) {
        const d = hav(p, q), h = (p.at - q.at) / 36e5;
        if (d < 0.015) continue;
        if (h > 0 && d / h > 150) continue;
      }
      pts.push(p);
    }
    if (pts.length < 50) { D(`${pts.length} puncte`); continue; }
    // Tăiat pe cursă: sensul urmei e al cursei (tur: stop_order crescător). Mașina nu pornește
    // mereu din prima oprire cu oră (23.09, ruta 8: turul începe la 75 km de Criva), deci nu
    // se cer capetele: urma se ia de la ultima trecere pe lângă capătul de plecare (sau de la
    // primul punct lângă o oprire) până la prima sosire lângă capătul de destinație (sau
    // ultimul punct lângă o oprire) — fără drumul spre depou sau începutul cursei de întoarcere.
    const onTrip = found.filter((s) => toMin(s[t.hourKey]) != null);
    if (onTrip.length < 2) { D("sub 2 opriri cu oră"); continue; }
    const ordered = t.dir === 'tur' ? onTrip : [...onTrip].reverse();
    const A = ordered[0].pt, B = ordered[ordered.length - 1].pt;
    const nearStop = pts.map((p) => ordered.some((s) => hav(p, s.pt) <= PE_LANGA_KM));
    const firstNear = nearStop.indexOf(true), lastNear = nearStop.lastIndexOf(true);
    if (firstNear < 0) { D('urma nu trece pe lângă nicio oprire'); continue; }
    let iB = pts.findIndex((p, i) => i > firstNear && hav(p, B) <= PE_LANGA_KM);
    if (iB < 0) iB = lastNear;
    let iA = -1;
    for (let i = iB - 1; i >= 0; i--) if (hav(pts[i], A) <= PE_LANGA_KM) { iA = i; break; }
    if (iA < 0) iA = firstNear;
    // Capetele până la gară, nu până la marginea cercului de 3 km: linia se oprea la ~2,9 km
    // de autogara din Chișinău pe toate rutele (24.09), iar autobuzul ajuns acolo ieșea «în
    // afara liniei» și nu putea fi dat drept trecut. Se ia punctul cel mai apropiat de capăt
    // cât urma rămâne în cercul lui.
    for (let i = iB + 1; i < pts.length && hav(pts[i], B) <= PE_LANGA_KM; i++) if (hav(pts[i], B) < hav(pts[iB], B)) iB = i;
    for (let i = iA - 1; i >= 0 && hav(pts[i], A) <= PE_LANGA_KM; i--) if (hav(pts[i], A) < hav(pts[iA], A)) iA = i;
    if (iB - iA < 30) { D(`prea scurt: puncte ${iA}..${iB}`); continue; }
    let seg = pts.slice(iA, iB + 1);
    if (t.dir === 'retur') seg = seg.reverse(); // linia se ține în ordinea stop_order
    const near = onTrip.filter((s) => departeDe(s.pt, seg) <= PE_LANGA_KM).length;
    const cover = near / onTrip.length;
    D(`acoperă ${Math.round(cover * 100)}% din ${onTrip.length} opriri; ocolite: ${onTrip.filter((s) => departeDe(s.pt, seg) > PE_LANGA_KM).map((s) => s.name_ro).join(', ') || '—'}`);
    // Câte gări ale rutei atinge urma (la sub GARA_M): o zi în care mașina a ocolit gara
    // (ruta 59 — Edineț la 1,7 km, Ocnița la 6,6 km) nu e drumul obișnuit al rutei.
    const gari = onTrip.filter((s) => STATII.has(norm(s.name_ro)));
    const gariHit = gari.filter((s) => departeDe(STATII.get(norm(s.name_ro)), seg) * 1000 <= GARA_M).length;
    const cand = { pts: seg, plate, date: t.date, dir: t.dir, cover, gariHit };
    // Ordinea: întâi gările atinse, apoi opririle acoperite, apoi urma mai lungă. Aceeași rută
    // poate avea în grafic mașini care fac doar o bucată (23.09, ruta 8: turul 819BXI doar
    // Bălți → Chișinău).
    const better = (x, y) => !y || x.gariHit > y.gariHit || (x.gariHit === y.gariHit && (x.cover > y.cover || (x.cover === y.cover && x.pts.length > y.pts.length)));
    const withKm = (c) => { let km = 0; for (let i = 1; i < c.pts.length; i++) km += hav(c.pts[i - 1], c.pts[i]); return { ...c, km }; };
    if (cover >= ACOPERIRE_MIN && better(cand, best)) best = withKm(cand);
    // Ion, 24.09: «ideal este capătul de rută de la nord înspre Chișinău» — turul are întâietate.
    if (t.dir === 'tur' && cover >= ACOPERIRE_MIN && better(cand, bestTur)) bestTur = withKm(cand);
  }
  if (bestTur && bestTur.cover >= ACOPERIRE_MIN) best = bestTur;
  if (!best || best.cover < ACOPERIRE_MIN) return null;
  return { ...best, cover: Math.round(best.cover * 100) };
}

// PostgREST dă cel mult 1000 de rânduri pe cerere; opririle sunt peste 1200 — pe pagini.
const rows = [];
for (let off = 0; ; off += 1000) {
  const page = await rest(`crm_stop_fares?select=crm_route_id,stop_order,name_ro,hour_from_nord,hour_from_chisinau&order=crm_route_id,stop_order&limit=1000&offset=${off}`);
  rows.push(...page);
  if (page.length < 1000) break;
}
const byRoute = new Map();
for (const r of rows) {
  if (!byRoute.has(r.crm_route_id)) byRoute.set(r.crm_route_id, []);
  byRoute.get(r.crm_route_id).push(r);
}

let ok = 0;
for (const [rid, stops] of byRoute) {
  const g = geocode(stops);
  const found = g.filter((s) => s.pt);
  const missing = [...new Set(g.filter((s) => !s.pt).map((s) => s.name_ro))];
  // Opriri consecutive în aceeași localitate (autogară + centru) → un singur punct.
  // --jumps: opririle vecine la peste 25 km una de alta — semnul unui omonim greșit.
  if (process.argv.includes('--jumps')) {
    for (let i = 1; i < found.length; i++) {
      const d = hav(found[i].pt, found[i - 1].pt);
      if (d > 25) console.log(`  salt ${rid}: ${found[i - 1].name_ro} → ${found[i].name_ro} ${d.toFixed(0)} km`);
    }
  }
  if (found.length < 2) { console.log(`ruta ${rid}: prea puține opriri găsite (${found.length}/${stops.length}); lipsă: ${missing.join(', ')}`); continue; }
  // Rutiera intră doar în Briceni, Bălți și Chișinău; pe lângă celelalte sate trece pe
  // drumul mare (Ion, 23.09: «nu intrăm direct în fiecare sat… doar în Briceni, Bălți și
  // Chișinău»). Deci linia se face întâi prin capete și orașele-intrare; un sat la sub
  // 3 km de ea nu mai e punct de trecere. Satele mai departe (alt coridor, ex. prin
  // Sîngerei) rămân puncte de trecere, iar dus-întorsul spre ele îl taie taieCarlige.
  // Întâi urma GPS a unei curse reale de pe ruta asta (Ion, 23.09: «copiază traseul
  // exact cum merg mașinile noastre, unu la unu»). Valhalla rămâne doar rezerva.
  // Gările au punctul lor exact (peronul), și pentru urma GPS: capetele și «trece prin gară»
  // se măsoară față de peron, nu față de centrul orașului din OSM.
  for (const s of found) { const st = STATII.get(norm(s.name_ro)); if (st) s.pt = st; }
  let r = null, source = 'gps';
  try { r = await gpsShape(rid, stops, found); } catch (e) { console.log(`  gps ${rid}: ${e.message}`); }
  if (r) {
    const keep = dp(r.pts, 0, r.pts.length - 1, 30);
    const shape = keep.map((i) => [+r.pts[i].lat.toFixed(5), +r.pts[i].lon.toFixed(5)]);
    const stopsOut = found.map((s) => ({ stop_order: s.stop_order, name: s.name_ro, lat: +s.pt.lat.toFixed(5), lon: +s.pt.lon.toFixed(5) }));
    console.log(`ruta ${rid}: GPS ${r.plate} ${r.date} ${r.dir}, ${r.km.toFixed(0)} km, acoperă ${r.cover}% din opriri, ${shape.length} puncte`);
    if (!DRY) {
      await rest('route_shapes?on_conflict=crm_route_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ crm_route_id: rid, stops: stopsOut, shape, missing, updated_at: new Date().toISOString() }),
      });
    }
    ok++;
    continue;
  }
  source = 'valhalla';
  // Orașele-intrare trec prin autogară, nu prin centrul lor.
  for (const s of found) { const st = STATII.get(norm(s.name_ro)); if (st) s.pt = st; }
  const isAnchor = (s, i) => i === 0 || i === found.length - 1 || STATII.has(norm(s.name_ro));
  let vias = found.filter(isAnchor);
  try {
    for (let pass = 0; pass < 4; pass++) {
      const pts = vias.filter((s, i) => i === 0 || hav(s.pt, vias[i - 1].pt) > 0.3).map((s) => s.pt);
      r = await route(pts);
      const far = found.filter((s) => !vias.includes(s) && departeDe(s.pt, r.pts) > PE_LANGA_KM);
      if (far.length === 0) break;
      vias = found.filter((s) => vias.includes(s) || far.includes(s));
    }
  } catch (e) { console.log(`ruta ${rid}: ${e.message}`); continue; }
  const keep = dp(r.pts, 0, r.pts.length - 1, 30);
  const shape = keep.map((i) => [+r.pts[i].lat.toFixed(5), +r.pts[i].lon.toFixed(5)]);
  const stopsOut = found.map((s) => ({ stop_order: s.stop_order, name: s.name_ro, lat: +s.pt.lat.toFixed(5), lon: +s.pt.lon.toFixed(5) }));
  console.log(`ruta ${rid}: [${source}] ${found.length}/${stops.length} opriri, ${r.km.toFixed(0)} km (Valhalla ${r.kmValhalla.toFixed(0)}), prin ${vias.map((s) => s.name_ro).join(', ')}, ${shape.length} puncte${missing.length ? `; lipsă: ${missing.join(', ')}` : ''}`);
  if (!DRY) {
    await rest('route_shapes?on_conflict=crm_route_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ crm_route_id: rid, stops: stopsOut, shape, missing, updated_at: new Date().toISOString() }),
    });
  }
  ok++;
}
await tracker?.end();
console.log(`${ok}/${byRoute.size} rute ${DRY ? '(dry, nimic scris)' : 'scrise în route_shapes'}`);
