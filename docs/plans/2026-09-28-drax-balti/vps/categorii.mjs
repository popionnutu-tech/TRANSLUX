// Drăxlmaier F2 — pasul 3: ziua fiecărei mașini din flota săptămânii, tăiată în intervale cu O categorie
// (tabela 1–9 din planul-umbrelă docs/plans/2026-09-26-uzina-analist-draxlmaier.md, pasul 3; modelul
// briceni/cod/livrare.mjs:5-16,149-192 + regula ocolului din RaportBriceni.tsx:200-205, 26.09).
//   1 cu oameni ..... tur (capăt → poartă) / retur (poartă → capăt) cu schimb (din ferestre)
//   2 livrare ....... primul drum al zilei de la locul nopții până la prima cursă și ultimul spre locul nopții, MINUS
//                     partea de pe culoarul liniei acoperită de 3(a); pe acasă (≥ 20 min) între două curse care nu sunt
//                     perechea aceluiași schimb: DOAR ocolul (drumul peste drumul direct, Valhalla × 1,05)
//   3 gol pe rută ... (a) partea de pe culoarul liniei (≤ 1 km de drumul scheletului) a livrării care atinge poarta,
//                     cel mult E pe drumul de dimineață și E pe cel de seară (= 2 × lungimea liniei pe zi);
//                     (b) golul dintre două curse ale ACELEIAȘI linii care nu sunt turul și returul aceleiași perechi
//   4 gol între ture  ÎNTREG intervalul dintre turul și returul aceleiași perechi (linie, schimb), fără altă cursă cu
//                     oameni între ele, oriunde ar merge mașina
//   5 parc .......... într-un gol neacoperit de 1–4, drumurile din zona uzinei (≤ 3 km de parc sau de porți) spre / de la
//                     o staționare ≥ 5 min la ≤ 0,5 km de Parcul Bălți și în afara razei porților (§3.4); zi cu curse
//   6 service ....... același lucru în zi fără curse cu oameni
//   7 deplasare ..... gol care iese la > 15 km de porți, de satele liniilor mașinii din ziua aceea și de locul nopții
//   8 legătură ...... golul dintre curse ale unor linii DIFERITE (partea «drum direct» dacă a trecut pe acasă)
//   9 necunoscut .... restul
// Σ intervale = km-ul zilei din urma brută (03:00 → 03:00, salt > 5 km aruncat), ±3 %.
//   node categorii.mjs  →  date/economie-zile.json
import { readFileSync, existsSync } from 'node:fs';
import { D, PORTI, PARC, SAPT, PANA, FER, inFer, hav, poarta, bucata, parcari, tIn, tOut, localToUtc, ziua, zileIntre, dow, saptDe, hhmm, oraLoc, r1, med, kmDrum, salveazaCache, verificaValhalla, scrieAtomic } from './comun.mjs';
// ION-109 (§7.4, §8.6 după migr. 413): zona Bălți = ≤ ZONA_KM de porți sau de parc; distanța față de uzină = minimul față de porți și parc
const departeUz = (p) => Math.min(hav(p, PARC), ...PORTI.map((q) => hav(p, q)));

export const PR = { CASA_KM: 0.5, CASA_STAT_MIN: 20, NOAPTE: [30, 330], NOAPTE_MIN_MIN: 45, CORIDOR_KM: 1, DEPLASARE_KM: 15,
  PARC_STAT_MIN: 5, GPS_PESTE_DRUM: 1.05, BILANT_PCT: 3, STAT_KM: 0.2, POARTA_EXTRA: 0.1, ZONA_KM: 3 };   // ZONA_KM = zona uzinei (porți + parc), S9
export const CAT = ['cuOameni', 'livrare', 'golRuta', 'golTure', 'parc', 'service', 'deplasare', 'legatura', 'necunoscut'];
const F = JSON.parse(readFileSync(`${D}/economie-flota.json`, 'utf8'));
const O = JSON.parse(readFileSync(`${D}/economie-obs.json`, 'utf8')).curse;
const S = JSON.parse(readFileSync(`${D}/schelet-ideal.json`, 'utf8'));
const ALIAS_M = { '0357544371228442': '880RNK', '350KAJ#2284': '350KAJ' };
const numeM = (m) => ALIAS_M[m] ?? m;
const devDe = new Map(); for (const d of F.dispozitive) (devDe.get(numeM(d.m)) ?? devDe.set(numeM(d.m), []).get(numeM(d.m))).push(d.m);

