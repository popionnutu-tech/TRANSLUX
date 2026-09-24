// LEAR Ungheni — analiza săptămânală a celor trei reguli de tăiere a kilometrilor goi.
//
// Ion, 24.09.2026: «raportul lucrează strict în baza la 1. cum a lucrat săptămâna trecută uzina,
// 2. scheletul făcut. Adițional dă un mic raport dacă au fost deplasări în afara destinației
// lucru la mașini, mai mari de 15 km».
//
// Deci două intrări, atât:
//   SCHELETUL, fix — schelet.json, fixat 23.09.2026. De acolo vin rutele, capetele, etaloanele
//     (lungimea rutei), capacitatea și geometria. Workerul NU-l recalculează și NU-l atinge.
//     Dacă săptămâna nu se potrivește cu el, iese steag, nu se rescrie scheletul.
//   SĂPTĂMÂNA, măsurată — luni 00:00 → duminică 24:00 din urma GPS brută a trackerului.
//     De aici: cine a lucrat, câți km a făcut, ce rută a dus la fiecare schimb, unde a dormit.
//
// Cele trei reguli (tot ale lui Ion):
//   1. mașina doarme la uzină, fiecare rută se face de patru ori
//   2. rutele se mută între mașini de aceeași capacitate
//   3. nu pleacă acasă între schimburi — așteaptă la uzină
// Regulile 1 și 3 se bat pe aceeași mașină și NU se adună; regula 2 se adună peste oricare.
//
// Naveta șoferului NU se numără nicăieri. Ion, 24.09, de două ori: «naveta nu trebuie luat în
// calcul nicicum».
//
// Rulare:  node --env-file=.env lear-analiza.mjs [--saptamina 2026-09-15] [--write]
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
// Node 20 de pe VPS n-are WebSocket nativ, iar clientul Supabase pornește realtime-ul chiar dacă
// nu-l folosim — fără transportul ăsta, `createClient` aruncă înainte de prima cerere.
import ws from 'ws';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadPlaces } from './places-index.mjs';

// ─── parametri ───────────────────────────────────────────────────────────────
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes('--write');
// --de-ce 807MUM,320BRAT — scrie pe stderr, cursă cu cursă, de ce o rută se potrivește sau nu.
// Diagnostic pentru duminicile în care raportul spune «n-am găsit nicio rută» și nu se vede de ce.
const DE_CE = new Set((arg('--de-ce', '') || '').split(',').filter(Boolean));
const UZINA_NUME = 'LEAR Ungheni';
const AICI = path.dirname(new URL(import.meta.url).pathname);
const CALE_SCHELET = process.env.LEAR_SCHELET || path.join(AICI, 'lear-schelet.json');
const CALE_CACHE = process.env.LEAR_DRUMURI || path.join(AICI, 'lear-drumuri-v2.json');
// Ce rută face fiecare mașină, pe tura A și pe tura B — confirmat de Ion pe 23.09.2026.
// Lista asta BATE potrivirea automată. Fără ea, ruta se ghicea din geometrie, iar ghicitul
// cădea pe satul unde doarme mașina sau pe un sat de trecere: A5 Gherman e scurtă, trece pe
// lângă uzină, și o «duceau» șase mașini în aceeași săptămână.
const CALE_RUTE = process.env.LEAR_RUTE_MASINI || path.join(AICI, 'lear-rute-masini.json');
// Satele din nomenclator care nu-s pe hartă sub numele ăla: opriri scrise ca sate («Pîrlița
// școală»), scrieri diferite («Manoilești»), sau locuri care chiar lipsesc din OSM (Dănuțeni,
// cartier al Ungheniului). lear-sate.mjs le rezolvă o dată și scrie fișierul ăsta.
const CALE_SATE = process.env.LEAR_SATE || path.join(AICI, 'lear-sate.json');
const VALHALLA = process.env.VALHALLA_URL || 'http://localhost:8002';

const POARTA = { lat: 47.2230, lon: 27.8016 };
const R_POARTA = 0.7;          // km — raza în care mașina «e la uzină»
const SALT_KM = 5;             // peste atât între două puncte = glitch GPS, se aruncă
const R_RUTA = 0.45;           // km — cât de aproape trebuie să treacă urma de un punct al rutei
const ACOPERIRE = 0.65;        // cât din forma rutei trebuie atinsă ca s-o socotim dusă
const R_DEPLASARE = 15;        // km — peste atât de tot ce e lucrul ei = deplasare în afară
const KM_BRAMBURA_MIN = 5;     // km — o ieșire «brambura» mai scurtă nu se scrie în listă
// Punct în afara țării = punct stricat. Fără filtrul ăsta, un singur rând aiurea dădea o
// «deplasare» de 5160 km de Chetriș, fiindcă distanța se socotește pe punctul brut.
const TARA = { latMin: 45.3, latMax: 48.7, lonMin: 26.4, lonMax: 30.3 };
const inTara = p => p.lat >= TARA.latMin && p.lat <= TARA.latMax && p.lon >= TARA.lonMin && p.lon <= TARA.lonMax;
const PAUZA_MIN = 20;          // min — stat pe loc peste atât = sfârșit de cursă
const R_STAT = 0.3;            // km — cât de strâns trebuie să stea ca să numărăm pauză
const R_ACASA = 2;             // km — cât de aproape de sat înseamnă «a ajuns acasă»
const R_CULOAR = 1.2;          // km — lățimea culoarului dintre casă și capătul rutei
// Cea mai lungă rută din schelet ajunge la 69 km de poartă (A2 Chetriș). O ieșire care pleacă de
// la poartă dar se duce mai departe de atât nu mai e navetă de uzină, oricât ar atinge poarta:
// 320BRAT pleacă de la poartă și se duce la Bălți, 96 km — ar fi fost numărată drept muncă LEAR.
const R_LEAR_MAX = 75;
// Parcul de la Bălți — service și reparații. Ion, 24.09: «dacă mașina pleacă la Bălți în zona de
// reparație, nu trebuie de introdus, automat fixează reparație». Punctul nu-i scris nicăieri în
// bază (lde_uzine_gates are doar porți de uzine), deci l-am scos din opririle pe care le scrie
// workerul de noapte: 47.770, 27.923 adună 883 de opriri de peste două ore, 94 de mașini,
// 11.312 ore în iulie–septembrie. Nu e o presupunere, e cel mai aglomerat loc de stat al flotei.
const PARC = { lat: 47.7700, lon: 27.9235 };
const R_PARC = 0.8;
const R_PARC_ZONA = 3;         // km — «zona de reparație» (Ion, 24.09): și drumul înapoi de la parc
                               // pleacă de acolo, deci o ieșire care începe sau trece pe aici e reparație
const ZILE_LUNA = 21.7;        // zile lucrătoare pe lună, pentru lei
// Ion, 24.09: «mașinile trebuie verificate doar cele care lucrează la LEAR, cel mai probabil
// 043 a venit pe timp scurt». O mașină care a trecut pe la poartă o zi–două nu e a uzinei;
// cifrele ei n-au ce căuta în totaluri, dar se arată, ca să se vadă că a fost pe acolo.
const ZILE_MIN_LEAR = 4;       // zile la poartă din săptămână, ca s-o socotim a uzinei
// Sub pragul ăsta mașina nici nu intră în tabel. Ion, 24.09: «păi de ce el apare aici la LEAR?»
// — 283BRAT trecuse pe la poartă o zi, trei ore, și stătea printre mașinile uzinei ca și cum ar
// fi lucrat. O trecere nu e muncă. Rămâne o singură linie, ca să nu dispară în tăcere.

// Lei pe km, pe tip. Nu există tabel în bază (doar consum l/100km în lde_vehicle_norms), deci
// stau aici, ca în analiza de până acum: combustibil + cauciucuri + întreținere.
// Lista asta NU decide cine e al uzinei — asta se vede din urmă. Ea spune doar cât costă
// kilometrul, iar mașina care lipsește din ea iese cu steag, fără cifre în lei.
const LEI_TIP = { 'DAF': 12.73, 'Sprinter 518': 7.20, 'Sprinter 413': 6.59, 'Sprinter 412': 6.59,
  'Sprinter 315': 6.49, 'Sprinter 313': 6.49, 'Sprinter 312': 5.77 };
const TIP_MASINA = { '809MUM': 'DAF', '827MUM': 'DAF', '807MUM': 'DAF', '189OMM': 'DAF',
  '783MUM-DEFECTAT': 'DAF', '145BRAZ': 'Sprinter 315', '537BRAT': 'Sprinter 413',
  '217RST': 'Sprinter 315', '320BRAT': 'Sprinter 312', '504BRAR': 'Sprinter 518',
  '456BRAX': 'Sprinter 518', '061COY': 'Sprinter 315', '183BZP': 'Sprinter 313',
  '032BRAT': 'Sprinter 312', '732SHS': 'Sprinter 413', '043BRAU': 'Sprinter 518',
  '283BRAT': 'Sprinter 315', '458BRAX': 'Sprinter 518', '614WYW': 'Sprinter 315',
  '725YOZ': 'Sprinter 315' };

// ─── unelte ──────────────────────────────────────────────────────────────────
// x = LATITUDINE, y = LONGITUDINE, ambele NMEA (DDMM.mmmm). Nu invers.
const nmea = v => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s)); };
// `track.w_date` e timestamp fără fus și conține UTC (verificat 17.09.2026). Ziua de lucru se
// taie la 03:00 locale, ca la restul workerilor: +6h aduce la ora locală a trackerului, −3h
// mută hotarul zilei. Aceeași convenție ca în analiza de până acum — n-o schimba fără motiv.
const local = d => new Date(new Date(d).getTime() + 6 * 3600 * 1000);
const ziLucru = d => new Date(local(d).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const n1 = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const n0 = x => Math.round(x).toLocaleString('ro-RO');
const mediana = a => { const q = [...a].sort((x, y) => x - y); const n = q.length;
  return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : 0; };

// Săptămâna: luni → duminică. Fără argument, cea încheiată.
function saptamina(zi) {
  const d = zi ? new Date(zi + 'T12:00:00Z') : new Date(Date.now() - 7 * 86400000);
  const dow = (d.getUTCDay() + 6) % 7;                       // 0 = luni
  const luni = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
  const dum = new Date(luni.getTime() + 6 * 86400000);
  return { luni: luni.toISOString().slice(0, 10), duminica: dum.toISOString().slice(0, 10) };
}

// ─── indice de căutare pe urmă ───────────────────────────────────────────────
// Ca să nu comparăm fiecare punct al rutei cu fiecare punct al urmei (zeci de milioane de
// perechi), punctele urmei intră într-o grilă de ~0,005° (≈ 500 m) și se caută doar în celulele
// vecine. Asta ține potrivirea rutelor sub o secundă pe mașină.
const PAS = 0.005;
const cheie = (la, lo) => `${Math.floor(la / PAS)}|${Math.floor(lo / PAS)}`;
function grila(pts) {
  const g = new Map();
  for (const p of pts) { const k = cheie(p.lat, p.lon); if (!g.has(k)) g.set(k, []); g.get(k).push(p); }
  return g;
}
// punctele din grilă aflate în rază — ca să putem număra, nu doar întreba dacă există unul
function inRaza(g, pct, raza) {
  const out = []; const ci = Math.floor(pct[0] / PAS), cj = Math.floor(pct[1] / PAS);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    const cel = g.get(`${i}|${j}`); if (!cel) continue;
    for (const p of cel) if (hav(p, { lat: pct[0], lon: pct[1] }) <= raza) out.push(p);
  }
  return out;
}
function aproape(g, pct, raza) {
  const ci = Math.floor(pct[0] / PAS), cj = Math.floor(pct[1] / PAS);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    const cel = g.get(`${i}|${j}`); if (!cel) continue;
    for (const p of cel) if (hav(p, { lat: pct[0], lon: pct[1] }) <= raza) return true;
  }
  return false;
}

