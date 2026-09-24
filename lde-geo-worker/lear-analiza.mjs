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
const UZINA_NUME = 'LEAR Ungheni';
const AICI = path.dirname(new URL(import.meta.url).pathname);
const CALE_SCHELET = process.env.LEAR_SCHELET || path.join(AICI, 'lear-schelet.json');
const CALE_CACHE = process.env.LEAR_DRUMURI || path.join(AICI, 'lear-drumuri.json');
// Ce rută face fiecare mașină, pe tura A și pe tura B — confirmat de Ion pe 23.09.2026.
// Lista asta BATE potrivirea automată. Fără ea, ruta se ghicea din geometrie, iar ghicitul
// cădea pe satul unde doarme mașina sau pe un sat de trecere: A5 Gherman e scurtă, trece pe
// lângă uzină, și o «duceau» șase mașini în aceeași săptămână.
const CALE_RUTE = process.env.LEAR_RUTE_MASINI || path.join(AICI, 'lear-rute-masini.json');
const VALHALLA = process.env.VALHALLA_URL || 'http://localhost:8002';

const POARTA = { lat: 47.2230, lon: 27.8016 };
const R_POARTA = 0.7;          // km — raza în care mașina «e la uzină»
const SALT_KM = 5;             // peste atât între două puncte = glitch GPS, se aruncă
const R_RUTA = 0.45;           // km — cât de aproape trebuie să treacă urma de un punct al rutei
const ACOPERIRE = 0.65;        // cât din forma rutei trebuie atinsă ca s-o socotim dusă
const R_DEPLASARE = 15;        // km — peste atât de tot ce e lucrul ei = deplasare în afară
// Punct în afara țării = punct stricat. Fără filtrul ăsta, un singur rând aiurea dădea o
// «deplasare» de 5160 km de Chetriș, fiindcă distanța se socotește pe punctul brut.
const TARA = { latMin: 45.3, latMax: 48.7, lonMin: 26.4, lonMax: 30.3 };
const inTara = p => p.lat >= TARA.latMin && p.lat <= TARA.latMax && p.lon >= TARA.lonMin && p.lon <= TARA.lonMax;
const PAUZA_MIN = 20;          // min — stat pe loc peste atât = sfârșit de cursă
const R_STAT = 0.3;            // km — cât de strâns trebuie să stea ca să numărăm pauză
const R_ACASA = 2;             // km — cât de aproape de sat înseamnă «a ajuns acasă»
const R_CULOAR = 1.2;          // km — lățimea culoarului dintre casă și capătul rutei
const ZILE_LUNA = 21.7;        // zile lucrătoare pe lună, pentru lei
// Ion, 24.09: «mașinile trebuie verificate doar cele care lucrează la LEAR, cel mai probabil
// 043 a venit pe timp scurt». O mașină care a trecut pe la poartă o zi–două nu e a uzinei;
// cifrele ei n-au ce căuta în totaluri, dar se arată, ca să se vadă că a fost pe acolo.
const ZILE_MIN_LEAR = 4;       // zile la poartă din săptămână, ca s-o socotim a uzinei