// ---- liniile: etalonul (pe schimb unde s1 și s2 diferă > 25 %, Drăxlmaier §6.6), clasa, culoarul, satele
const locuriRuta = new Map(); for (const l of S) if (l.locuri) locuriRuta.set(l.ruta, Math.max(locuriRuta.get(l.ruta) ?? 0, l.locuri));
export const LINII = new Map(S.map((l) => {
  const ks = (s) => { const k = l.schimburi?.[s]?.km; return k?.tur && k?.retur ? (k.tur + k.retur) / 2 : null; };
  const e1 = ks('s1'), e2 = ks('s2');
  const peSchimb = e1 && e2 && Math.abs(e1 - e2) / Math.max(e1, e2) > 0.25;
  const E = { s1: peSchimb ? +e1.toFixed(1) : l.km ?? null, s2: peSchimb ? +e2.toFixed(1) : l.km ?? null };
  const drum = (l.drum ?? []).map(([lat, lon]) => ({ lat, lon }));
  const indes = []; for (let i = 1; i < drum.length; i++) { const a = drum[i - 1], b = drum[i]; const n = Math.max(1, Math.ceil(hav(a, b) / 0.3));
    for (let k = 0; k < n; k++) indes.push({ lat: a.lat + (b.lat - a.lat) * k / n, lon: a.lon + (b.lon - a.lon) * k / n }); }
  if (drum.length) indes.push(drum.at(-1));
  return [`${l.ruta}|${l.linie}`, { ruta: l.ruta, linie: l.linie, capat: l.capat, capatC: l.capatC ? { lat: l.capatC[0], lon: l.capatC[1] } : null,
    E, peSchimb, locuri: l.locuri ?? locuriRuta.get(l.ruta) ?? null, locuriDinRuta: !l.locuri, coridor: indes,
    sate: (l.sateDrum ?? []).map((s) => ({ n: s.n, lat: s.c[0], lon: s.c[1] })), gps: !!l.gps }];
}));
const minDist = (p, arr) => { let m = Infinity; for (const q of arr) { const d = hav(p, q); if (d < m) m = d; } return m; };