// ─── scheletul ───────────────────────────────────────────────────────────────
function citesteSchelet() {
  if (!existsSync(CALE_SCHELET)) {
    console.error(`Nu găsesc scheletul la ${CALE_SCHELET}.`);
    console.error('E fișierul fix din repo: apps/admin/public/lde/schelet.json — copiază-l aici.');
    process.exit(2);
  }
  const S = JSON.parse(readFileSync(CALE_SCHELET, 'utf8'));
  for (const r of S.rute) {
    // Pentru a RECUNOAȘTE ruta se ia partea plină: ea e cea care o deosebește de altele.
    const f = [...(r.g?.tur?.plin || []), ...(r.g?.retur?.plin || [])];
    r._puncte = f.filter((_, i) => i % 3 === 0);
    // pe sensuri: o cursă e un singur sens, deci se compară cu turul SAU cu returul, nu cu amândouă
    r._pT = (r.g?.tur?.plin || []).filter((_, i) => i % 3 === 0);
    r._pR = (r.g?.retur?.plin || []).filter((_, i) => i % 3 === 0);
    // Linia «gol» din schelet NU se folosește. Ion, 24.09: «Zăzulenii Noi e cu totul în altă
    // parte» — și avea dreptate. Golul din schelet e drumul pe care a nimerit mașina în ziua
    // aleasă când s-a fixat scheletul, nu drumul rutei: la B6 are 66,7 km față de 21,5 ai rutei
    // și o duce la Sculeni, în partea opusă capătului. Șase rute au golul mai lung decât ruta.
    // Folosindu-l ca «km de rută», orice hoinăreală ar fi fost absorbită.
    //
    // Piciorul gol legitim e uzină → capăt, măsurat pe șosea cu Valhalla. Se cere mai jos, o
    // dată pe capăt, și intră în culoarul după care se recunosc km-ii rutei.
    r._capatC = (r.g?.tur?.sate || []).find(s => s.n === r.capat)?.c
             ?? (r.g?.retur?.sate || []).find(s => s.n === r.capat)?.c ?? null;
    r._sateC = [...(r.g?.tur?.sate || []), ...(r.g?.retur?.sate || [])];
    // Cât de completă e forma plină față de etalon. Ion, 24.09: «Zăzulenii Noi sunt parte a rutei
    // Zăzuleni inclusiv și Grăseni, iar Vrănești parte rută Horești, nu la 043?» — avea dreptate,
    // iar cauza e aici: A8 Horești are 0,3 km de formă pe tur, la un etalon de 41,2. Turul ei nu
    // s-a înregistrat când s-a fixat scheletul. Restul de 27 de rute stau între 0,99 și 1,02.
    // O rută cu forma ruptă nu poate atribui kilometri, deci mașina ei iese cu steag, nu cu vină.
    const lung = (g) => { let s = 0; for (let i = 1; i < g.length; i++)
      s += hav({ lat: g[i - 1][0], lon: g[i - 1][1] }, { lat: g[i][0], lon: g[i][1] }); return s; };
    r._forma = r.etalon
      ? +(Math.max(lung(r.g?.tur?.plin || []), lung(r.g?.retur?.plin || [])) / r.etalon).toFixed(2)
      : null;
  }
  return S;
}

// ─── repartiția fixă: ce rută face fiecare mașină ────────────────────────────
function citesteRuteMasini() {
  if (!existsSync(CALE_RUTE)) {
    console.error(`Nu găsesc lista de rute pe mașini la ${CALE_RUTE}.`);
    console.error('E fișierul fix din repo: apps/admin/public/lde/lear-rute-masini.json.');
    process.exit(2);
  }
  const J = JSON.parse(readFileSync(CALE_RUTE, 'utf8'));
  const out = new Map();
  for (const [nr, v] of Object.entries(J)) { if (nr === '_') continue; out.set(nr, v); }
  return out;
}

// ─── Valhalla, cu cache ──────────────────────────────────────────────────────
// Drumul real pe șosea, nu linia dreaptă. Ion, 24.09: «cum să facem să nu avem estimări».
// Perechile (sat, capăt) se schimbă rar, deci se țin într-un fișier lângă worker.
const cache = existsSync(CALE_CACHE) ? JSON.parse(readFileSync(CALE_CACHE, 'utf8')) : {};
let cacheNou = false;
// Polilinia lui Valhalla, precizie 6.
function decodeaza(str) {
  const out = []; let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    let sh = 0, rez = 0, b;
    do { b = str.charCodeAt(i++) - 63; rez |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
    lat += (rez & 1) ? ~(rez >> 1) : (rez >> 1);
    sh = 0; rez = 0;
    do { b = str.charCodeAt(i++) - 63; rez |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
    lon += (rez & 1) ? ~(rez >> 1) : (rez >> 1);
    out.push([lat / 1e6, lon / 1e6]);
  }
  return out;
}

// Întoarce {km, forma}. Forma e drumul desenat pe șosea de acasă până la capăt — el devine
// «culoarul de acasă», după care se recunosc kilometrii de navetă ai mașinii, fără să tăiem
// ziua în curse.
async function drum(a, b, eticheta) {
  if (cache[eticheta] !== undefined) return cache[eticheta];
  try {
    const res = await fetch(`${VALHALLA}/route`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `alternates`: și drumurile alternative, nu doar cel mai scurt. 827MUM pleacă seara de la
      // Fălești la uzină prin Horești–Gherman–Sculeni, nu pe șoseaua principală prin Sculeni;
      // fără variante, kilometrii ăia ieșeau «neatribuiți». Lungimea rămâne a drumului principal.
      body: JSON.stringify({ locations: [{ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }],
        costing: 'bus', alternates: 2, directions_options: { units: 'kilometers' } }) });
    if (!res.ok) { cache[eticheta] = null; cacheNou = true; return null; }
    const j = await res.json();
    const km = j?.trip?.summary?.length ?? null;
    const toate = [j?.trip, ...(j?.alternates || []).map(x => x.trip)].filter(Boolean);
    const forma = toate.flatMap(t => (t.legs || []).flatMap(l => l.shape ? decodeaza(l.shape) : []));
    const val = km == null ? null : { km, forma: forma.filter((_, i) => i % 4 === 0) };
    cache[eticheta] = val; cacheNou = true;
    return val;
  } catch { return null; }
}

// ─── citirea săptămânii din tracker ──────────────────────────────────────────
async function citesteSaptamina(t, de_la, pana_la) {
  const { rows: devs } = await t.query(`SELECT id,"CarName" FROM devices WHERE active=true`);
  const xC = 47 * 100 + 0.2230 * 60, yC = 27 * 100 + 0.8016 * 60;
  const { rows: near } = await t.query(
    `SELECT DISTINCT id FROM track WHERE w_date>=$1 AND w_date<$2
       AND x BETWEEN $3 AND $4 AND y BETWEEN $5 AND $6`,
    [de_la, pana_la, xC - 0.9, xC + 0.9, yC - 0.9, yC + 0.9]);
  // Ion, 24.09: «nu ne uităm la nomenclatoare când facem analiza la LEAR sau altă uzină, ne
  // uităm dacă auto a lucrat sau nu». Deci flota se ia din URMĂ, nu din liste: cine a fost la
  // poarta uzinei în săptămâna asta. Nicio mașină nu intră fiindcă scrie undeva că ar fi a
  // uzinei, și niciuna nu se scoate fiindcă scrie că ar fi a alteia — 283BRAT iese pentru că a
  // fost o zi la poartă, nu fiindcă apare în nomenclatorul de la Orhei.
  const laPoarta = new Set(near.map(n => String(n.id)));
  const flota = devs.filter(d => laPoarta.has(String(d.id)));

  const out = [];
  for (const d of flota) {
    const { rows } = await t.query(
      `SELECT w_date,x,y,speed FROM track WHERE id=$1 AND w_date>=$2 AND w_date<$3 ORDER BY w_date`,
      [d.id, de_la, pana_la]);
    if (rows.length < 50) continue;
    const pts = [], kmZi = new Map(), zilePoarta = new Set();
    let prev = null, minPoarta = 0;
    for (const r of rows) {
      // viteza vine în noduri (max ~48 = 89 km/h); sub 4 noduri (~7 km/h) = ia sau lasă oameni
      const p = { lat: nmea(Number(r.x)), lon: nmea(Number(r.y)), t: new Date(r.w_date), v: Number(r.speed) };
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || !inTara(p)) continue;
      pts.push(p);
      const z = ziLucru(p.t);
      if (prev) { const dk = hav(prev, p); if (dk < SALT_KM) kmZi.set(z, (kmZi.get(z) || 0) + dk); }
      if (hav(p, POARTA) <= R_POARTA) { zilePoarta.add(z);
        if (prev && (p.t - prev.t) / 60000 <= 15) minPoarta += (p.t - prev.t) / 60000; }
      prev = p;
    }
    out.push({ masina: d.CarName, id: String(d.id), pts, kmZi, zilePoarta, minPoarta });
  }
  return out;
}

// ─── ce rute a dus în săptămâna asta ─────────────────────────────────────────
// Nu ghicim după nume: luăm forma fiecărei rute din schelet și vedem câte din punctele ei au
// fost atinse de urma mașinii. Ruta cu acoperirea cea mai mare, peste prag, e ruta pe care a dus-o.
// Ce rute a DESERVIT mașina — adică pe câte curse a legat capătul rutei de poartă.
//
// Acoperirea urmei nu ajunge: 320BRAT acoperea A5, A9 și A10 sută la sută fără să fi adus pe
// nimeni de acolo — rutele scurte de lângă uzină stau pe drumul pe care trec toți. Ce deosebește
// «a dus ruta» de «a trecut pe acolo» e cursa: pleacă de la capăt, ajunge la poartă (sau invers).
// Ion, 24.09: «ele fac rutele, se opresc la LEAR, aduc lume la LEAR?» — asta se numără aici.
//
// Capătul: cel din schelet, dacă urma îl atinge în săptămâna aia; altfel satul rutei cel mai
// depărtat de poartă la care urma ajunge. 456BRAX face A15 până la Brătuleni și nu urcă până la
// Cîrnești (3,9 km mai departe) — ruta e tot A15, doar mai scurtă în săptămâna aia.
// Cursa deservește ruta dacă: atinge poarta, atinge capătul, și ÎNCETINEȘTE (sub 4 noduri) în
// cel puțin două sate ale rutei — sate dincolo de trunchiul comun de lângă uzină și departe de
// casa mașinii. Fără încetinire nu-i rută, e trecere: Todirești e capătul lui B5, dar acolo dorm
// patru mașini, iar naveta lor de acasă la poartă «atingea» capătul de 25 de ori pe săptămână.
// La 809MUM, Gherman și Medeleni stau chiar pe drumul lui de la Lucăceni la uzină. Ion, 24.09:
// «autobuzul oprește doar unde are pe cineva» — deci oprirea e semnul, nu trecerea.
const V_LENT = 4;          // noduri ≈ 7 km/h
const R_TRUNCHI = 8;       // km de poartă — mai aproape, satele sunt ale tuturor (plafon; la rutele
                           // scurte se ia 40% din depărtarea capătului, altfel B9 n-ar avea sat de probă)