// Lei pe km, pe tip. Nu există tabel în bază (doar consum l/100km în lde_vehicle_norms), deci
// stau aici, ca în analiza de până acum: combustibil + cauciucuri + întreținere.
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
    // punctele pe care le verificăm: forma plină a turului, rărită, plus capătul
    const f = [...(r.g?.tur?.plin || []), ...(r.g?.retur?.plin || [])];
    r._puncte = f.filter((_, i) => i % 3 === 0);
    r._capatC = (r.g?.tur?.sate || []).find(s => s.n === r.capat)?.c
             ?? (r.g?.retur?.sate || []).find(s => s.n === r.capat)?.c ?? null;
    r._sateC = [...(r.g?.tur?.sate || []), ...(r.g?.retur?.sate || [])];
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
      body: JSON.stringify({ locations: [{ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }],
        costing: 'bus', directions_options: { units: 'kilometers' } }) });
    if (!res.ok) { cache[eticheta] = null; cacheNou = true; return null; }
    const j = await res.json();
    const km = j?.trip?.summary?.length ?? null;
    const forma = (j?.trip?.legs || []).flatMap(l => l.shape ? decodeaza(l.shape) : []);
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
  const laPoarta = new Set(near.map(n => String(n.id)));
  const flota = devs.filter(d => laPoarta.has(String(d.id)) || TIP_MASINA[d.CarName]);

  const out = [];
  for (const d of flota) {
    const { rows } = await t.query(
      `SELECT w_date,x,y FROM track WHERE id=$1 AND w_date>=$2 AND w_date<$3 ORDER BY w_date`,
      [d.id, de_la, pana_la]);
    if (rows.length < 50) continue;
    const pts = [], kmZi = new Map(), zilePoarta = new Set();
    let prev = null, minPoarta = 0;
    for (const r of rows) {
      const p = { lat: nmea(Number(r.x)), lon: nmea(Number(r.y)), t: new Date(r.w_date) };
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
function rutePotrivite(v, S) {
  const g = grila(v.pts);
  const gasite = [];
  for (const r of S.rute) {
    if (!r._puncte?.length || !r.etalon) continue;
    // capătul rutei trebuie atins: fără asta, o rută scurtă de lângă uzină pare dusă de toți
    if (!r._capatC || !aproape(g, r._capatC, 1.0)) continue;
    let atinse = 0;
    for (const p of r._puncte) if (aproape(g, p, R_RUTA)) atinse++;
    const acop = atinse / r._puncte.length;
    if (acop >= ACOPERIRE) gasite.push({ id: r.id, tura: r.tura, capat: r.capat, loc: r.loc,
      etalon: r.etalon, acoperire: +acop.toFixed(2), capatC: r._capatC });
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
// Ruta fixată din listă, verificată pe urma săptămânii. Potrivirea geometrică rămâne, dar
// numai ca VERIFICARE: spune dacă mașina chiar a mers pe ruta ei sau a făcut altceva.
function repartizeazaDinLista(masina, candidati, S, RM) {
  const fix = RM.get(masina);
  if (!fix) return { alese: [], dupaLista: false };
  const alese = [];
  for (const tura of ['A', 'B']) {
    const id = fix[tura]; if (!id) continue;
    const r = S.rute.find(x => x.id === id);
    if (!r || !r.etalon) continue;
    const vazut = candidati.find(c => c.id === id);
    alese.push({ id: r.id, tura, capat: fix.capat?.[tura] || r.capat, loc: r.loc,
      etalon: r.etalon, capatC: r._capatC, confirmat: !!vazut,
      acoperire: vazut ? vazut.acoperire : 0 });
  }
  return { alese, dupaLista: true };
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
function alteCurse(pts, ruteObj, culoare, zileLucrate) {
  const peRuta = grila([].concat(...ruteObj.map(r =>
    (r._puncte || []).map(c => ({ lat: c[0], lon: c[1] })))));
  const peCasa = grila([].concat(...culoare.map(f => f.map(c => ({ lat: c[0], lon: c[1] })))));
  let km = 0, prev = null;
  for (const p of pts) {
    if (prev) {
      const dk = hav(prev, p);
      if (dk < SALT_KM) {
        const mij = { lat: (prev.lat + p.lat) / 2, lon: (prev.lon + p.lon) / 2 };
        const eRuta = aproape(peRuta, [mij.lat, mij.lon], R_RUTA);
        const eCasa = peCasa.size && aproape(peCasa, [mij.lat, mij.lon], R_CULOAR);
        if (!eRuta && !eCasa) km += dk;
      }
    }
    prev = p;
  }
  return zileLucrate ? km / zileLucrate : 0;
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
      if (!cur) cur = { de_la: p.t, pana_la: p.t, km: 0, max: d, varf: p };
      else { cur.pana_la = p.t; if (prev) { const dk = hav(prev, p); if (dk < SALT_KM) cur.km += dk; }
             if (d > cur.max) { cur.max = d; cur.varf = p; } }
    } else inchide();
    prev = p;
  }
  inchide();
  return out;
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

function coordSat(S, nume) {
  for (const r of S.rute) for (const s of (r._sateC || [])) if (s.n === nume) return s.c;
  const l = dupaNume.get(nume);
  if (l && hav(l, POARTA) <= MAX_DE_LA_UZINA) return [l.lat, l.lon];
  return null;
}

// ─── numele localității celei mai apropiate, din satele scheletului ──────────
function celMaiApropiatSat(S, p) {
  let best = null;
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
    const x = pe.get(nr) || { km: 0, zile: 0 };
    x.km += Number(r.km_total); x.zile++;
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
function casaDinUrma(pts) {
  let best = null, ancora = null, deCand = null, ultim = null;
  const inchide = () => {
    if (!ancora || !deCand || !ultim) return;
    const min = (ultim - deCand) / 60000;
    const h = (local(deCand).getUTCHours());
    if (min >= 240 && (h >= 17 || h < 5) && (!best || min > best.min)) best = { p: ancora, min };
  };
  for (const p of pts) {
    if (ancora && hav(ancora, p) <= R_STAT) { ultim = p.t; continue; }
    inchide(); ancora = p; deCand = p.t; ultim = p.t;
  }
  inchide();
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

const masini = [], steaguri = [], toateDeplasarile = [], steagCasaFaraPunct = [];
const ruteFolosite = new Set();

// trecerea întâi: ce rute ar putea fi ale fiecărei mașini
const candidati = new Map();
const auLucrat = [];
for (const v of flota) {
  const zilePoarta = [...v.zilePoarta].filter(inSapt);
  if (!zilePoarta.length) {
    if (TIP_MASINA[v.masina]) steaguri.push({ masina: v.masina, fel: 'n-a lucrat',
      text: 'n-a fost la poarta uzinei în săptămâna asta' });
    continue;
  }
  auLucrat.push(v);
  candidati.set(v.masina, rutePotrivite(v, S));
}
const RM = citesteRuteMasini();

for (const v of auLucrat) {
  const zile = [...v.kmZi.keys()].filter(inSapt);
  const zilePoarta = [...v.zilePoarta].filter(inSapt);
  const kmZile = zile.map(z => v.kmZi.get(z)).filter(k => k > 20);
  const tip = TIP_MASINA[v.masina] || null;
  const lk = tip ? LEI_TIP[tip] : null;

  const cand = candidati.get(v.masina) || [];
  const { alese, dupaLista } = repartizeazaDinLista(v.masina, cand, S, RM);
  const toate = cand;
  for (const r of alese) ruteFolosite.add(r.id);
  // se lucrează numai pe punctele săptămânii: citirea aduce o zi în plus de fiecare parte,
  // ca fereastra de 03:00 să fie întreagă, dar ele nu intră în socoteală
  const ptsSapt = v.pts.filter(p => inSapt(ziLucru(p.t)));
  const ruteSchelet = S.rute.filter(r => alese.some(a => a.id === r.id));
  let casa = case_[v.masina] || null;
  let casaC = casa ? coordSat(S, casa) : null;
  let casaDedusa = false;
  if (!casaC) {
    const d = casaDinUrma(v.pts);
    if (d) { casa = d.nume; casaC = d.c; casaDedusa = true; }
  }
  if (casa && !casaC) steagCasaFaraPunct.push(
    `${v.masina}: satul ${casa} nu e nici pe rute, nici în indexul de localități — n-avem coordonata lui`);

  const azi = kmZile.length ? kmZile.reduce((s, x) => s + x, 0) / kmZile.length : 0;
  const rec = { masina: v.masina, tip, lei_km: lk, casa,
    casa_dedusa: casaDedusa || undefined,
    a_uzinei: zilePoarta.length >= ZILE_MIN_LEAR,
    zile_lucrate: zilePoarta.length, ore_poarta: +(v.minPoarta / 60).toFixed(1),
    zile_masurate: kmZile.length, azi: +azi.toFixed(1),
    rute: alese.map(r => ({ id: r.id, tura: r.tura, capat: r.capat, loc: r.loc,
      etalon: r.etalon, acoperire: r.acoperire })),
    rute_toate: toate.map(r => r.id), steaguri: [] };
  if (!rec.a_uzinei) rec.steaguri.push(
    `a fost la poartă doar ${zilePoarta.length} ${zilePoarta.length === 1 ? 'zi' : 'zile'} din săptămână ` +
    `(${n1(v.minPoarta / 60)} ore) — n-o socotim a uzinei, cifrele ei nu intră în totaluri`);
  if (!dupaLista) rec.steaguri.push('nu e în lista de rute pe mașini — nu știm ce rute ar trebui să facă');
  for (const r of alese) if (!r.confirmat) rec.steaguri.push(
    `ruta ei ${r.id} ${r.capat} nu se vede în urma săptămânii — ori n-a făcut-o, ori a mers altfel`);
  // pragul e mult mai sus decât la potrivirea obișnuită: o rută scurtă de lângă uzină e atinsă
  // de aproape toată lumea, iar steagul ăsta trebuie să însemne «chiar a dus altă rută»
  // A5 Gherman (25 km) ieșea 100% la toată lumea: forma ei stă în întregime pe șoseaua spre
  // Ungheni, pe care merge oricine. Rutele scurte nu pot fi deosebite de drumul comun, deci
  // steagul se dă numai pe rute lungi, care chiar ies din corider.
  const straine = toate.filter(t => !alese.some(a => a.id === t.id) && t.acoperire >= 0.9 && t.etalon >= 35)
    .map(t => `${t.id} (${Math.round(t.acoperire * 100)}%)`);
  if (straine.length) rec.steaguri.push(
    `a mers și pe ${straine.join(', ')} — rute care nu-s ale ei în listă`);

  if (!tip) rec.steaguri.push('la poartă, dar n-are tip cunoscut — lipsește din tabelul de costuri');
  if (alese.length < 2) rec.steaguri.push(
    `a dus ${alese.length} rută din schelet în săptămâna asta, nu două — nu se poate socoti ziua`);
  if (casaDedusa) rec.steaguri.push(
    `n-are noapte scrisă în bază; am luat-o din urmă — cea mai lungă staționare de noapte e la ${casa}`);
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
    let dCasa = 0, culoare = [], lipsaDrum = false;
    for (const r of alese) {
      if (!r.capatC) { lipsaDrum = true; break; }
      const d = await drum(casaC, r.capatC, `${casa}|${r.capat}`);
      if (!d) { lipsaDrum = true; break; }
      dCasa += d.km; culoare.push(d.forma || []);
    }
    // «alte curse»: munca în plus, măsurată — nici rută, nici culoar de acasă. Nu dispare sub
    // nicio regulă, deci se adună la ziua nouă la amândouă.
    const alte = alteCurse(ptsSapt, ruteSchelet, culoare, kmZile.length);
    rec.etalon_s1 = alese[0].etalon; rec.etalon_s2 = alese[1].etalon;
    rec.rutele_de_4 = +patru.toFixed(1);
    rec.alte = +alte.toFixed(1);

    // regula 1: ziua = 4 × latura fiecărui schimb + alte curse
    const z1 = patru + alte;
    rec.r1 = { zi: +z1.toFixed(1), km: +(azi - z1).toFixed(1),
      lei: Math.round((azi - z1) * lk * ZILE_LUNA) };

    // regula 3: plin (2 × fiecare rută) + de acasă la capete + de la uzină la capete + alte
    if (!lipsaDrum) {
      const z3 = 2 * sumaEtalon + dCasa + sumaEtalon + alte;
      rec.d_casa = +dCasa.toFixed(1); rec.d_uzina = +sumaEtalon.toFixed(1);
      rec.r3 = { zi: +z3.toFixed(1), km: +(azi - z3).toFixed(1),
        lei: Math.round((azi - z3) * lk * ZILE_LUNA) };
    } else rec.steaguri.push('Valhalla n-a dat drumul de acasă la capăt — regula 3 nu se poate socoti');

    if (patru > azi) rec.steaguri.push(
      `cele patru drumuri pe rută fac ${n1(patru)} km, iar ea a condus ${n1(azi)} — n-a făcut ` +
      'patru drumuri complete, regula 1 nu se poate judeca la ea');
    if (alte > 40) rec.steaguri.push(
      `alte curse ${n1(alte)} km/zi — modelul explică prea puțin din ziua ei`);
  }

  // deplasările în afara destinației de lucru
  for (const d of deplasari(ptsSapt, ruteSchelet, casaC)) {
    const sat = celMaiApropiatSat(S, d.varf);
    toateDeplasarile.push({ masina: v.masina, zi: ziLucru(d.de_la),
      de_la: local(d.de_la).toISOString().slice(11, 16),
      pana_la: local(d.pana_la).toISOString().slice(11, 16),
      ore: +((new Date(d.pana_la) - new Date(d.de_la)) / 3600000).toFixed(1),
      km: +d.km.toFixed(1), departare: +d.max.toFixed(1),
      unde: sat ? `${sat.n} + ${n1(sat.d)} km` : '—' });
  }

  const b = kmBaza.get(v.masina);
  if (b && b.km > 0) {
    const mieKm = azi * kmZile.length;
    const dif = (mieKm / b.km - 1) * 100;
    rec.km_baza = { km: +b.km.toFixed(1), zile: b.zile, km_aici: +mieKm.toFixed(1), dif: +dif.toFixed(1) };
    if (Math.abs(dif) > 10) rec.steaguri.push(
      `km-ii nu se potrivesc cu baza: aici ${n1(mieKm)} km pe ${kmZile.length} zile, ` +
      `în lde_vehicle_gps_daily ${n1(b.km)} pe ${b.zile} — ${(dif > 0 ? '+' : '') + dif.toFixed(1)}%`);
  } else rec.steaguri.push('n-are km scriși în lde_vehicle_gps_daily — km-ii de aici n-au cu ce fi verificați');

  masini.push(rec);
}

for (const t of steagCasaFaraPunct) steaguri.push({ fel: 'casă fără coordonată', text: t });

// rutele din schelet pe care nu le-a dus nimeni
for (const r of S.rute) {
  if (!r.etalon) { steaguri.push({ fel: 'rută fără etalon', text: `${r.id} n-are etalon în schelet` }); continue; }
  if (!ruteFolosite.has(r.id)) steaguri.push({ fel: 'rută nefolosită',
    text: `${r.id} ${r.capat} n-a fost dusă de nicio mașină în săptămâna asta` });
}

// ─── totaluri ────────────────────────────────────────────────────────────────
const aleUzinei = masini.filter(m => m.a_uzinei);
const S_ = f => aleUzinei.reduce((s, m) => s + Math.max(0, f(m) || 0), 0);
const total = { r1: S_(m => m.r1?.lei), r3: S_(m => m.r3?.lei),
  masini_uzina: aleUzinei.length,
  masini_r1: aleUzinei.filter(m => (m.r1?.lei || 0) > 0).length,
  masini_r3: aleUzinei.filter(m => (m.r3?.lei || 0) > 0).length };

// ─── tipărit ─────────────────────────────────────────────────────────────────
console.log('mașină          tip            zile  ore   km/zi   rute            4×rute   alte   R1 lei   R3 lei');
for (const m of masini.sort((a, b) => (b.r1?.lei || 0) - (a.r1?.lei || 0))) {
  console.log(
    `${m.masina.padEnd(15)} ${(m.tip || '—').padEnd(13)} ${String(m.zile_lucrate).padStart(4)} ` +
    `${String(Math.round(m.ore_poarta || 0)).padStart(4)}h ` +
    `${n1(m.azi).padStart(6)}  ${m.rute.map(r => r.id).join('+').padEnd(14)} ` +
    `${(m.rutele_de_4 != null ? n1(m.rutele_de_4) : '—').padStart(7)} ` +
    `${(m.alte != null ? n1(m.alte) : '—').padStart(6)} ` +
    `${(m.r1 ? n0(m.r1.lei) : '—').padStart(8)} ${(m.r3 ? n0(m.r3.lei) : '—').padStart(8)}`);
  for (const s of m.steaguri) console.log(`                 ⚠ ${s}`);
}
console.log(`\n${total.masini_uzina} mașini ale uzinei (cel puțin ${ZILE_MIN_LEAR} zile la poartă), ` +
  `${masini.length - total.masini_uzina} doar în trecere`);
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

console.log(`\n─── deplasări în afara destinației de lucru, peste ${R_DEPLASARE} km ───`);
if (!toateDeplasarile.length) console.log('  niciuna');
else {
  console.log('  ziua         mașina      ora        ore     km   cât de departe · unde');
  for (const d of toateDeplasarile.sort((a, b) => a.zi.localeCompare(b.zi)))
    console.log(`  ${d.zi}   ${d.masina.padEnd(11)} ${d.de_la}–${d.pana_la}  ${String(d.ore).padStart(4)}  ` +
      `${n1(d.km).padStart(6)}   ${n1(d.departare).padStart(5)} km · ${d.unde}`);
}

// ─── scris ───────────────────────────────────────────────────────────────────
if (cacheNou) writeFileSync(CALE_CACHE, JSON.stringify(cache, null, 1));

const rezultat = { uzina: UZINA_NUME, saptamina: sapt.luni, pana_la: sapt.duminica,
  schelet_fixat: S.fixat, zile_luna: ZILE_LUNA, masini, steaguri,
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