// ---- ziua: punctele unui autobuz (dispozitivul cu cele mai multe puncte în fereastră)
const cacheZi = new Map();
const ziFis = (dev, z) => { const k = `${dev}|${z}`; if (cacheZi.has(k)) return cacheZi.get(k); const f = `${D}/economie-urme/${dev}/${z}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; if (cacheZi.size > 60) cacheZi.delete(cacheZi.keys().next().value); cacheZi.set(k, v); return v; };
function puncte(m, z) {
  let best = null;
  for (const dev of devDe.get(m) ?? [m]) { const d = ziFis(dev, z); if (d && (!best || d.n > best.n)) best = { ...d, dev }; }
  return best;
}
/** Locul nopții care se termină dimineața zilei z: cea mai lungă staționare care se suprapune cu z 00:30 → 05:30. */
export function loculNoptii(m, z) {
  const d = puncte(m, z); if (!d) return null;
  const P = parcari(d.pts), ta = localToUtc(z, PR.NOAPTE[0]).getTime(), tb = localToUtc(z, PR.NOAPTE[1]).getTime();
  let best = null, bd = 0;
  for (const x of P) { if (!x.stat) continue; const o = Math.min(x.t1, tb) - Math.max(x.t0, ta); if (o > bd) { bd = o; best = x; } }
  if (!best || bd < PR.NOAPTE_MIN_MIN * 60e3) return null;
  const n = { lat: best.lat, lon: best.lon, min: Math.round(bd / 60e3) };
  n.tip = hav(n, PARC) <= PARC.r && !poarta(n) ? 'parc' : poarta(n, 0.3) ? 'poarta' : 'loc';   // noaptea parcul se ia înaintea razei lărgite a porții VEST (0,70 km de parc)
  return n;
}

// ---- regula Briceni §5.4 portată (triaj F2 r1, B2): cursa cu rută din AFARA ferestrelor, cu urcări (opriri 30 s – 5 min)
// în ≥ 2 sate ale liniei (satele scheletului + capătul, ≤ 1 km; fără opririle la ≤ 0,5 km de locul nopții și din raza
// porților), e cursă CU OAMENI: primește schimbul ferestrei celei mai apropiate (distanță circulară pe ceas) și steagul
// «în afara ferestrei». Doar partea plină (tur: capăt → poartă; retur: poartă → capăt).
const distFer = (h, [a, b]) => { const x = ((h % 24) + 24) % 24; const pts = [a % 24, b % 24];
  const inside = a <= b ? (x >= a && x <= b) || (x + 24 >= a && x + 24 <= b) : false; if (inside) return 0;
  return Math.min(...pts.map((p) => { const d = Math.abs(x - p); return Math.min(d, 24 - d); })); };
export const PROMOVATE = [];
// Triaj r2 (B9): NU se promovează (1) turul lipit (≤ 5 min) de un retur al aceleiași mașini — e coada returului (744ARF 00:58);
// (2) turul sosit în fereastra retur s2 (23:00–01:45) — e venirea la poartă pentru returul s2 (388ASB 23:03); (3) opririle din
// orașe (> 10.000 loc.: Bălți cu Autogara și Dacia = ≤ 5 km de porți; Drochia, Fălești, Sîngerei, Rîșcani, Florești, Edineț,
// Soroca) nu sunt «sate» (semafor, intersecție).
// Triaj r3 (B15): orașele după CRITERIU, nu pe nume: localitățile OSM «place = city | town» (orașele și municipiile Moldovei,
// inclusiv centrele de raion; tabela `localities` din bază n-are tipul) — satul liniei cu numele unui astfel de oraș, la ≤ 3 km;
// plus Bălți = orice punct la ≤ 3 km de o poartă (Dacia, Autogara).
const ORASE_PT = []; for (const line of readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  const cl = line.replace(/\x1e/g, '').trim(); if (!cl) continue; let f; try { f = JSON.parse(cl); } catch { continue; }
  const pl = f.properties?.place; if (pl !== 'city' && pl !== 'town') continue;
  const [lon, lat] = f.geometry.coordinates; ORASE_PT.push({ n: f.properties['name:ro'] ?? f.properties.name, lat, lon }); }
const numeK = (x) => String(x ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
// satul liniei e oraș dacă poartă NUMELE unui oraș OSM aflat la ≤ 3 km (nu doar vecinătatea: Vărvăreuca lângă Florești rămâne sat)
export const eOras = (s) => PORTI.some((g) => hav(s, g) <= 3) || ORASE_PT.some((t) => hav(s, t) <= 3 && numeK(t.n) === numeK(s.n));
const retururiM = new Map(); for (const o of O.filter((o) => o.sens === 'retur')) (retururiM.get(o.m) ?? retururiM.set(o.m, []).get(o.m)).push(o);
export const RESPINSE = [];
// A doua frază a regulii Briceni §5.4: «un drum care pornește de la poartă în afara ferestrelor de retur e gol» — deci doar
// TURURILE (sosiri la poartă) se promovează; retururile din afara ferestrelor rămân goale (briceni/cod/livrare.mjs:112-115).
for (const o of O.filter((o) => !o.schimb && o.sens === "tur")) {
  const Lx = LINII.get(`${o.ruta}|${o.linie}`); if (!Lx) continue;
  const sate = [...Lx.sate, ...(Lx.capatC ? [{ n: Lx.capat, ...Lx.capatC }] : [])];
  const a = o.sens === 'tur' ? Math.min(o.tCap, o.t1) : o.t0, b = o.sens === 'tur' ? o.t1 : Math.max(o.t0, o.tCap);
  const nopti = [loculNoptii(o.m, o.zi), loculNoptii(o.m, ziua(o.zi, 1))].filter(Boolean);
  const opr = [o.zi, ziua(o.zi, 1)].flatMap((z) => puncte(o.m, z)?.opriri ?? [])
    .filter((p) => p.t0 >= a && p.t1 <= b && p.sec >= 30 && p.sec < 300 && !poarta(p, 0.3) && !nopti.some((n) => hav(p, n) <= PR.CASA_KM));
  const satU = [...new Set(opr.map((p) => { const s = sate.find((q) => hav(p, q) <= 1); return s && !eOras(s) ? s.n : null; }).filter(Boolean))];
  const satRaw = new Set(opr.map((p) => sate.find((q) => hav(p, q) <= 1)?.n).filter(Boolean));
  if (satU.length < 2) { if (satRaw.size >= 2) RESPINSE.push({ m: o.m, zi: o.zi, lin: `${o.ruta}|${o.linie}`, motiv: 'urcări doar în orașe', sate: [...satRaw] }); continue; }
  const h = o.t1; const ora = new Date(h).toLocaleString('sv-SE', { timeZone: 'Europe/Chisinau' }).slice(11, 16);
  const hh = +ora.slice(0, 2) + +ora.slice(3, 5) / 60;
  // B9-rest: turul începe la tCap (ora la capăt); returul se termină la tCap al lui — lipit = 0 ≤ început − sfârșit ≤ 5 min
  const tStart = Math.min(o.tCap, o.t1);
  const lipit = (retururiM.get(o.m) ?? []).some((r) => r !== o && tStart - Math.max(r.t0, r.tCap) >= 0 && tStart - Math.max(r.t0, r.tCap) <= 5 * 60e3);
  if (lipit || inFer(hh, FER.retur.s2)) { RESPINSE.push({ m: o.m, zi: o.zi, lin: `${o.ruta}|${o.linie}`, ora, motiv: lipit ? 'lipit de un retur' : 'sosit în fereastra retur s2', sate: satU }); continue; }
  const fer = Object.entries(FER[o.sens]).map(([s, f]) => [s, distFer(hh, f)]).sort((x, y) => x[1] - y[1])[0];
  o.schimb = fer[0]; o.inAfara = true; o.laFereastra = +fer[1].toFixed(2); o.urcari = satU;
  PROMOVATE.push({ m: o.m, zi: o.zi, sens: o.sens, lin: `${o.ruta}|${o.linie}`, ora, schimb: fer[0], ore: +fer[1].toFixed(2), sate: satU, plin: o.plin });
}

// ---- cursele cu oameni pe mașină și zi; perechile; jumătățile
const cuSchimb = O.filter((o) => o.schimb);
const peZi = new Map(); for (const o of cuSchimb) { const k = `${o.m}|${o.zi}`; (peZi.get(k) ?? peZi.set(k, []).get(k)).push(o); }
const cheie = (o) => `${o.ruta}|${o.linie}|${o.schimb}`;
const afaraZi = new Map(); for (const o of O.filter((o) => !o.schimb)) { const k = `${o.m}|${o.zi}`; (afaraZi.get(k) ?? afaraZi.set(k, []).get(k)).push(o); }
const existaLa = new Map(); // zi|ruta|linie|schimb|sens → Set mașini
for (const o of cuSchimb) { const k = `${o.zi}|${cheie(o)}|${o.sens}`; (existaLa.get(k) ?? existaLa.set(k, new Set()).get(k)).add(o.m); }

function legsDin(m, z) {
  const L = (peZi.get(`${m}|${z}`) ?? []).map((o) => {
    const t0 = o.sens === 'tur' ? Math.min(o.tCap, o.t1) : o.t0, t1 = o.sens === 'tur' ? o.t1 : Math.max(o.t0, o.tCap);
    return { t0, t1, sens: o.sens, schimb: o.schimb, lin: `${o.ruta}|${o.linie}`, k: cheie(o), plin: o.plin, poarta: o.poarta, inAfara: !!o.inAfara, o };
  }).sort((a, b) => a.t0 - b.t0);
  // perechile: tur urmat de retur pe aceeași (linie, schimb), fără altă cursă între ele — sau cu altele între (perecheLarga)
  for (const l of L) l.pereche = null;
  for (const t of L.filter((l) => l.sens === 'tur')) {
    const r = L.find((x) => x.sens === 'retur' && x.k === t.k && x.t0 >= t.t1 && !x.pereche);
    if (r) { t.pereche = r; r.pereche = t; }
  }
  const jumatati = L.filter((l) => !l.pereche).map((l) => {
    const alt = existaLa.get(`${z}|${l.k}|${l.sens === 'tur' ? 'retur' : 'tur'}`);
    const reala = !!alt && [...alt].some((x) => x !== m);
    // de ce lipsește perechea la mașina asta (doar pentru steag): altă linie a aceleiași rute, același schimb / cursa
    // opusă a aceleiași linii există, dar în afara ferestrelor (schimb null) / nimic
    const opus = l.sens === 'tur' ? 'retur' : 'tur', ruta = l.lin.split('|')[0];
    const motiv = L.some((x) => x !== l && x.sens === opus && x.schimb === l.schimb && x.lin !== l.lin && x.lin.startsWith(ruta + '|')) ? 'alta linie a rutei'
      : (afaraZi.get(`${m}|${z}`) ?? []).some((o) => o.sens === opus && `${o.ruta}|${o.linie}` === l.lin) ? 'in afara ferestrei' : 'nimic';
    return { lin: l.lin, schimb: l.schimb, sens: l.sens, reala, la: reala ? [...alt].filter((x) => x !== m) : [], motiv };
  });
  return { L, jumatati };
}

/** Codex r2 (C3): taie intervalul [g0, g1] al perechii la cursele de prânz; pur, testat sintetic în probe.mjs (P10). */
export function taieLaPranz(g0, g1, linPrev, linNext, runs) {
  const out = []; let c = g0, lin = linPrev;
  const gol = (a, b, l1, l2) => { if (b > a) out.push({ a, b, l1, l2, cat: l1 === l2 ? 'golRuta' : 'legatura', lin: l1 === l2 ? l1 : null, cursa: false, motiv: `interval tur–retur tăiat la o cursă de prânz: ${l1} → ${l2}` }); };
  for (const o of [...runs].sort((x, y) => x.t0 - y.t0)) {
    const a = Math.max(o.t0, c), b = Math.min(o.t1, g1), rl = `${o.ruta}|${o.linie}`;
    gol(c, a, lin, rl);
    if (b > a) out.push({ a, b, l1: rl, l2: rl, cat: 'golRuta', lin: rl, cursa: true, motiv: `cursa de prânz fără fereastră (${o.sens}), ${rl}` });
    c = Math.max(c, b); lin = rl;
  }
  gol(c, g1, lin, linNext);
  return out;
}

/** Clasificarea unei zile. Întoarce bucățile { t0, t1, cat, km, lin, motiv, ... } și totalul. */
async function clasifica(m, z) {
  const d = puncte(m, z); if (!d || !d.pts.length) return null;
  const P = parcari(d.pts);
  const ta = localToUtc(z, 180).getTime(), tb = localToUtc(ziua(z, 1), 180).getTime();
  const total = bucata(P, ta, tb).km;
  const { L, jumatati } = legsDin(m, z);
  const noapteA = loculNoptii(m, z), noapteB = loculNoptii(m, ziua(z, 1));
  const liniiZi = [...new Set(L.map((l) => l.lin))].map((k) => LINII.get(k)).filter(Boolean);
  const ancore = [...PORTI, ...liniiZi.flatMap((l) => [...l.sate, ...(l.capatC ? [l.capatC] : [])]), ...(noapteA ? [noapteA] : []), ...(noapteB ? [noapteB] : [])];
  const seg = [];
  // 1. cursele cu oameni
  const Lw = L.filter((l) => l.t1 > ta && l.t0 < tb);
  for (const l of Lw) { const b = bucata(P, Math.max(l.t0, ta), Math.min(l.t1, tb));
    seg.push({ t0: Math.max(l.t0, ta), t1: Math.min(l.t1, tb), cat: 'cuOameni', km: b.km, lin: l.lin, sens: l.sens, schimb: l.schimb, inAfara: l.inAfara, bpts: b.pts }); }
  // golurile dintre ele
  const goluri = []; let c = ta;
  for (const l of Lw) { if (l.t0 > c) goluri.push({ t0: c, t1: l.t0 }); c = Math.max(c, l.t1); }
  if (c < tb) goluri.push({ t0: c, t1: tb });
  for (const g of goluri) {
    const b = bucata(P, g.t0, g.t1), mv = b.pts;
    const prev = [...Lw].reverse().find((l) => l.t1 <= g.t0), next = Lw.find((l) => l.t0 >= g.t1);
    const base = { t0: g.t0, t1: g.t1, km: b.km, bpts: mv, prev: prev ? `${prev.lin} ${prev.sens} ${prev.schimb}` : null, next: next ? `${next.lin} ${next.sens} ${next.schimb}` : null, prevLin: prev?.lin ?? null, nextLin: next?.lin ?? null };
    if (b.km < PR.STAT_KM) { seg.push({ ...base, cat: 'stat' }); continue; }
    const stari = mv.filter((p) => p.stat);
    const casa = stari.find((x) => (x.t1 - x.t) >= PR.CASA_STAT_MIN * 60e3 && [noapteA, noapteB].some((n) => n && n.tip === 'loc' && hav(x, n) <= PR.CASA_KM));
    // staționarea la parc: ≤ 0,5 km de parc și NU în raza unei porți (zona comună VEST / parc, Drăxlmaier §3.4)
    const parcSt = stari.filter((x) => hav(x, PARC) <= PARC.r && !poarta(x) && (x.t1 - x.t) >= PR.PARC_STAT_MIN * 60e3);
    const minParc = Math.round(parcSt.reduce((a, x) => a + (x.t1 - x.t), 0) / 60e3);
    const departe = mv.length ? Math.max(...mv.map((p) => minDist(p, ancore))) : 0;
    const dimineata = !prev && mv[0] && noapteA && hav(mv[0], noapteA) <= 1;
    const seara = !next && mv.at(-1) && noapteB && hav(mv.at(-1), noapteB) <= 1;
    // 4. perechea: turul și returul aceleiași (linie, schimb), nimic cu oameni între ele
    // B14: intervalul care conține o cursă cu rută fără schimb (ex. cursa de prânz) NU e gol între ture: se taie la ea
    // «cursa de prânz» = cursă cu rută fără schimb cu ora (sosirea turului / plecarea returului) între 08:00 și 15:00 — nu
    // picioarele goale structurale de la 06–08 și 22–24 (plecarea goală spre capăt după tur e chiar golul dintre ture)
    const cursaInGap = prev && next && (afaraZi.get(`${m}|${z}`) ?? []).some((o) => o.t0 < g.t1 && o.t1 > g.t0 && o.ora >= 8 && o.ora < 15);
    // Codex r2 (C3): intervalul perechii cu o cursă de prânz se TAIE la ea; bucățile se încadrează după liniile adiacente —
    // aceeași linie = gol pe rută 5.3 (b), linie diferită = legătură 5.7; cursa de prânz însăși = gol pe rută pe linia ei
    // (fără fereastră, nu e cu oameni, nu e economie). Ex.: tur A → prânz pe B → retur A: A→B și B→A sunt legătură.
    if (prev && next && prev.pereche === next && prev.sens === 'tur' && cursaInGap) {
      const runs = (afaraZi.get(`${m}|${z}`) ?? []).filter((o) => o.t0 < g.t1 && o.t1 > g.t0 && o.ora >= 8 && o.ora < 15).sort((a, b) => a.t0 - b.t0);
      for (const q of taieLaPranz(g.t0, g.t1, prev.lin, next.lin, runs)) {
        const bb = bucata(P, q.a, q.b); if (bb.km < PR.STAT_KM) continue;
        seg.push({ ...base, t0: q.a, t1: q.b, km: bb.km, bpts: bb.pts, cat: q.cat, cursaPranz: true, cursaInsasi: q.cursa, lin: q.lin, prevLin: q.l1, nextLin: q.l2, motiv: q.motiv });
      }
      continue;
    }
    if (prev && next && prev.pereche === next && prev.sens === 'tur' && !cursaInGap) {
      const inZona = mv.every((p) => hav(p, PARC) <= PR.ZONA_KM || PORTI.some((q) => hav(p, q) <= PR.ZONA_KM));
      // B4: partea din interval care iese la > 15 km de ancore e DEPLASARE (bate golul între ture pe partea în exces)
      let exc = 0; for (let i = 1; i < mv.length; i++) { const dd = hav(mv[i - 1], mv[i]); if (dd > 5) continue;
        if (minDist({ lat: (mv[i - 1].lat + mv[i].lat) / 2, lon: (mv[i - 1].lon + mv[i].lon) / 2 }, ancore) > PR.DEPLASARE_KM) exc += dd; }
      exc = Math.min(exc, b.km);
      if (exc > 0) seg.push({ ...base, km: +exc.toFixed(2), cat: 'deplasare', excursie: true, motiv: `excursie în intervalul perechii, ${departe.toFixed(0)} km de ancore` });
      const kmGt = +(b.km - exc).toFixed(2);
      // Triaj r2 (B1-rest): R3 pe interval = DOAR km-ii pașilor GPS cu mijlocul în AFARA zonei uzinei (> 3 km de porți și de
      // parc), minus excursia; km-ii din zonă ai aceluiași interval = «așteaptă deja lângă uzină» (nu economie). Drumul
      // direct între porți e în zonă, deci nu se mai scade separat.
      const inZ = (p) => hav(p, PARC) <= PR.ZONA_KM || PORTI.some((q) => hav(p, q) <= PR.ZONA_KM);
      let kmAfara = 0, iesire = null, intrare = null;
      for (let i = 1; i < mv.length; i++) { const dd = hav(mv[i - 1], mv[i]); if (dd > 5) continue;
        const mid = { lat: (mv[i - 1].lat + mv[i].lat) / 2, lon: (mv[i - 1].lon + mv[i].lon) / 2 };
        if (inZ(mid) || minDist(mid, ancore) > PR.DEPLASARE_KM) continue;
        kmAfara += dd; if (!iesire) iesire = mv[i - 1]; intrare = mv[i]; }
      kmAfara = Math.min(kmAfara, kmGt);
      // cea mai lungă staționare ≥ 20 min din interval (pentru plafonarea R3, dacă P8 pică) — alternative.mjs
      // B13: reperul plafonului = cea mai lungă oprire ≥ 20 min din AFARA zonei, cu bucățile de parcare (goluri mute ≤ 100 m,
      // trackerul trimite un punct pe oră) unite într-o singură oprire
      const opriri2 = []; for (const x of stari.filter((x) => !inZ(x))) { const u = opriri2.at(-1);
        if (u && hav(u, x) * 1000 <= 100 && x.t - u.t1 <= 65 * 60e3) u.t1 = Math.max(u.t1, x.t1); else opriri2.push({ lat: x.lat, lon: x.lon, t: x.t, t1: x.t1 }); }
      const lunga = opriri2.filter((x) => (x.t1 - x.t) >= PR.CASA_STAT_MIN * 60e3).sort((p, q) => (q.t1 - q.t) - (p.t1 - p.t))[0] ?? null;
      seg.push({ ...base, km: kmGt, cat: 'golTure', lin: prev.lin, schimb: prev.schimb, pePeAcasa: !!casa, minParc, inZona, departe: r1(departe),
        r3km: +kmAfara.toFixed(2), kmZona: +(kmGt - kmAfara).toFixed(2), excursieKm: +exc.toFixed(2),
        iesire: iesire ? [iesire.lat, iesire.lon] : null, intrare: intrare ? [intrare.lat, intrare.lon] : null,
        casaPt: casa ? [casa.lat, casa.lon] : null, lunga: lunga ? [lunga.lat, lunga.lon, Math.round((lunga.t1 - lunga.t) / 60e3)] : null }); continue;
    }
    // 2. livrarea de dimineață / de seară (de la / spre locul nopții)
    if (dimineata || seara) {
      const lin = dimineata ? next?.lin : prev?.lin;
      seg.push({ ...base, cat: 'livrare', lin: lin ?? null, motiv: dimineata ? 'de la locul nopții la prima cursă' : 'de la ultima cursă la locul nopții',
        margine: dimineata ? 'dimineata' : 'seara', noapteTip: (dimineata ? noapteA : noapteB)?.tip, minParc,
        noapteZona: !!(dimineata ? noapteA : noapteB) && departeUz(dimineata ? noapteA : noapteB) <= PR.ZONA_KM }); continue;
    }
    // 3(b) aceeași linie, alte perechi (bate parcul: rândul 3 e înaintea rândului 5)
    const aceeasi = prev && next && prev.lin === next.lin;
    // 5 / 6. parcul = DOAR drumurile din zona uzinei (≤ 3 km de parc sau de porți) care duc la / pleacă de la o staționare
    // la parc; restul golului își păstrează categoria (un gol de 300 km cu o oprire la parc nu e «parc»)
    let kmParc = 0;
    if (!aceeasi && parcSt.length) {
      const zona = (p) => hav(p, PARC) <= PR.ZONA_KM || PORTI.some((g) => hav(p, g) <= PR.ZONA_KM);
      const tai = [mv[0].t, ...parcSt.flatMap((x) => [x.t, x.t1]), mv.at(-1).t];
      for (let i = 0; i + 1 < tai.length; i += 2) {
        const bucPts = mv.filter((p) => p.t >= tai[i] && p.t <= tai[i + 1]);
        if (bucPts.length < 2 || !bucPts.every(zona)) continue;
        let k = 0; for (let j = 1; j < bucPts.length; j++) { const dd = hav(bucPts[j - 1], bucPts[j]); if (dd <= 5) k += dd; }
        kmParc += k;
      }
      kmParc = Math.min(kmParc, b.km);
      if (!Lw.length || kmParc >= b.km - 0.05) { seg.push({ ...base, cat: Lw.length ? 'parc' : 'service', minParc, lin: next?.lin ?? prev?.lin ?? null }); continue; }
      if (kmParc > 0) seg.push({ ...base, km: +kmParc.toFixed(2), cat: 'parc', minParc, lin: next?.lin ?? prev?.lin ?? null, motiv: `drumul la parc și înapoi, în zona uzinei (${minParc} min la parc)` });
    }
    const rest = +(b.km - kmParc).toFixed(2), baseR = { ...base, km: rest };
    // 7. deplasarea
    if (!aceeasi && departe > PR.DEPLASARE_KM) { seg.push({ ...baseR, cat: 'deplasare', motiv: `${departe.toFixed(0)} km de porți, satele liniilor și casă`, departe: r1(departe) }); continue; }
    if (prev && next) {
      // 3(b) aceeași linie / 8 linii diferite; pe acasă: ocolul = livrare, drumul direct = categoria de bază
      const catBaza = aceeasi ? 'golRuta' : 'legatura';
      if (casa && mv.length) {
        const se = await kmDrum(mv[0], mv.at(-1));
        if (se != null) {
          const direct = +Math.min(rest, se * PR.GPS_PESTE_DRUM).toFixed(2), ocol = +(rest - direct).toFixed(2);
          if (ocol > 0) seg.push({ ...baseR, km: ocol, cat: 'livrare', ocol: true, lin: next.lin, motiv: `ocolul pe acasă între curse (${Math.round(100 * ocol / b.km)} % din drum)` });
          if (direct > 0) seg.push({ ...baseR, km: direct, cat: catBaza, direct: true, lin: catBaza === 'golRuta' ? prev.lin : null, motiv: `drumul direct între curse, ${se.toFixed(1)} km pe drum` });
          continue;
        }
      }
      if (rest > 0) seg.push({ ...baseR, cat: catBaza, lin: catBaza === 'golRuta' ? prev.lin : null, motiv: `${prev.lin} → ${next.lin}` });
      continue;
    }
    // marginea zilei fără loc al nopții cunoscut: livrare (ca briceni/cod/livrare.mjs:125)
    if ((!prev && !noapteA && next) || (!next && !noapteB && prev)) {
      seg.push({ ...baseR, cat: 'livrare', lin: (next ?? prev).lin, motiv: 'marginea zilei, locul nopții necunoscut', margine: !prev ? 'dimineata' : 'seara' }); continue;
    }
    if (rest > 0) seg.push({ ...baseR, cat: 'necunoscut' });
  }
  // 3(a) golul impus: din livrarea care atinge poarta, partea de pe culoarul liniei, cel mult E dimineața și E seara
  for (const s of seg) {
    if (s.cat !== 'livrare' || s.ocol || !s.margine || !s.bpts?.length || s.km <= 0 || !s.lin) continue;
    const Lx0 = LINII.get(s.lin); const leg0 = s.margine === 'dimineata' ? Lw[0] : Lw.at(-1); const E0 = Lx0?.E[leg0?.schimb ?? 's1'] ?? null;
    // ION-109 (§5.3 a, §7.4 după migr. 413; Ion 27.09): noaptea în Bălți (parc, uzină, acasă la ≤ 3 km) NU scutește livrarea — fără gol impus
    if (s.noapteZona) continue;
    if (!s.bpts.some((p) => poarta(p, PR.POARTA_EXTRA))) continue;
    const Lx = LINII.get(s.lin); if (!Lx?.coridor.length) continue;
    const leg = s.margine === 'dimineata' ? Lw[0] : Lw.at(-1); const E = Lx.E[leg?.schimb ?? 's1'] ?? null; if (!E) continue;
    let on = 0, tot = 0;
    for (let i = 1; i < s.bpts.length; i++) { const a = s.bpts[i - 1], q = s.bpts[i], dd = hav(a, q); if (dd > 5) continue; tot += dd;
      if (minDist({ lat: (a.lat + q.lat) / 2, lon: (a.lon + q.lon) / 2 }, Lx.coridor) <= PR.CORIDOR_KM) on += dd; }
    if (!tot) continue;
    const g = Math.min(s.km * on / tot, E);
    if (g > 0) { s.golImpus = +g.toFixed(2); s.km = +(s.km - g).toFixed(2); }
  }
  seg.sort((a, b) => a.t0 - b.t0);
  // ION-109 (§8.6 după migr. 413; dezbaterea r2): cursă probabil nedetectată în livrare = atingerea porții în interiorul bucății (≥ 5 min de
  // margini), în sensul cursei (tur: venea de la ≥ 5 km și atinge poarta într-o fereastră de tur; retur: atinge poarta într-o fereastră de retur
  // și pleacă la ≥ 5 km); ziua iese întreagă din regulile de economie (alternative.mjs:exclusDe)
  const cursaNedetectata = [];
  for (const s of seg) {
    if (s.cat !== 'livrare' || !s.bpts?.length) continue;
    const pts = s.bpts;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; if (p.t == null || !poarta(p, 0.3) || p.t < s.t0 + 5 * 60e3 || p.t > s.t1 - 5 * 60e3) continue;
      const h = oraLoc(p.t);
      // sensul (condiția 2), în ± 60 min de atingere: turul SOSEȘTE — venea de la ≥ 5 km și nu pleacă iar departe în 10 min; returul PLEACĂ — n-a venit de departe în 30 min
      const departeIn = (q0, q1) => pts.some((q) => q.t >= q0 && q.t <= q1 && departeUz(q) >= 5);
      const tur = Object.values(FER.tur).some((f) => inFer(h, f)) && departeIn(p.t - 60 * 60e3, p.t) && !departeIn(p.t, p.t + 10 * 60e3);
      const ret = Object.values(FER.retur).some((f) => inFer(h, f)) && departeIn(p.t, p.t + 60 * 60e3) && !departeIn(p.t - 30 * 60e3, p.t);
      if (tur || ret) { cursaNedetectata.push({ ora: hhmm(p.t), sens: tur ? 'tur' : 'retur', km: r1(s.km), lin: s.lin ?? null }); break; }
    }
  }
  const km = Object.fromEntries(CAT.map((k) => [k, 0]));
  for (const s of seg) { if (s.cat !== 'stat') km[s.cat] += s.km; if (s.golImpus) km.golRuta += s.golImpus; }
  for (const k of CAT) km[k] = r1(km[k]);
  const sum = CAT.reduce((a, k) => a + km[k], 0);
  // tiparul zilei
  const perechi = Lw.filter((l) => l.sens === 'tur' && l.pereche).map((l) => ({ lin: l.lin, schimb: l.schimb, tur: hhmm(l.t1), retur: hhmm(l.pereche.t0) }));
  const linii = [...new Set(Lw.map((l) => l.lin))];
  return {
    m, z, dow: dow(z), sapt: saptDe(z), dev: d.dev, total: r1(total), sum: r1(sum), dif: r1(sum - total),
    bilant: total < 1 ? Math.abs(sum - total) <= 0.5 : Math.abs(sum - total) / total * 100 <= PR.BILANT_PCT,
    km, noapteA, noapteB, linii, perechi, jumatati, cursaNedetectata,
    tipar: !Lw.length ? 'fara curse' : jumatati.some((j) => !j.reala) ? 'jumatate nedetectata' : jumatati.length ? 'cu jumatati reale'
      : linii.length === 1 ? (perechi.length === 1 ? 'o linie, o pereche' : `o linie, ${perechi.length} perechi`) : `${linii.length} linii`,
    seg: seg.filter((s) => s.cat !== 'stat' && (s.km >= 0.05 || s.golImpus)).map((s) => ({ ora: `${hhmm(s.t0)}–${hhmm(s.t1)}`, t0: s.t0, t1: s.t1, cat: s.cat,
      km: r1(s.km), golImpus: s.golImpus ?? 0, lin: s.lin ?? null, sens: s.sens, schimb: s.schimb, motiv: s.motiv ?? null, prev: s.prev, next: s.next, prevLin: s.prevLin, nextLin: s.nextLin,
      ocol: s.ocol ?? false, direct: s.direct ?? false, pePeAcasa: s.pePeAcasa, inZona: s.inZona, r3km: s.r3km, kmZona: s.kmZona, cursaPranz: s.cursaPranz, cursaInsasi: s.cursaInsasi, iesire: s.iesire, intrare: s.intrare, casaPt: s.casaPt, lunga: s.lunga, excursieKm: s.excursieKm, excursie: s.excursie, inAfara: s.inAfara, minParc: s.minParc || 0, noapteTip: s.noapteTip, noapteZona: s.noapteZona ?? false, departe: s.departe,
      de: s.bpts?.[0] ? [s.bpts[0].lat, s.bpts[0].lon] : null, pana: s.bpts?.length ? [s.bpts.at(-1).lat, s.bpts.at(-1).lon] : null })),
  };
}

// ---- flota săptămânii și zilele de lucru
if (/(^|\/)categorii\.mjs$/.test(process.argv[1] ?? '')) {
  const t0 = Date.now();
  const V = JSON.parse(readFileSync(`${D}/economie-vizite.json`, "utf8"));   // vizitele cu golurile mute legate (S3)
  const flota = Object.fromEntries(Object.entries(V.flota).map(([w, l]) => [w, [...new Set(l.map(numeM))].sort()]));
  const laPoarta = (m, z) => (devDe.get(m) ?? [m]).some((dev) => V.zileLaPoarta[dev]?.[z]);
  const ZILE = [];
  for (const [w, [a, b]] of Object.entries(SAPT)) {
    for (const m of flota[w] ?? []) for (const z of zileIntre(a, b)) {
      if (z > PANA) continue;   // ziua ultimă a ferestrei (S13)
      if (!peZi.has(`${m}|${z}`) && !laPoarta(m, z)) continue;
      const r = await clasifica(m, z); if (r) ZILE.push(r);
    }
  }
  salveazaCache(); verificaValhalla();
  const ok = ZILE.filter((z) => z.bilant).length;
  console.log(`${ZILE.length} zile-mașină · bilanț ±${PR.BILANT_PCT} %: ${ok} (${(100 * ok / ZILE.length).toFixed(1)} %) · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const w of Object.keys(SAPT)) console.log(`  săpt ${w}: flota ${flota[w]?.length} · zile ${ZILE.filter((z) => z.sapt === +w).length}`);
  const tot = Object.fromEntries(CAT.map((k) => [k, r1(ZILE.reduce((a, z) => a + z.km[k], 0))]));
  console.log('  km pe categorii: ' + CAT.map((k) => `${k} ${tot[k]}`).join(' · ') + ` · total urmă ${r1(ZILE.reduce((a, z) => a + z.total, 0))}`);
  const rele = ZILE.filter((z) => !z.bilant).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 10);
  for (const z of rele) console.log(`   fără bilanț: ${z.m} ${z.z} total ${z.total} Σ ${z.sum} (${z.dif})`);
  console.log(`  curse promovate (Briceni §5.4): ${PROMOVATE.length} · respinse: ${RESPINSE.length} (${RESPINSE.map((r) => `${r.m} ${r.zi} ${r.ora ?? ""} ${r.motiv}`).join("; ")})`);
  scrieAtomic(`${D}/economie-zile.json`, { PR, CAT, flota, zile: ZILE, promovate: PROMOVATE, promovareRespinsa: RESPINSE, rulat: new Date().toISOString(),
    linii: Object.fromEntries([...LINII].map(([k, l]) => [k, { E: l.E, peSchimb: l.peSchimb, locuri: l.locuri, locuriDinRuta: l.locuriDinRuta, capat: l.capat, capatC: l.capatC, gps: l.gps }])) });
}