const R_CASA_EXCL = 3;     // km — satul de acasă nu dovedește nimic (3, nu 2: 189OMM doarme la
                           // Sărata Nouă, 2,1 km de Călugăr, și «oprea» acolo în fiecare zi)
const R_DE_FORMA = 2.5;    // km — mai departe de forma rutei, satul nu-i pe drumul ei
// O oprire adevărată ține, o clipă la intersecție nu. 189OMM la Călugăr: un singur punct sub 4
// noduri, cu următorul punct la 7 s — a trecut; la Gherman și Sculeni, unde chiar ia oameni,
// 5–8 puncte lente pe 150–340 s. Ion, 24.09: «el nu putea face Călugăr, altă mașină a făcut».
// Nu se numără punctele (189OMM scrie la 7 s, 320BRAT la 20 s), ci TIMPUL stat încet: fiecare
// punct lent acoperă intervalul până la punctul următor al urmei, plafonat la un minut.
const OPRIRE_SEC = 20;
function eOprire(gLent, cc) {
  const vaz = new Set();
  for (const c of cc) for (const p of inRaza(gLent, c, 0.8)) vaz.add(p);
  let sec = 0; for (const p of vaz) sec += Math.min(p.dt ?? 0, 60);
  return sec >= OPRIRE_SEC;
}
function rutePotrivite(v, S, casaC, fix) {
  const g = grila(v.pts);
  // cât acoperă fiecare punct: până la următorul (pentru timpul stat încet în sat)
  for (let i = 0; i + 1 < v.pts.length; i++) v.pts[i].dt = (v.pts[i + 1].t - v.pts[i].t) / 1000;
  const trips = curse(v.pts).map(c => ({ ...c, g: grila(c.pts),
    gLent: grila(c.pts.filter(p => p.v <= V_LENT)),
    laPoarta: c.pts.some(p => hav(p, POARTA) <= R_POARTA),
    // până unde s-a dus: dacă mai departe decât capătul rutei, cursa nu-i a rutei, ci a drumului
    // pe care stă ruta (naveta lui 809MUM de la Lucăceni trece prin capătul lui A5)
    depMax: Math.max(...c.pts.map(p => hav(p, POARTA))) }));
  const capete = S.rute.filter(x => x._capatC).map(x => ({ id: x.id, c: x._capatC,
    d: hav({ lat: x._capatC[0], lon: x._capatC[1] }, POARTA) }));
  const spune = DE_CE.has(v.masina) ? (...a) => console.error(`[${v.masina}]`, ...a) : null;
  if (spune) {
    const oraL = t => local(t).toISOString().slice(5, 16).replace('T', ' ');
    spune(`casa ${casaC ? casaC.map(x => x.toFixed(4)).join(',') : '—'} · ${trips.length} curse:`);
    for (const c of trips) {
      let dep = null;
      for (const p of c.pts) { const d = hav(p, POARTA); if (!dep || d > dep.d) dep = { p, d }; }
      const sat = celMaiApropiatSat(S, dep.p);
      // opririle ei: sub 4 noduri, pe loc (300 m), cel puțin 2 minute — unde a luat sau lăsat lume
      const opriri = []; let st = null;
      for (const p of c.pts) {
        if (p.v <= V_LENT && st && hav(st.p, p) <= 0.3) { st.pana = p.t; continue; }
        if (st && (st.pana - st.de) / 60000 >= 2) opriri.push(st);
        st = p.v <= V_LENT ? { p, de: p.t, pana: p.t } : null;
      }
      if (st && (st.pana - st.de) / 60000 >= 2) opriri.push(st);
      spune(`  ${oraL(c.pts[0].t)}–${oraL(c.pts[c.pts.length - 1].t).slice(6)} ${c.km.toFixed(0).padStart(4)} km` +
        ` poartă:${c.laPoarta ? 'da' : 'nu'} · cel mai departe ${dep.d.toFixed(0)} km, la ${sat?.n ?? '?'} (${sat?.d.toFixed(1)} km)` +
        ` · opriri: ${opriri.slice(0, 12).map(o => { const n = celMaiApropiatSat(S, o.p);
          return `${oraL(o.de).slice(6)} ${n?.n ?? '?'} ${Math.round((o.pana - o.de) / 60000)}′`; }).join(', ') || '—'}`);
    }
  }
  const gasite = [];
  for (const r of S.rute) {
    if (!r._puncte?.length || !r.etalon || !r._capatC) continue;
    let atinse = 0;
    for (const p of r._puncte) if (aproape(g, p, R_RUTA)) atinse++;
    const acop = atinse / r._puncte.length;
    if (spune && acop >= 0.3) spune(`${r.id} ${r.capat}: acoperire ${(acop * 100).toFixed(0)}%`);
    if (acop < 0.5) continue;
    const capatAtins = aproape(g, r._capatC, 1.5);
    const dCap = hav({ lat: r._capatC[0], lon: r._capatC[1] }, POARTA);
    const trunchi = Math.min(R_TRUNCHI, 0.4 * dCap);
    // ținta: capătul; dacă nu-i atins, al DOILEA sat din nomenclator (456BRAX face A15 până la
    // Brătuleni, al doilea sat, și nu urcă la Cîrnești) — și atât, nu orice sat de pe formă
    let tintaC = capatAtins ? r._capatC : null;
    // Satul se caută pe DRUMUL rutei, nu în centrul lui de pe hartă: forma rutei trece pe
    // șoseaua de lângă sat, iar autobuzul oprește la șosea. Fălești (A1) e ocolit pe centură,
    // Bușila (B3) și Brătuleni (A15) stau la peste 0,8 km de drum — cu centrul, 183BZP, 807MUM
    // și 456BRAX își pierdeau rutele. Un sat la peste 2,5 km de forma rutei nu-i pe drumul ei.
    const peForma = (c) => { let m = null;
      for (const p of r._puncte) { const d = hav({ lat: p[0], lon: p[1] }, { lat: c[0], lon: c[1] });
        if (!m || d < m.d) m = { p, d }; }
      return m && m.d <= R_DE_FORMA ? m.p : null; };
    if (!tintaC && r.sate[1]) { const c2 = coordSat(S, r.sate[1]); const c2f = c2 && (peForma(c2) ?? c2);
      // 85%, nu 70%: la 70% Petrești (al doilea sat al lui A9) trecea drept capăt pentru orice
      // mașină care vine de la nord-vest prin el — 809MUM «deservea» A9 de 12 ori din navetă
      if (c2 && hav({ lat: c2[0], lon: c2[1] }, POARTA) >= 0.85 * dCap && aproape(g, c2f, 1.5)) tintaC = c2f; }
    if (spune) spune(`  capăt atins: ${capatAtins ? 'da' : 'nu'} (${r._capatC.map(x => x.toFixed(4))}) · țintă ${tintaC ? (capatAtins ? 'capătul' : r.sate[1]) : 'NICIUNA'}`);
    if (!tintaC) continue;
    // Satele care pot dovedi ruta sunt cele din NOMENCLATOR — acolo ia oameni — nu cele de pe
    // formă. Cele de pe formă le împart toate rutele de pe același drum: naveta lui 189OMM de la
    // Sărata Nouă trece prin Călugăr (A4), Bocșa (A3), Horești (A8) și le «deservea» pe toate.
    // Nomenclatoarele nu se suprapun: A4 are Călugăr, A5 are Gherman, Sculeni, Blindești.
    // Un sat = mai multe puncte: locurile știute pentru nume PLUS proiecția fiecăruia pe drum.
    // Autobuzul oprește ori în sat (Doltu), ori la șosea (Fălești) — o oprire la oricare ajunge.
    // Satul de acasă iese CU TOTUL, nu punct cu punct: Călugăr are un punct în schelet și altul pe
    // hartă, iar cel de pe hartă stătea la 3,2 km de Sărata Nouă, unde doarme 189OMM — și
    // «oprirea la Călugăr» era plecarea ei de acasă. Ion, 24.09: «el nu putea face Călugăr, altă
    // mașină a făcut». Dacă oricare punct al satului e lângă casă, satul e al casei.
    const eAcasa = (cc) => !!casaC && cc.some(c => hav({ lat: c[0], lon: c[1] }, { lat: casaC[0], lon: casaC[1] }) <= R_CASA_EXCL);
    let sateProba = r.sate.map(n => ({ n, cc: coordSatToate(S, n) }))
      .filter(x => !eAcasa(x.cc))
      .map(x => ({ n: x.n, cc: x.cc.filter(c => hav({ lat: c[0], lon: c[1] }, POARTA) > trunchi) }))
      .map(x => { const pf = x.cc.map(peForma).filter(Boolean); return { n: x.n, cc: [...x.cc, ...pf] }; })
      .filter(x => x.cc.length);
    // rută scurtă, cu toate satele în trunchi (B9 Cetireni): capătul ei e singura probă
    if (!sateProba.length) sateProba = [{ n: r.capat, cc: [r._capatC] }];
    // Șoferul care doarme chiar la capăt (456BRAX la Todirești, capătul lui B5) face naveta pe
    // drumul rutei și încetinește la o stație de la șosea. Aia nu-i rută, e navetă: de la el se
    // cer două sate, oricâte ar trece — și dacă ruta n-are două în afara casei, nu i se dă.
    const casaLaCapat = !!casaC && hav({ lat: casaC[0], lon: casaC[1] }, { lat: r._capatC[0], lon: r._capatC[1] }) <= R_CASA_EXCL;
    const asteptat = !!fix && fix[r.tura] === r.id;
    const tintaD = hav({ lat: tintaC[0], lon: tintaC[1] }, POARTA);
    if (spune) {
      const scoase = r.sate.filter(n => !sateProba.some(x => x.n === n));
      spune(`  sate-probă (trunchi ${trunchi.toFixed(1)} km): ${sateProba.map(x => x.n).join(', ')}` +
        ` · scoase: ${scoase.join(', ') || '—'}`);
    }
    let deservite = 0, lenteTotal = 0; const curseIdx = [];
    for (const [ci, c] of trips.entries()) {
      if (!c.laPoarta || !aproape(c.g, tintaC, 1.5)) continue;
      // «doar până la Bocșa» nu se dă unei curse care merge mai departe, la capătul ALTEI rute:
      // 537BRAT trece prin Bocșa (al doilea sat al lui A3) în drum spre Călugăr, capătul lui A4
      if (!capatAtins && capete.some(k => k.id !== r.id && k.d > tintaD + 1 && aproape(c.g, k.c, 1.5))) continue;
      // oprirea la capăt nu se cere: autobuzul întoarce la capăt din mers, sub 7 km/h nu coboară
      // mereu acolo, iar 537BRAT, 827MUM, 732SHS își pierdeau rutele. Se cer opriri în satele ei.
      // Se cer opriri în două din satele prin care cursa CHIAR trece; dacă trece doar printr-unul
      // (B11: Grozasca și Grozasca Veche stau lângă drum, nu pe el), într-acela. Prin niciunul —
      // a ajuns la capăt pe alt drum, nu-i cursa asta.
      let lente = 0, trecute = 0; const vaz = new Set(); const sec = [];
      for (const x of sateProba) { if (vaz.has(x.n)) continue;
        if (!x.cc.some(q => aproape(c.g, q, 0.8))) continue;
        trecute++;
        if (spune) { const w = new Set(); for (const q of x.cc) for (const p of inRaza(c.gLent, q, 0.8)) w.add(p);
          let sx = 0; for (const p of w) sx += Math.min(p.dt ?? 0, 60); sec.push(`${x.n} ${sx.toFixed(0)}s`); }
        if (eOprire(c.gLent, x.cc)) { lente++; vaz.add(x.n); } }
      // Câte opriri dovedesc cursa:
      //  · capătul e locul unde a ÎNTORS (nu s-a dus mai departe) → una ajunge: acolo s-a dus
      //    pentru rută. 320BRAT ia de pe B15 doar la Bumbăta, restul îi ia 032BRAT din drum.
      //  · a mers mai departe de capăt (doarme dincolo de el: 537BRAT la Fălești, dincolo de
      //    Călugăr) → e naveta lui pe drumul rutei. Dacă ruta e a lui după listă, oprirea zilnică
      //    într-un sat al ei confirmă lista; dacă nu-i a lui, se cer două — altfel orice oprire
      //    de-o clipă pe drumul comun ar «deservi» rute străine.
      //  · doarme chiar la capăt → două, oricum (vezi mai sus).
      const dincolo = c.depMax > dCap + 3;
      const cerute = casaLaCapat ? 2 : (!dincolo || asteptat) ? 1 : 2;
      if (spune) spune(`    cursă ${local(c.pts[0].t).toISOString().slice(5, 16).replace('T', ' ')}: trece prin ${trecute} (${sec.join(', ')}), oprește în ${[...vaz].join(', ') || 'niciun sat'}${dincolo ? ', merge dincolo de capăt' : ''} → ${lente >= cerute ? 'DESERVITĂ' : 'nu'}`);
      if (lente >= cerute) { deservite++; lenteTotal += lente; curseIdx.push(ci); }
    }
    if (spune) spune(`  → ${deservite} curse deservite`);
    if (!deservite) continue;
    // până unde a mers pe nomenclator — pentru steagul «doar până la», nu pentru potrivire
    let panaLa = r.capat;
    if (!capatAtins) for (const n of r.sate) { const c = coordSat(S, n); if (c && aproape(g, c, 1.5)) { panaLa = n; break; } }
    gasite.push({ id: r.id, tura: r.tura, capat: r.capat, loc: r.loc, etalon: r.etalon,
      acoperire: +acop.toFixed(2), capatC: r._capatC, curse: deservite, opriri: lenteTotal,
      capat_atins: capatAtins, tinta: panaLa, curseIdx, kmCursa: Object.fromEntries(curseIdx.map(i => [i, trips[i].km])) });
  }
  return gasite;
}

// Repartizarea rutelor pe mașini, o dată pe toată flota.
//
// Fiecare mașină luată separat «ducea» A5 Gherman, fiindcă ruta aia e scurtă, trece pe lângă
// uzină și capătul ei stă pe drumul pe care merg toți: șase mașini o acopereau peste prag în
// aceeași săptămână. Dar în realitate o rută o duce O SINGURĂ mașină pe schimb. Deci se
// repartizează global: candidatul cel mai bun ia ruta, restul o pierd și trec la următoarea lor.
//
// Ordinea e după acoperire × lungimea rutei: o rută lungă acoperită bine e o potrivire mai
// solidă decât una scurtă care poate fi doar o bucată din drumul altcuiva.
// Ce rută a dus fiecare mașină în săptămâna asta — decis de URMĂ, nu de listă.
//
// Ion, 24.09: «ruta nu este legată mort de mașină, Risipeni putea altă mașină să facă ruta».
// Lista confirmată pe 23.09 rămâne, dar ca AȘTEPTARE, nu ca adevăr: ea înclină balanța când
// urma e la fel de bună pentru două rute, și atât. Dacă mașina a dus în săptămâna aia altceva,
// raportul spune altceva, iar nepotrivirea cu lista e informație, nu greșeală.
//
// Repartiția e globală, fiindcă o rută o duce o singură mașină pe schimb: altfel A5 Gherman,
// scurtă și pe șoseaua comună, ieșea «dusă» de șase mașini deodată.
const BONUS_LISTA = 1.25;   // cât cântărește mai mult ruta așteptată, la acoperire egală

const CURSE_MIN_IMPARTIT = 3;   // a doua mașină ia și ea ruta dacă a deservit-o de atâtea ori
function repartizeazaPeUrma(candidati, RM) {
  const toti = [];
  for (const [masina, lista] of candidati) {
    const fix = RM.get(masina);
    for (const r of lista) {
      const asteptat = !!fix && fix[r.tura] === r.id;
      // întâi cursele deservite, apoi acoperirea × lungimea, apoi lista
      // întâi cursele deservite; la egalitate, ruta din listă; abia apoi lungimea. Fără asta
      // 189OMM lua A4 Călugăr în loc de A5 Gherman la 9 curse fiecare, doar fiindcă A4 e mai lungă —
      // și ieșea cu «patru drumuri ar face 384 km» la 315 conduși, semn că ruta era greșită.
      // 032BRAT: B13 și B15 la 9 curse fiecare, dar în satele lui B13 a oprit de trei ori mai
      // des — și tocmai acolo îi rămâneau 55 km/zi «neatribuiți». Opririle decid înaintea listei.
      toti.push({ masina, ...r, asteptat,
        scor: r.curse * 1000 + Math.min(r.opriri || 0, 99) * 5 + (asteptat ? 200 : 0) + r.acoperire * r.etalon });
    }
  }
  toti.sort((a, b) => b.scor - a.scor);
  const luate = new Map(), ocupat = new Set(), out = new Map();
  for (const c of toti) {
    if (ocupat.has(`${c.masina}|${c.tura}`)) continue;    // mașina are deja rută pe tura asta
    const cine = luate.get(c.id);
    // ruta e a altei mașini — o mai ia și asta doar dacă a deservit-o cu adevărat (rotație)
    if (cine && c.curse < CURSE_MIN_IMPARTIT) continue;
    if (!cine) luate.set(c.id, c.masina);
    ocupat.add(`${c.masina}|${c.tura}`);
    if (!out.has(c.masina)) out.set(c.masina, []);
    out.get(c.masina).push({ ...c, impartita: !!cine });
  }
  for (const [, lista] of out) lista.sort((a, b) => a.tura.localeCompare(b.tura));
  return out;
}

function repartizeaza(candidati) {
  const toti = [];
  for (const [masina, lista] of candidati)
    for (const r of lista) toti.push({ masina, ...r, scor: r.acoperire * r.etalon });
  toti.sort((a, b) => b.scor - a.scor);
  const luate = new Set(), ocupat = new Set(), out = new Map();
  for (const c of toti) {
    if (luate.has(c.id)) continue;                       // ruta e deja a altei mașini
    if (ocupat.has(`${c.masina}|${c.tura}`)) continue;    // mașina are deja rută pe tura asta
    luate.add(c.id); ocupat.add(`${c.masina}|${c.tura}`);
    if (!out.has(c.masina)) out.set(c.masina, []);
    out.get(c.masina).push(c);
  }
  for (const [, lista] of out) lista.sort((a, b) => a.tura.localeCompare(b.tura));
  return out;
}

// ─── cursele zilei, tăiate la pauze ──────────────────────────────────────────
// O cursă se termină când mașina stă pe loc (sub 300 m) mai mult de 20 de minute. Fără
// tăierea asta nu putem spune care kilometri sunt drum spre casă și care sunt muncă în plus.
function curse(pts) {
  const out = []; let cur = null, ancora = null, deCand = null;
  for (const p of pts) {
    if (!cur) { cur = { pts: [p], km: 0 }; ancora = p; deCand = p.t; continue; }
    const ultim = cur.pts[cur.pts.length - 1];
    const dk = hav(ultim, p);
    if (hav(ancora, p) <= R_STAT) {
      if ((p.t - deCand) / 60000 >= PAUZA_MIN) {          // a stat destul → cursa s-a încheiat
        if (cur.km >= 2) out.push(cur);
        cur = { pts: [p], km: 0 }; ancora = p; deCand = p.t; continue;
      }
    } else { ancora = p; deCand = p.t; }
    if (dk < SALT_KM) cur.km += dk;
    cur.pts.push(p);
  }
  if (cur && cur.km >= 2) out.push(cur);
  return out;
}

// Câți km din zi sunt muncă în plus — adică nici rută, nici drum spre casă.
//
// Prima variantă tăia ziua în curse la pauze de 20 de minute și arunca întreagă orice cursă
// care atingea satul de dormit. Când mașina nu stă nicăieri atât, toată ziua ieșea O SINGURĂ
// cursă, care atinge casa, deci se arunca tot: «alte» cădea la 0 la opt mașini din zece și
// economia ieșea maximă. De acolo veneau cei 206 mii.
//
// Acum se măsoară pe geometrie, bucată cu bucată, fără nicio tăiere: un kilometru e «altceva»
// dacă nu merge nici pe formele rutelor ei, nici pe culoarul dintre casă și capetele ei —
// culoar luat de la Valhalla, drumul real pe șosea.
// Întoarce {la_uzina, aiurea}. Ion, 24.09: «alte curse să fie separat, ele au fost la uzină?».
// Întrebarea e bună: un drum care nu-i nici rută, nici navetă, dar ATINGE poarta, e tot muncă
// de LEAR — un transport în plus, o cursă suplimentară. Unul care nu se apropie deloc de uzină
// e altă treabă și n-are ce căuta în socoteala economiilor ei.
//
// Se taie în bucăți: kilometrii «străini» care se leagă unul de altul formează o ieșire, iar
// ieșirea se pune într-un coș sau altul după cum a atins sau nu poarta.
// Întoarce și UNDE se întâmplă kilometrii «aiurea», pe localități. Ion, 24.09: «de ce aceste nu
// sunt introduse aici?» — steagul spunea 97,5 km/zi în afara uzinei la 043BRAU, iar lista de
// deplasări de jos n-avea niciun rând al ei. Nu era o nepotrivire: lista de jos arată numai
// ieșirile de peste 15 km, iar kilometrii ăia se întâmplă APROAPE, pe drumuri care nu-s ale
// rutelor ei. Fără locurile lor, steagul rămânea o cifră fără dovadă.
function alteCurse(pts, ruteObj, culoare, culoareUzina, zileLucrate) {
  const peRuta = grila([].concat(
    ...ruteObj.map(r => (r._puncte || []).map(c => ({ lat: c[0], lon: c[1] }))),
    ...culoareUzina.map(f => f.map(c => ({ lat: c[0], lon: c[1] })))));
  const peCasa = grila([].concat(...culoare.map(f => f.map(c => ({ lat: c[0], lon: c[1] })))));
  let laUzina = 0, aiurea = 0, laParc = 0;
  const peLoc = new Map();   // localitate → km «aiurea», minute, zile
  // fiecare ieșire «brambura» și separat, cu ora ei — Ion, 24.09: «km brambura au fost? și dacă
  // da include aici», în lista deplasărilor, nu doar ca cifră pe zi
  const iesiri = []; let deCand = null, panaCand = null; let locB = new Map();
  // Bucata se judecă după CURSA din care face parte, nu doar după ea însăși. Ion, 24.09, lista
  // «brambura»: «verifică aceste rute, mi se pare că aici se transportă uzina, nu?» — da: 320BRAT
  // la 06:30 și 21:45 aduce lume de la Sculeni, 807MUM lasă oameni pe la Alexeevca în drum spre
  // casă. Ieșirea de pe drumul rutei nu atingea poarta ÎN INTERIORUL ei, dar cursa o atinge — e
  // muncă pentru uzină, «alte curse la uzină». Brambura rămâne doar ce e într-o cursă care nu
  // trece deloc pe la poartă.
  for (const c of curse(pts)) if (c.pts.some(p => hav(p, POARTA) <= R_POARTA)) for (const p of c.pts) p._cursaLaPoarta = true;
  let bucata = 0, atinsPoarta = false, atinsParc = false, celMaiDeparte = 0, prev = null;
  const inchide = () => {
    if (bucata > 0.2) {
      // drumul la parcul de la Bălți e reparație, nu risipă — se pune deoparte, nu la «aiurea»
      if (atinsParc) laParc += bucata;
      // «pe la uzină» cere ȘI atingerea porții, ȘI să nu iasă din raza uzinei
      else if (atinsPoarta && celMaiDeparte <= R_LEAR_MAX) laUzina += bucata;
      else {
        aiurea += bucata;
        const loc = [...locB].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        iesiri.push({ de_la: deCand, pana_la: panaCand, km: bucata, max: celMaiDeparte, loc });
      }
    }
    bucata = 0; atinsPoarta = false; atinsParc = false; celMaiDeparte = 0; deCand = null; locB = new Map();
  };
  for (const p of pts) {
    if (prev) {
      // gol de semnal peste o jumătate de oră = altă ieșire; iar mașina oprită (sub 1 nod la
      // ambele capete) nu «merge» — deriva GPS de peste noapte dădea 11 km în «50 de ore»
      if ((p.t - prev.t) / 60000 > 30) inchide();
      const dk = hav(prev, p);
      if (dk < SALT_KM && !(p.v <= 1 && prev.v <= 1)) {
        const mij = { lat: (prev.lat + p.lat) / 2, lon: (prev.lon + p.lon) / 2 };
        const eRuta = aproape(peRuta, [mij.lat, mij.lon], R_RUTA);
        const eCasa = peCasa.size && aproape(peCasa, [mij.lat, mij.lon], R_CULOAR);
        if (!eRuta && !eCasa) {
          if (!deCand) { deCand = prev.t; if (hav(prev, PARC) <= R_PARC_ZONA) atinsParc = true; }
          panaCand = p.t;
          bucata += dk;
          if (p._cursaLaPoarta) atinsPoarta = true;
          if (hav(p, PARC) <= R_PARC_ZONA) atinsParc = true;
          // se ține minte și locul, ca steagul să poată fi verificat, nu doar crezut
          const l = celMaiApropiatLoc(p);
          if (l) locB.set(l.n, (locB.get(l.n) || 0) + dk);
          if (l) { const x = peLoc.get(l.n) || { km: 0, min: 0, zile: new Set(), dep: 0, ore: new Map() };
            x.km += dk; const dm = (p.t - prev.t) / 60000; if (dm > 0 && dm < 15) x.min += dm;
            x.zile.add(ziLucru(p.t)); const dd = hav(p, POARTA); if (dd > x.dep) x.dep = dd;
            // ora locală la care se fac kilometrii ăștia. Ion, 24.09: «el a făcut asta în orele
            // LEAR?» — fără ora, cifra nu spune dacă e muncă de uzină sau treabă străină.
            const h = local(p.t).getUTCHours();
            x.ore.set(h, (x.ore.get(h) || 0) + dk);
            peLoc.set(l.n, x); }
          const dp = hav(p, POARTA);
          if (dp > celMaiDeparte) celMaiDeparte = dp;
          // Ajungerea la poartă sau la parc ÎNCHEIE bucata: acolo se termină un drum și începe
          // altul. Fără asta, un singur punct lângă parc muta toată ziua la «reparație» —
          // la 283BRAT, care lucrează la Orhei, ieșeau 493 km/zi de reparație.
          if (dp <= R_POARTA) { atinsPoarta = true; inchide(); }
          else if (hav(p, PARC) <= R_PARC) { atinsParc = true; inchide(); }
        } else inchide();
      }
    }
    prev = p;
  }
  inchide();
  const z = zileLucrate || 1;
  const locuriAiurea = [...peLoc].map(([n, v]) => ({ loc: n, km_zi: +(v.km / z).toFixed(1),
    ore: +(v.min / 60).toFixed(1), zile: v.zile.size, de_la_uzina: +v.dep.toFixed(1),
    // orele în care se strâng cei mai mulți kilometri, cu cât la fiecare
    cand: [...v.ore].sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([h, km]) => ({ ora: h, km_zi: +(km / z).toFixed(1) }))
      .sort((a, b) => a.ora - b.ora) }))
    .filter(x => x.km_zi >= 1).sort((a, b) => b.km_zi - a.km_zi).slice(0, 8);
  return { la_uzina: laUzina / z, aiurea: aiurea / z, la_parc: laParc / z, locuri: locuriAiurea, iesiri };
}

// ─── deplasări în afara destinației de lucru ─────────────────────────────────
// «Destinația de lucru» = uzina, satele rutelor ei din schelet, și satul unde doarme.
// Se numără o dată pe deplasare, nu pe punct GPS: punctele depărtate consecutive se lipesc.
function deplasari(pts, rute, casaC) {
  const ancore = [[POARTA.lat, POARTA.lon]];
  for (const r of rute) for (const s of (r._sateC || [])) ancore.push(s.c);
  if (casaC) ancore.push(casaC);
  const departe = p => {
    let min = Infinity;
    for (const a of ancore) { const d = hav(p, { lat: a[0], lon: a[1] }); if (d < min) min = d; }
    return min;
  };
  const out = [];
  let cur = null, prev = null;
  const inchide = () => { if (cur && cur.km >= 1) out.push(cur); cur = null; };
  for (const p of pts) {
    // pauză de semnal peste o jumătate de oră = altă deplasare, nu aceeași prelungită;
    // fără asta, o mașină oprită peste noapte departe dădea o singură «deplasare» de 128 de ore
    if (prev && (p.t - prev.t) / 60000 > 30) inchide();
    const d = departe(p);
    if (d > R_DEPLASARE) {
      if (!cur) cur = { de_la: p.t, pana_la: p.t, km: 0, max: d, varf: p, parc: false };
      else { cur.pana_la = p.t; if (prev) { const dk = hav(prev, p); if (dk < SALT_KM) cur.km += dk; }
             if (d > cur.max) { cur.max = d; cur.varf = p; } }
      if (hav(p, PARC) <= R_PARC_ZONA) cur.parc = true;
    } else inchide();
    prev = p;
  }
  inchide();
  return out;
}

// Localitatea cea mai apropiată de un punct, din indexul OSM. Peste 8 km n-are rost s-o numim:
// mașina e între sate, iar un nume de la 20 km ar minți mai mult decât ar lămuri.
function celMaiApropiatLoc(p) {
  let best = null;
  for (const l of locuri) { const d = hav(l, p); if (!best || d < best.d) best = { n: l.name, d }; }
  return best && best.d <= 8 ? best : null;
}

// ─── coordonata unui sat după nume ──────────────────────────────────────────
// Întâi din schelet, unde satele rutelor au deja punctele lor. Satul unde doarme mașina însă
// nu e mereu pe o rută — Fălești, Drăgănești, Sărata Veche nu-s pe niciuna — și fără coordonata
// lui regulile nu se pot socoti deloc. Atunci se cade pe indexul de localități OSM de pe VPS,
// același pe care-l folosește workerul de noapte ca să numească opririle.
//
// Numele se repetă în țară (două Todirești, două Horești, două Sărata Nouă), deci dintre
// candidați se ia cel mai apropiat de uzină — nu primul din fișier.
const locuri = (() => {
  try { return loadPlaces(process.env.PLACES_FILE); } catch { return []; }
})();
const dupaNume = new Map();
for (const l of locuri) {
  const vechi = dupaNume.get(l.name);
  if (!vechi || hav(l, POARTA) < hav(vechi, POARTA)) dupaNume.set(l.name, l);
}
const MAX_DE_LA_UZINA = 200;   // km — mai departe de atât nu poate fi casa unei mașini de la LEAR
const sateRezolvate = (() => {
  try { return JSON.parse(readFileSync(CALE_SATE, 'utf8')); } catch { return {}; }
})();

function coordSat(S, nume) {
  for (const r of S.rute) for (const s of (r._sateC || [])) if (s.n === nume) return s.c;
  const rez = sateRezolvate[nume];
  if (rez) return [rez.lat, rez.lon];
  const l = dupaNume.get(nume);
  if (l && hav(l, POARTA) <= MAX_DE_LA_UZINA) return [l.lat, l.lon];
  return null;
}
// TOATE locurile știute pentru un nume, nu doar primul: scheletul are Ilenuța într-un loc, harta
// în altul, la 1 km unul de altul, iar autobuzul oprește lângă unul din ele. Cu un singur punct,
// 183BZP nu «oprea» niciodată în Ilenuța și își pierdea A1. Dublurile la sub 300 m se strâng.
function coordSatToate(S, nume) {
  const out = [];
  const pune = (c) => { if (c && !out.some(o => hav({ lat: o[0], lon: o[1] }, { lat: c[0], lon: c[1] }) < 0.3)) out.push(c); };
  for (const r of S.rute) for (const s of (r._sateC || [])) if (s.n === nume) pune(s.c);
  const rez = sateRezolvate[nume]; if (rez) pune([rez.lat, rez.lon]);
  const l = dupaNume.get(nume); if (l && hav(l, POARTA) <= MAX_DE_LA_UZINA) pune([l.lat, l.lon]);
  return out;
}

// ─── numele localității celei mai apropiate ─────────────────────────────────
// Se caută în TOT indexul de localități, nu doar în satele scheletului. Altfel, o mașină care
// lucrează departe primea cel mai apropiat sat LEAR, oricât de departe: 283BRAT, care face
// naveta la Orhei, apărea ca «Cornova + 66,4 km» — un nume care nu spune nimic despre unde e.
function celMaiApropiatSat(S, p) {
  let best = null;
  for (const l of locuri) { const d = hav(l, p); if (!best || d < best.d) best = { n: l.name, d }; }
  if (best && best.d <= 12) return best;
  for (const r of S.rute) for (const s of (r._sateC || [])) {
    const d = hav(p, { lat: s.c[0], lon: s.c[1] });
    if (!best || d < best.d) best = { n: s.n, d };
  }
  return best;
}

// ─── unde a dormit, din opririle de bază ─────────────────────────────────────
// NU localitatea cea mai frecventă: `is_base` marchează orice staționare lungă, iar frecvența
// nimerea așteptarea de seară la uzină. Se ia noaptea adevărată: peste 4 ore, sosire între
// 17:00 și 05:00, fără Bălți și Briceni (acolo e parcul, nu casa).
async function numereSiId(supa, numere) {
  const { data, error } = await supa
    .from('vehicles').select('id, plate_number').in('plate_number', [...numere]);
  if (error) { console.error('vehicles:', error.message); return new Map(); }
  return new Map((data || []).map(x => [x.id, x.plate_number]));
}

// ─── km-ii raportului față de km-ii workerului de noapte ────────────────────
// Ion, 24.09: «verific că în acest raport toți km sunt reali, nu sunt fantezie». Aceeași
// săptămână e socotită de două coduri diferite: aici, suma distanțelor între punctele brute;
// în `lde_vehicle_gps_daily`, de gps-worker, care pe deasupra și cârpește golurile de semnal.
// La proba din 24.09 diferența pe toată săptămâna a fost 0,8%. Dacă se depărtează, iese steag.
async function kmDinBaza(supa, nrDupaId, de_la, pana_la) {
  const { data, error } = await supa
    .from('lde_vehicle_gps_daily')
    .select('vehicle_id, date, km_total')
    .in('vehicle_id', [...nrDupaId.keys()])
    .gte('date', de_la).lte('date', pana_la)
    .gt('km_total', 20);
  if (error) { console.error('lde_vehicle_gps_daily:', error.message); return new Map(); }
  const pe = new Map();
  for (const r of data || []) {
    const nr = nrDupaId.get(r.vehicle_id); if (!nr) continue;
    const x = pe.get(nr) || { km: 0, zile: 0, peZi: new Map() };
    x.km += Number(r.km_total); x.zile++; x.peZi.set(r.date, Number(r.km_total));
    pe.set(nr, x);
  }
  return pe;
}

async function undeDorm(supa, nrDupaId, de_la, pana_la) {
  // PostgREST taie orice răspuns la 1000 de rânduri, oricât ai cere — deci se îngustează de la
  // început la mașinile noastre, nu se filtrează după ce vin toate opririle flotei.
  if (!nrDupaId.size) return {};
  const { data, error } = await supa
    .from('lde_gps_stops')
    .select('vehicle_id, locality, dwell_min, arrival_at')
    .eq('is_base', true)
    .in('vehicle_id', [...nrDupaId.keys()])
    .gte('date', de_la).lte('date', pana_la)
    .gte('dwell_min', 240)
    .not('locality', 'is', null);
  if (error) { console.error('lde_gps_stops:', error.message); return {}; }
  const pe = new Map();
  for (const r of data || []) {
    const nr = nrDupaId.get(r.vehicle_id); if (!nr) continue;
    if (r.locality === 'Bălți' || r.locality === 'Briceni') continue;
    const ora = new Date(r.arrival_at).getUTCHours() + 3;
    const h = ((ora % 24) + 24) % 24;
    if (!(h >= 17 || h < 5)) continue;
    if (!pe.has(nr)) pe.set(nr, new Map());
    const m = pe.get(nr);
    m.set(r.locality, (m.get(r.locality) || 0) + 1);
  }
  const out = {};
  for (const [nr, m] of pe) out[nr] = [...m].sort((a, b) => b[1] - a[1])[0][0];
  return out;
}

// ─── casa scoasă din urmă, când baza n-are nicio noapte ─────────────────────
// 183BZP și 217RST n-au niciun rând `is_base` în săptămâna asta, deci rămâneau fără cifre.
// Dar noaptea se vede în urmă: cea mai lungă stat-pe-loc între 17:00 și 05:00. Numele îl dă
// indexul de localități, același pe care-l folosește workerul de noapte.
// 217RST doarme la Călinești (46,5 km de poartă) și pleacă la 03:30: noaptea ei are 2,8 ore,
// sub pragul de 4, iar staționările ei lungi sunt ZIUA, între ture (07:24–12:13, 16:27–21:28).
// Deci nu se caută «noaptea», ci LOCUL unde stă cel mai mult pe loc, adunat pe săptămână, din
// staționările de peste 2 ore — la orice oră. Parcul și poarta se scot: acolo stă de muncă.
function casaDinUrma(pts) {
  const peLoc = new Map();
  let ancora = null, deCand = null, ultim = null;
  const inchide = () => {
    if (!ancora || !deCand || !ultim) return;
    const min = (ultim - deCand) / 60000;
    if (min < 120) return;
    if (hav(ancora, POARTA) <= 1.5 || hav(ancora, PARC) <= R_PARC) return;
    const k = `${ancora.lat.toFixed(3)}|${ancora.lon.toFixed(3)}`;
    const x = peLoc.get(k) || { p: ancora, min: 0 };
    x.min += min; peLoc.set(k, x);
  };
  for (const p of pts) {
    if (ancora && hav(ancora, p) <= R_STAT) { ultim = p.t; continue; }
    inchide(); ancora = p; deCand = p.t; ultim = p.t;
  }
  inchide();
  const best = [...peLoc.values()].sort((a, b) => b.min - a.min)[0];
  if (!best) return null;
  let sat = null;
  for (const l of locuri) { const d = hav(l, best.p);
    if (d <= 4 && (!sat || d < sat.d)) sat = { n: l.name, d, c: [l.lat, l.lon] }; }
  return sat ? { nume: sat.n, c: sat.c, ore: +(best.min / 60).toFixed(1) } : null;
}

// ─── programul ───────────────────────────────────────────────────────────────
const S = citesteSchelet();
const sapt = saptamina(arg('--saptamina'));
// o zi în plus de fiecare parte: fereastra de lucru începe la 03:00, iar noaptea de duminică
// spre luni aparține tot săptămânii
const de_la = new Date(new Date(sapt.luni + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
const pana_la = new Date(new Date(sapt.duminica + 'T00:00:00Z').getTime() + 2 * 86400000).toISOString().slice(0, 10);

console.log(`LEAR Ungheni · săptămâna ${sapt.luni} → ${sapt.duminica}`);
console.log(`scheletul: ${S.rute.length} rute, fixat ${S.fixat}\n`);

const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432),
  user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS,
  database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const flota = await citesteSaptamina(t, de_la, pana_la);
await t.end();

const inSapt = z => z >= sapt.luni && z <= sapt.duminica;
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false }, realtime: { transport: ws } });
const nrDupaId = await numereSiId(supa, new Set(flota.map(v => v.masina)));
const case_ = await undeDorm(supa, nrDupaId, de_la, pana_la);
const kmBaza = await kmDinBaza(supa, nrDupaId, sapt.luni, sapt.duminica);

const masini = [], steaguri = [], toateDeplasarile = [], steagCasaFaraPunct = [], doarTrecute = [];
const ruteFolosite = new Set();

// trecerea întâi: ce rute ar putea fi ale fiecărei mașini
const candidati = new Map();
const RM = citesteRuteMasini();
const auLucrat = [];
for (const v of flota) {
  const zilePoarta = [...v.zilePoarta].filter(inSapt);
  if (!zilePoarta.length) continue;
  auLucrat.push(v);
  // casa se știe de pe acum: potrivirea rutelor trebuie să nu ia naveta drept rută
  { let c = case_[v.masina] || null, cc = c ? coordSat(S, c) : null;
    if (!cc) { const d = casaDinUrma(v.pts); if (d) { c = d.nume; cc = d.c; v._casaDedusa = true; } }
    v._casa = c; v._casaC = cc; }
  // Potrivirea rutelor se face NUMAI pe punctele săptămânii. Citirea aduce o zi în plus de
  // fiecare parte, ca fereastra de 03:00 să fie întreagă — dar luni dimineața din săptămâna
  // următoare nu e a săptămânii ăsteia. 032BRAT a trecut pe A8 Horești luni 21.09 la 04:27 și
  // ieșea «a mers și pe A8 (100%)» în raportul pentru 14–20.09. Corridoarele se schimbă de la
  // o săptămână la alta, deci o zi în plus înseamnă altă rută.
  candidati.set(v.masina, rutePotrivite({ ...v, pts: v.pts.filter(p => inSapt(ziLucru(p.t))) }, S, v._casaC, RM.get(v.masina)));
}
const repartitie = repartizeazaPeUrma(candidati, RM);

for (const v of auLucrat) {
  const zile = [...v.kmZi.keys()].filter(inSapt);
  const zilePoarta = [...v.zilePoarta].filter(inSapt);
  const kmZile = zile.map(z => v.kmZi.get(z)).filter(k => k > 20);
  const tip = TIP_MASINA[v.masina] || null;
  const lk = tip ? LEI_TIP[tip] : null;

  const cand = candidati.get(v.masina) || [];
  const alese = repartitie.get(v.masina) || [];
  const toate = cand;
  const fix = RM.get(v.masina);
  for (const r of alese) ruteFolosite.add(r.id);
  // Rute COMASATE: o cursă care duce ruta ei trece și prin satele altei rute de pe aceeași
  // tură și oprește acolo. 032BRAT merge la Hîrcești (B13) prin Sineștii Noi și Boghenii (B15);
  // 320BRAT seara face A9 Medeleni și A5 Gherman într-un drum, până la Taxobeni. Ion, 23.09,
  // în listă: 032BRAT «extra: B13», 537BRAT «schimbul cu A3 se face comasat cu A4». Semnul e
  // că sunt ACELEAȘI curse (indicii lor), nu curse separate — alea ar fi «a deservit și».
  // Ruta comasată intră NUMAI la atribuirea kilometrilor (ca să nu iasă «brambura» ce e muncă).
  // Etalonul turei rămâne cel din schelet al rutei alese. Ion, 24.09: «nu mai adăuga km în
  // scheletul rutei» — ce se socotește la reguli e ruta ei, nu drumul pe care l-a făcut azi.
  // Nu e comasare când capătul celeilalte stă chiar pe drumul rutei alese (A13 Costuleni e pe
  // drumul lui A12 Frăsinești): aia e ruta ei, care trece prin satele celei scurte.
  const capatPeDrum = (a, t) => (S.rute.find(x => x.id === a.id)?._puncte || [])
    .some(p => hav({ lat: p[0], lon: p[1] }, { lat: t.capatC[0], lon: t.capatC[1] }) <= 1);
  const comasate = [];
  for (const a of alese) {
    a.etalon_propriu = a.etalon;
    for (const t of toate) {
      if (t.tura !== a.tura || t.id === a.id || alese.some(x => x.id === t.id) || t.curse < CURSE_MIN_IMPARTIT) continue;
      if (capatPeDrum(a, t)) continue;
      const comune = (t.curseIdx || []).filter(i => (a.curseIdx || []).includes(i));
      // Comasarea schimbă etalonul, deci banii: se cere MAJORITATEA curselor rutei alese, nu trei
      // la întâmplare. 189OMM stătea 30–50 s la Călugăr pe 3 curse din 9 (un stop la intersecție)
      // și ieșea «A5 comasată cu A4», cu etalonul 64 km — Ion: «el nu putea face Călugăr».
      if (comune.length < CURSE_MIN_IMPARTIT || comune.length < 0.5 * t.curse || comune.length < 0.5 * a.curse) continue;
      (a.comasat ??= []).push(t.id);
      comasate.push({ ...t, cu: a.id, comune: comune.length });
      ruteFolosite.add(t.id);
    }
  }
  // se lucrează numai pe punctele săptămânii: citirea aduce o zi în plus de fiecare parte,
  // ca fereastra de 03:00 să fie întreagă, dar ele nu intră în socoteală
  const ptsSapt = v.pts.filter(p => inSapt(ziLucru(p.t)));
  const ruteSchelet = S.rute.filter(r => alese.some(a => a.id === r.id) || comasate.some(c => c.id === r.id));
  const casa = v._casa, casaC = v._casaC, casaDedusa = !!v._casaDedusa;
  if (casa && !casaC) steagCasaFaraPunct.push(
    `${v.masina}: satul ${casa} nu e nici pe rute, nici în indexul de localități — n-avem coordonata lui`);

  const azi = kmZile.length ? kmZile.reduce((s, x) => s + x, 0) / kmZile.length : 0;
  const rec = { masina: v.masina, tip, lei_km: lk, casa,
    casa_dedusa: casaDedusa || undefined,
    a_uzinei: zilePoarta.length >= ZILE_MIN_LEAR,
    zile_lucrate: zilePoarta.length, ore_poarta: +(v.minPoarta / 60).toFixed(1),
    zile_masurate: kmZile.length, azi: +azi.toFixed(1),
    rute: alese.map(r => ({ id: r.id, tura: r.tura, capat: r.capat, loc: r.loc,
      etalon: r.etalon, acoperire: r.acoperire, comasat: r.comasat, etalon_propriu: r.etalon_propriu })),
    rute_toate: toate.map(r => `${r.id}:${r.curse}`), steaguri: [], note: [] };
  if (!rec.a_uzinei) {
    doarTrecute.push({ masina: v.masina, zile: zilePoarta.length, ore: +(v.minPoarta / 60).toFixed(1),
      km_zi: +azi.toFixed(1) });
    continue;                       // n-a lucrat aici — nu-i mașină de-a uzinei, nu intră în raport
  }
  // nepotrivirea cu lista e informație, nu greșeală: rutele se mută între mașini
  // Ion, 24.09: «rezolvă toate întrebările cu semnul exclamării». Ce e lămurit nu-i întrebare:
  // ruta schimbată față de listă, capătul neatins, ruta împărțită — sunt fapte citite din urmă,
  // deci note. Steag rămâne numai ce modelul NU poate explica.
  for (const r of alese) {
    if (fix && fix[r.tura] && fix[r.tura] !== r.id) rec.note.push(
      `pe tura ${r.tura} a dus ${r.id} ${r.capat}, nu ${fix[r.tura]} din listă ` +
      `(${r.curse} curse capăt↔poartă) — rutele se mută între mașini, lista e doar așteptarea`);
    if (!r.capat_atins) rec.note.push(
      `pe ${r.id} a întors la ${r.tinta}, nu la capătul ${r.capat} (${r.curse} curse) — ruta e aceeași, mai scurtă`);
    if (r.impartita) rec.note.push(
      `${r.id} ${r.capat} a dus-o și altă mașină în aceeași săptămână (${r.curse} curse ale ei)`);
  }
  for (const tura of ['A', 'B']) if (fix?.[tura] && !alese.some(r => r.tura === tura))
    rec.steaguri.push(`pe tura ${tura} n-am găsit nicio rută din schelet în urma ei` +
      ` (era așteptată ${fix[tura]})`);
  // pragul e mult mai sus decât la potrivirea obișnuită: o rută scurtă de lângă uzină e atinsă
  // de aproape toată lumea, iar steagul ăsta trebuie să însemne «chiar a dus altă rută»
  // A5 Gherman (25 km) ieșea 100% la toată lumea: forma ei stă în întregime pe șoseaua spre
  // Ungheni, pe care merge oricine. Rutele scurte nu pot fi deosebite de drumul comun, deci
  // steagul se dă numai pe rute lungi, care chiar ies din corider.
  for (const r of alese) { const sch = S.rute.find(x => x.id === r.id);
    if (sch?._forma != null && sch._forma < 0.8) rec.steaguri.push(
      `forma rutei ${r.id} ${r.capat} e ruptă în schelet: are ${n1(sch._forma * r.etalon)} km ` +
      `desenați la un etalon de ${n1(r.etalon)} — kilometrii de pe ea nu se pot atribui, ` +
      'de aici cei «neatribuiți» de mai sus. Se repară scheletul, nu mașina.'); }
  // «a mers și pe» doar când chiar a DESERVIT altă rută (curse capăt↔poartă), nu când a trecut
  // «a mers și pe» e problemă doar dacă a deservit altă rută cel puțin cât pe a ei de pe tura
  // aia — atunci ori a schimbat ruta, ori e mașină de rezervă. Altfel e drum comun, o notă.
  // …și nici pentru rute al căror capăt stă chiar pe drumul rutei alese: B9 Cetireni e pe drumul
  // lui B10 Unțești, deci mașina de pe B10 oprește la Cetireni în fiecare zi — e ruta ei, nu alta
  const peDrumulEi = (t) => alese.some(a => (S.rute.find(x => x.id === a.id)?._puncte || [])
    .some(p => hav({ lat: p[0], lon: p[1] }, { lat: t.capatC[0], lon: t.capatC[1] }) <= 1));
  for (const c of comasate) rec.note.push(
    `${c.cu} comasată cu ${c.id} ${c.capat}: ${c.comune} din cursele ei trec și opresc și în satele lui ${c.id} — ` +
    `kilometrii de pe ${c.id} sunt ai ei, dar etalonul turei rămâne al lui ${c.cu}`);
  const straine = toate.filter(t => !alese.some(a => a.id === t.id) && !comasate.some(c => c.id === t.id)
    && t.curse >= 4 && !peDrumulEi(t));
  const peTura = Object.fromEntries(alese.map(a => [a.tura, a.curse]));
  const concur = straine.filter(t => t.curse >= (peTura[t.tura] ?? 0));
  const doarTrec = straine.filter(t => !concur.includes(t));
  if (doarTrec.length) rec.note.push(`a mai oprit și pe ${doarTrec.map(t => `${t.id} (${t.curse} curse)`).join(', ')} — drum comun cu rutele ei`);
  if (concur.length >= 2 || (concur.length && alese.length < 2)) rec.steaguri.push(
    `pare mașină de rezervă: a deservit ${[...alese, ...concur].map(t => `${t.id} ×${t.curse}`).join(', ')} ` +
    'în aceeași săptămână — ziua ei nu se potrivește cu două rute fixe');
  const strainePt = concur.filter(t => !(concur.length >= 2 || (concur.length && alese.length < 2)))
    .map(t => `${t.id} (${t.curse} curse)`);
  if (strainePt.length) rec.steaguri.push(
    `a deservit și ${strainePt.join(', ')} cel puțin cât ruta ei de pe tura aia — a schimbat ruta în timpul săptămânii`);

  if (!tip) rec.steaguri.push('la poartă, dar n-are tip cunoscut — lipsește din tabelul de costuri');
  if (alese.length < 2) rec.steaguri.push(
    `a dus ${alese.length} rută din schelet în săptămâna asta, nu două — nu se poate socoti ziua`);
  if (casaDedusa) rec.note.push(
    `casa e luată din urmă, nu din bază: stă cel mai mult la ${casa}`);
  else if (!casa) rec.steaguri.push('n-are noapte lungă scrisă în GPS — nu știm unde doarme');

  // Fără satul unde doarme nu putem despărți drumurile spre casă (care dispar la regula 1) de
  // munca în plus (care rămâne), deci «alte curse» ar înghiți toată ziua: la 043BRAU ieșeau
  // 291,8 km/zi. Mai bine niciun număr decât un număr greșit.
  if (!casaC && alese.length === 2) rec.steaguri.push(
    'nu știm unde doarme, deci drumurile spre casă nu se pot despărți de restul — regulile nu se pot socoti');
  const gata = alese.length === 2 && lk && azi > 0 && !!casaC;
  if (gata) {
    const sumaEtalon = alese.reduce((s, r) => s + r.etalon, 0);
    const patru = 4 * sumaEtalon;
    // drumurile de acasă la fiecare capăt: lungimea intră în regula 3, forma devine culoarul
    // după care se recunosc kilometrii de navetă
    let dCasa = 0, culoare = [], culoareUzina = [], lipsaDrum = false;
    const peCapat = [];
    for (const r of alese) {
      if (!r.capatC) { lipsaDrum = true; break; }
      const d = await drum(casaC, r.capatC, `${casa}|${r.capat}`);
      if (!d) { lipsaDrum = true; break; }
      dCasa += d.km; culoare.push(d.forma || []);
      peCapat.push({ id: r.id, capat: r.capat, km: +d.km.toFixed(1) });
      // piciorul gol al rutei: de la poartă până la capătul ei, pe șosea
      const u = await drum([POARTA.lat, POARTA.lon], r.capatC, `UZINA|${r.capat}`);
      if (u?.forma) culoareUzina.push(u.forma);
    }
    // și drumul de acasă drept la poartă: 827MUM pleacă seara de la Fălești direct la uzină
    // pentru schimbul de noapte, prin Horești–Gherman–Sculeni, nu prin capătul vreunei rute.
    // E navetă, nu muncă în plus — dispare la regula 1 ca orice drum de acasă.
    const hc = await drum(casaC, [POARTA.lat, POARTA.lon], `${casa}|UZINA`);
    if (hc?.forma) culoare.push(hc.forma);
    // «alte curse»: munca în plus, măsurată — nici rută, nici culoar de acasă. Nu dispare sub
    // nicio regulă, deci se adună la ziua nouă la amândouă.
    const A = alteCurse(ptsSapt, ruteSchelet, culoare, culoareUzina, kmZile.length);
    // Ion, 24.09: «auto care pleacă la Bălți reparație nu trebuie nicăieri introdusă». Drumul la
    // parc nu e nici muncă în plus, nici zi de lucru: iese din «alte» și din ziua cu care se
    // compară regulile. Rămâne scris (alte_la_parc), ca cifra să se poată verifica.
    const alte = A.la_uzina + A.aiurea;
    const aziL = azi - A.la_parc;
    rec.azi_fara_parc = +aziL.toFixed(1);
    for (const e of A.iesiri) if (e.km >= KM_BRAMBURA_MIN) toateDeplasarile.push({
      masina: v.masina, zi: ziLucru(e.de_la),
      de_la: local(e.de_la).toISOString().slice(11, 16), pana_la: local(e.pana_la).toISOString().slice(11, 16),
      ore: +((e.pana_la - e.de_la) / 3600000).toFixed(1), km: +e.km.toFixed(1), departare: +e.max.toFixed(1),
      fel: 'brambura', unde: e.loc ? `pe la ${e.loc}` : '—' });
    rec.etalon_s1 = alese[0].etalon; rec.etalon_s2 = alese[1].etalon;
    rec.rutele_de_4 = +patru.toFixed(1);
    rec.alte = +alte.toFixed(1);
    rec.alte_la_uzina = +A.la_uzina.toFixed(1);
    rec.alte_aiurea = +A.aiurea.toFixed(1);
    rec.alte_la_parc = +A.la_parc.toFixed(1);
    rec.locuri_aiurea = A.locuri;

    // regula 1: ziua = 4 × latura fiecărui schimb + alte curse
    const z1 = patru + alte;
    rec.r1 = { zi: +z1.toFixed(1), km: +(aziL - z1).toFixed(1),
      lei: Math.round((aziL - z1) * lk * ZILE_LUNA) };

    // regula 3: plin (2 × fiecare rută) + de acasă la capete + de la uzină la capete + alte
    if (!lipsaDrum) {
      const z3 = 2 * sumaEtalon + dCasa + sumaEtalon + alte;
      rec.d_casa = +dCasa.toFixed(1); rec.d_uzina = +sumaEtalon.toFixed(1);
      rec.d_casa_pe_capat = peCapat;
      rec.r3 = { zi: +z3.toFixed(1), km: +(aziL - z3).toFixed(1),
        lei: Math.round((aziL - z3) * lk * ZILE_LUNA) };
    } else rec.steaguri.push('Valhalla n-a dat drumul de acasă la capăt — regula 3 nu se poate socoti');

    if (patru > aziL) rec.note.push(
      `rute lungi: 4 × (${alese.map(r => n1(r.etalon)).join(' + ')}) = ${n1(patru)} km, peste cei ${n1(aziL)} ` +
      'conduși azi — nu se întoarce goală la uzină între ture, deci regula 1 i-ar ADĂUGA kilometri');
    // Steagul spunea «mașina asta face și altă treabă». Ion, 24.09: «el a făcut asta în orele
    // LEAR?» — și da, le face. La 043BRAU, 032BRAT și 320BRAT kilometrii ăștia se fac la orele
    // schimburilor, în aceleași curse care ajung la poartă. Nu-s treburi străine: e muncă pe care
    // modelul n-o poate atribui, fiindcă ruta nu-i în schelet sau se face pe alt drum.
    // Steagul trebuie să spună ce e, nu să acuze.
    if (A.aiurea > 40) {
      const oreLucru = A.locuri.some(l => (l.cand || []).some(c =>
        (c.ora >= 3 && c.ora <= 7) || (c.ora >= 13 && c.ora <= 17) || c.ora >= 21 || c.ora <= 1));
      rec.steaguri.push(
        `${n1(A.aiurea)} km/zi pe care modelul nu-i poate atribui — nu-s pe formele rutelor ei din ` +
        'schelet, nu-s pe drumul spre casă și nu trec pe la poartă' +
        (A.locuri.length ? `; cei mai mulți pe la ${A.locuri.slice(0, 3).map(x => `${x.loc} ${n1(x.km_zi)}`).join(', ')} km/zi` : '') +
        (oreLucru
          ? '. Se fac la orele schimburilor, deci cel mai probabil e tot muncă de uzină: ori o rută ' +
            'care nu-i în schelet, ori aceeași rută pe alt drum.'
          : '. NU se fac la orele schimburilor.'));
    }
    // muncă în plus pentru uzină nu e întrebare, e fapt: notă, nu steag (Ion, 24.09: «aici se
    // transportă uzina»). 320BRAT: 46,5 km/zi seara pe Gherman–Sculeni–Taxobeni, la ora schimbului.
    else if (A.la_uzina > 40) rec.note.push(
      `alte curse ${n1(A.la_uzina)} km/zi care trec pe la poartă — transport în plus pentru uzină, ` +
      `pe un drum care nu-i în schelet` +
      (A.locuri.length ? ` (pe la ${A.locuri.slice(0, 3).map(x => x.loc).join(', ')})` : ''));
  }

  // deplasările în afara destinației de lucru — numai ale mașinilor care chiar lucrează aici
  for (const d of deplasari(ptsSapt, ruteSchelet, casaC)) {
    if (d.parc) continue;             // reparație la Bălți — nu intră nicăieri (Ion, 24.09)
    const sat = celMaiApropiatSat(S, d.varf);
    toateDeplasarile.push({ masina: v.masina, zi: ziLucru(d.de_la),
      de_la: local(d.de_la).toISOString().slice(11, 16),
      pana_la: local(d.pana_la).toISOString().slice(11, 16),
      ore: +((new Date(d.pana_la) - new Date(d.de_la)) / 3600000).toFixed(1),
      km: +d.km.toFixed(1), departare: +d.max.toFixed(1),
      fel: d.parc ? 'reparație' : 'de lămurit',
      unde: d.parc ? 'parcul de la Bălți' : (sat ? `${sat.n} + ${n1(sat.d)} km` : '—') });
  }

  // Se compară pe ACELEAȘI zile. 189OMM ieșea −11%: baza avea 7 zile, eu 5 — cele două în plus
  // erau sâmbăta și duminica, în care mașina n-a mișcat deloc, iar baza cârpise 35,9 km pe
  // fiecare (km_patched = km_total). Alea nu-s kilometri, sunt un gol de semnal umplut.
  const b = kmBaza.get(v.masina);
  if (b && b.km > 0) {
    const zileMele = new Set(zile.filter(z => (v.kmZi.get(z) || 0) > 20));
    let bAceleasi = 0, bFantoma = 0, zFantoma = [];
    for (const [z, km] of b.peZi) { if (zileMele.has(z)) bAceleasi += km; else { bFantoma += km; zFantoma.push(z); } }
    const mieKm = azi * kmZile.length;
    const dif = bAceleasi ? (mieKm / bAceleasi - 1) * 100 : 0;
    rec.km_baza = { km: +bAceleasi.toFixed(1), zile: zileMele.size, km_aici: +mieKm.toFixed(1),
      dif: +dif.toFixed(1), fantoma_km: +bFantoma.toFixed(1), fantoma_zile: zFantoma.length };
    if (Math.abs(dif) > 10) rec.steaguri.push(
      `km-ii nu se potrivesc cu baza pe aceleași ${zileMele.size} zile: aici ${n1(mieKm)}, ` +
      `în lde_vehicle_gps_daily ${n1(bAceleasi)} — ${(dif > 0 ? '+' : '') + dif.toFixed(1)}%`);
    if (zFantoma.length) rec.note = (rec.note || []).concat(
      `baza mai are ${n1(bFantoma)} km în ${zFantoma.length} ${zFantoma.length === 1 ? 'zi' : 'zile'} ` +
      `(${zFantoma.map(z => z.slice(5)).join(', ')}) în care urma n-arată mișcare — gol de semnal cârpit, nu drum`);
  } else rec.steaguri.push('n-are km scriși în lde_vehicle_gps_daily — km-ii de aici n-au cu ce fi verificați');

  masini.push(rec);
}

for (const t of steagCasaFaraPunct) steaguri.push({ fel: 'casă fără coordonată', text: t });
for (const x of doarTrecute) steaguri.push({ masina: x.masina, fel: 'doar în trecere',
  text: `a trecut pe la poartă ${x.zile} ${x.zile === 1 ? 'zi' : 'zile'} (${n1(x.ore)} ore) — ` +
    'n-a lucrat aici, deci nu intră în raport' });

// rutele din schelet pe care nu le-a dus nimeni
for (const r of S.rute) {
  if (!r.etalon) { steaguri.push({ fel: 'rută fără etalon', text: `${r.id} n-are etalon în schelet` }); continue; }
  if (!ruteFolosite.has(r.id)) steaguri.push({ fel: 'rută nefolosită',
    text: `${r.id} ${r.capat} n-a fost dusă de nicio mașină în săptămâna asta` });
}

// ─── totaluri ────────────────────────────────────────────────────────────────
const aleUzinei = masini;   // în `masini` intră de acum numai cele care au lucrat la uzină
const S_ = f => aleUzinei.reduce((s, m) => s + Math.max(0, f(m) || 0), 0);
const total = { r1: S_(m => m.r1?.lei), r3: S_(m => m.r3?.lei),
  masini_uzina: aleUzinei.length,
  masini_r1: aleUzinei.filter(m => (m.r1?.lei || 0) > 0).length,
  masini_r3: aleUzinei.filter(m => (m.r3?.lei || 0) > 0).length };

// ─── tipărit ─────────────────────────────────────────────────────────────────
console.log('mașină          tip            zile  ore   km/zi   rute            4×rute   la uz.  parc  aiurea   R1 lei   R3 lei');
for (const m of masini.sort((a, b) => (b.r1?.lei || 0) - (a.r1?.lei || 0))) {
  console.log(
    `${m.masina.padEnd(15)} ${(m.tip || '—').padEnd(13)} ${String(m.zile_lucrate).padStart(4)} ` +
    `${String(Math.round(m.ore_poarta || 0)).padStart(4)}h ` +
    `${n1(m.azi).padStart(6)}  ${m.rute.map(r => r.id).join('+').padEnd(14)} ` +
    `${(m.rutele_de_4 != null ? n1(m.rutele_de_4) : '—').padStart(7)} ` +
    `${(m.alte_la_uzina != null ? n1(m.alte_la_uzina) : '—').padStart(6)} ` +
    `${(m.alte_la_parc != null ? n1(m.alte_la_parc) : '—').padStart(6)} ` +
    `${(m.alte_aiurea != null ? n1(m.alte_aiurea) : '—').padStart(7)} ` +
    `${(m.r1 ? n0(m.r1.lei) : '—').padStart(8)} ${(m.r3 ? n0(m.r3.lei) : '—').padStart(8)}`);
  for (const s of m.steaguri) console.log(`                 ⚠ ${s}`);
  for (const s of (m.note || [])) console.log(`                 ⓘ ${s}`);
}
console.log(`\n${total.masini_uzina} mașini au lucrat la uzină (cel puțin ${ZILE_MIN_LEAR} zile la poartă)` +
  (doarTrecute.length ? ` · ${doarTrecute.length} doar în trecere, scoase din raport: ` +
    doarTrecute.map(x => `${x.masina} (${x.zile} ${x.zile === 1 ? 'zi' : 'zile'})`).join(', ') : ''));
console.log(`REGULA 1 — la uzină:            ${total.masini_r1} mașini · ${n0(total.r1)} lei/lună`);
console.log(`REGULA 3 — fără drumul de prânz: ${total.masini_r3} mașini · ${n0(total.r3)} lei/lună`);
console.log('(regulile 1 și 3 nu se adună — se compară, mașină cu mașină)');

{
  const a = masini.reduce((s, m) => s + (m.km_baza?.km_aici || 0), 0);
  const b = masini.reduce((s, m) => s + (m.km_baza?.km || 0), 0);
  const dif = b ? (a / b - 1) * 100 : 0;
  total.control = { km_aici: +a.toFixed(1), km_baza: +b.toFixed(1), dif: +dif.toFixed(1) };
  console.log(`\nCONTROLUL KM: raportul ${n1(a)} km · lde_vehicle_gps_daily ${n1(b)} km · ` +
    `${(dif > 0 ? '+' : '') + dif.toFixed(1)}%` + (Math.abs(dif) > 5 ? '  ⚠ prea departe' : '  — se potrivesc'));
}

if (steaguri.length) {
  console.log('\n─── de verificat ───');
  for (const s of steaguri) console.log(`  ${s.masina ? s.masina + ': ' : ''}${s.text}`);
}

console.log(`\n─── deplasări în afara destinației de lucru (peste ${R_DEPLASARE} km) și km brambura (ieșiri de peste ${KM_BRAMBURA_MIN} km) ───`);
if (!toateDeplasarile.length) console.log('  niciuna');
else {
  console.log('  ziua         mașina      ora        ore     km   cât de departe · unde');
  for (const d of toateDeplasarile.sort((a, b) => a.zi.localeCompare(b.zi)))
    console.log(`  ${d.zi}   ${d.masina.padEnd(11)} ${d.de_la}–${d.pana_la}  ${String(d.ore).padStart(4)}  ` +
      `${n1(d.km).padStart(6)}   ${n1(d.departare).padStart(5)} km · ${d.unde}` +
      (d.fel === 'brambura' ? '   [brambura]' : ''));
  const br = toateDeplasarile.filter(d => d.fel === 'brambura');
  if (br.length) console.log(`\n  ${br.length} ieșiri brambura, ${n1(br.reduce((s, d) => s + d.km, 0))} km în săptămână.`);
}

// ─── scris ───────────────────────────────────────────────────────────────────
if (cacheNou) writeFileSync(CALE_CACHE, JSON.stringify(cache, null, 1));

const rezultat = { uzina: UZINA_NUME, saptamina: sapt.luni, pana_la: sapt.duminica,
  schelet_fixat: S.fixat, zile_luna: ZILE_LUNA, masini, steaguri, doar_trecute: doarTrecute,
  deplasari: toateDeplasarile, total };

const CALE_JSON = arg('--json');
if (CALE_JSON) { writeFileSync(CALE_JSON, JSON.stringify(rezultat)); console.log(`\nscris ${CALE_JSON}`); }

if (WRITE) {
  const { error } = await supa.from('lde_analiza_reguli').upsert({
    uzina: UZINA_NUME, saptamina: sapt.luni, rulat_la: new Date().toISOString(),
    date: rezultat, note: `${masini.length} mașini · ${steaguri.length} steaguri · ${toateDeplasarile.length} deplasări`,
  }, { onConflict: 'uzina,saptamina' });
  if (error) { console.error('\nscrierea a picat:', error.message); process.exit(1); }
  console.log(`\nscris în lde_analiza_reguli · ${UZINA_NUME} · ${sapt.luni}`);
} else {
  console.log('\n(fără --write, nimic nu s-a scris în bază)');
}
