// Drăxlmaier F2 — pasul 4 (v2, după triajul rundei 1 și verdictul dezbaterii Claude + Codex, 26.09): alternativele pe mașină.
//   A = R1-LEAR «doarme lângă uzină»: ziua ideală = Σ 4 × E pe perechi + 2 × E pe jumătățile REALE + parc/service/deplasare/
//       necunoscut; economia = urma − ideal. Înlocuiește toată ziua.
//   B = R1a + R1b + R3, km DISJUNCȚI (S1): R1a = livrarea de la / spre locul nopții (marginile: «șofer din satul de start»),
//       R1b = ocolul pe acasă între curse («nu pleacă acasă, așteaptă la capăt»), R3 = golul între ture reținut
//       («așteaptă lângă uzină între tur și retur»): doar intervalele care IES din zona uzinei, minus excursiile și minus
//       drumul direct între porți (categorii.mjs), citirea (c) cu pragul 30 km.
//   Pe mașină max(A, B); A și B pe ACELAȘI eșantion (S2): zilele L–V fără jumătate probabil nedetectată și fără linie fără
//   etalon. Pe flotă: măsurat pe eșantion → pe zi-mașină × zilele-mașină L–V = EXTRAPOLARE; weekendul separat (N5).
//   R2 (realocare pe clase, ungar pe (zi, schimb, clasă)) se raportează, NU se propune (verdictul, întrebarea 3).
// Casa = locul cu cele mai multe ore de staționare ≥ 2 h luni–vineri, fără porți (+0,3 km) și fără parc (0,8 km)
// (LEAR §7.1). Lei doar cu normă; normele și prețurile folosite se scriu în economie.json → rulare (S8).
//   node --env-file=../../../.env alternative.mjs  →  date/economie.json
import { readFileSync, existsSync } from 'node:fs';
import { D, PORTI, PARC, SAPT, PANA, hav, parcari, localToUtc, dow, r1, med, kmDrum, salveazaCache, verificaValhalla, scrieAtomic, zileIntre, ziua } from './comun.mjs';

const ZZ = JSON.parse(readFileSync(`${D}/economie-zile.json`, 'utf8'));
const F = JSON.parse(readFileSync(`${D}/economie-flota.json`, 'utf8'));
const LIN = ZZ.linii;
const ALIAS_M = { '0357544371228442': '880RNK', '350KAJ#2284': '350KAJ' };
const numeM = (m) => ALIAS_M[m] ?? m;
const PRAGURI_R3 = [20, 30, 40];
const E = (lin, s) => LIN[lin]?.E?.[s] ?? null;
const clasa = (lin) => LIN[lin]?.locuri ?? null;

// ---- casa (LEAR §7.1) din urmele L–V ale ferestrei
const devDe = new Map(); for (const d of F.dispozitive) (devDe.get(numeM(d.m)) ?? devDe.set(numeM(d.m), []).get(numeM(d.m))).push(d.m);
const MASINI = [...new Set(ZZ.zile.map((z) => z.m))].sort();
const casaDe = new Map();
for (const m of MASINI) {
  const loc = []; // { lat, lon, h }
  for (const z of zileIntre(Object.values(SAPT)[0][0], Object.values(SAPT).at(-1)[1])) {
    if (dow(z) > 5) continue;
    let best = null; for (const dev of devDe.get(m) ?? [m]) { const f = `${D}/economie-urme/${dev}/${z}.json`; if (!existsSync(f)) continue; const d = JSON.parse(readFileSync(f, 'utf8')); if (!best || d.n > best.n) best = d; }
    if (!best) continue;
    // staționare = puncte consecutive la ≤ 0,3 km de primul punct al grupului, golurile de semnal incluse (f1-masura.mjs)
    const a = localToUtc(z, 0).getTime(), b = localToUtc(z, 24 * 60).getTime();
    const P = best.pts.filter((x) => !x.mut && (x.t ?? x.t0) < b);
    for (let i = 0; i < P.length;) {
      let j = i; while (j + 1 < P.length && hav(P[i], P[j + 1]) <= 0.3) j++;
      const t0 = Math.max(a, P[i].t ?? P[i].t0), t1 = Math.min(b, P[j].t ?? P[j].t1), h = (t1 - t0) / 36e5, x = P[i];
      i = j + 1;
      if (h < 2 || PORTI.some((g) => hav(x, g) <= g.r + 0.3) || hav(x, PARC) <= 0.8) continue;
      const c = loc.find((q) => hav(q, x) <= 0.5); if (c) c.h += h; else loc.push({ lat: x.lat, lon: x.lon, h });
    }
  }
  loc.sort((p, q) => q.h - p.h);
  const tot = loc.reduce((s, q) => s + q.h, 0);
  const c = loc[0];
  casaDe.set(m, c ? { lat: c.lat, lon: c.lon, h: Math.round(c.h), pct: Math.round(100 * c.h / tot), kmPoarta: r1(Math.min(...PORTI.map((g) => hav(c, g)))), kmParc: r1(hav(c, PARC)) } : null);
}

// ---- lei/km (Drăxlmaier §9)
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY, H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const rest = async (p) => { const r = await fetch(`${SB}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
const normPlate = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Triaj r3 (S18): normele și prețul se îngheață la ziua ultimă a ferestrei: prima rulare pentru F2_PANA le scrie în
// economie-norme-<PANA>.json, rulările următoare le recitesc (baza n-are istoric al normelor)
const NORME_F = `${D}/economie-norme-${PANA}.json`;
let veh, norme, tipuri, preturi;
if (existsSync(NORME_F)) ({ veh, norme, tipuri, preturi } = JSON.parse(readFileSync(NORME_F, 'utf8')));
else { [veh, norme, tipuri, preturi] = await Promise.all([rest('vehicles?select=id,plate_number&limit=5000'),
  rest('lde_vehicle_norms?select=vehicle_id,vehicle_type_id,measured_consumption_l_per_100km&limit=5000'),
  rest('lde_vehicle_types?select=id,category,norm_l_per_100km'), rest(`lde_diesel_price?select=valid_from,price_lei&valid_from=lte.${PANA}&order=valid_from.desc&limit=60`)]); scrieAtomic(NORME_F, { pana: PANA, citit: new Date().toISOString(), veh, norme, tipuri, preturi }); }
const tip = new Map(tipuri.map((t) => [t.id, t]));
const normaPlaca = new Map();
for (const v of veh) { const n = norme.find((x) => x.vehicle_id === v.id); if (!n) continue; const t = tip.get(n.vehicle_type_id);
  const litri = t?.norm_l_per_100km != null ? +t.norm_l_per_100km : n.measured_consumption_l_per_100km != null ? +n.measured_consumption_l_per_100km : null;
  if (litri != null && !normaPlaca.has(normPlate(v.plate_number))) normaPlaca.set(normPlate(v.plate_number), { litri, categorie: t?.category ?? null }); }
const pretZi = (z) => { const p = preturi.find((x) => x.valid_from <= z); return p ? +p.price_lei : null; };
const leiKm = (m, z) => { const n = normaPlaca.get(m), p = pretZi(z); if (!n || p == null) return null; return n.litri / 100 * p + (n.categorie === 'autobuz_mare' ? 1.5 : 1.0) + 1.0; };


// ---- zilele: atipice, L–V, eșantionul comun (triaj F2 r1: S2, B2, N5)
// zi atipică (umbrela B15): o zi L–V cu mai puțin de jumătate din mediana mașinilor la lucru (31.08: 7 față de 38) iese din
// toate sumele, cu steag. Zilele de după ziua ultimă a ferestrei (PANA) nu există în economie-zile.json (S13).
const L_V = ZZ.zile.filter((d) => d.dow <= 5), peZiN = new Map(); for (const d of L_V) peZiN.set(d.z, (peZiN.get(d.z) ?? 0) + 1);
const medLV = med([...peZiN.values()]);
const ATIPICE = Object.fromEntries([...peZiN].filter(([, n]) => n < 0.5 * medLV).map(([z, n]) => [z, `${n} mașini la lucru față de mediana L–V ${medLV}`]));
const TOATE = ZZ.zile.filter((d) => d.tipar !== 'fara curse' && !ATIPICE[d.z] && d.z <= PANA);
const LV = TOATE.filter((d) => d.dow <= 5), WEEKEND = TOATE.filter((d) => d.dow > 5);
const ZL = new Set(LV.map((d) => d.z)).size, LUNA = 21.7;
const pragR3 = 30;   // verdictul dezbaterii, întrebarea 2: citirea (c), pragul 30 km
// Triaj r2 (C2): «o singură pereche» = numărul de perechi COMPLETE al zilei == 1, indiferent de eticheta tiparului
const oPereche = (d) => d.perechi.length === 1;
const eligibilR3 = (d, s, T) => oPereche(d) || (E(s.lin, s.schimb) ?? 0) > T;
const eligibilVechi = (d, s, T) => d.tipar === 'o linie, o pereche' || (E(s.lin, s.schimb) ?? 0) > T;   // v2, pentru diferența C2
const exclusDe = (d) => {
  const nedet = d.jumatati.filter((j) => !j.reala), reale = d.jumatati.filter((j) => j.reala);
  const faraE = [...d.perechi.map((p) => [p.lin, p.schimb]), ...reale.map((j) => [j.lin, j.schimb])].filter(([l, s]) => !E(l, s)).map(([l]) => l);
  return nedet.length ? 'jumatate probabil nedetectata' : faraE.length ? `linie fara etalon (${[...new Set(faraE)].join(', ')})` : null;
};
// ---- P8 (triaj r2, B1-rest / S11): pe intervalele eșantionului cu trecere pe acasă și km în afara zonei, km-ii din afara
// zonei față de drumul pe șosea ieșirea din zonă → casă → intrarea în zonă. Dacă > 1/3 ies din ± 20 %, R3 pe interval se
// plafonează la 2 × Valhalla(începutul intervalului, cea mai lungă staționare ≥ 20 min) × 1,05; excesul = «nelămurit, §11».
const P8 = [];
for (const d of LV) {
  if (exclusDe(d)) continue;
  for (const s of d.seg.filter((q) => q.cat === 'golTure' && q.r3km > 0 && q.pePeAcasa && q.casaPt && q.iesire && q.intrare)) {
    const c = { lat: s.casaPt[0], lon: s.casaPt[1] };
    const k1 = await kmDrum({ lat: s.iesire[0], lon: s.iesire[1] }, c), k2 = await kmDrum(c, { lat: s.intrare[0], lon: s.intrare[1] });
    if (k1 == null || k2 == null) continue;
    const ref = k1 + k2; P8.push({ m: d.m, z: d.z, km: s.r3km, ref: r1(ref), rap: ref > 0 ? +(s.r3km / ref).toFixed(2) : null, ok: ref > 0 && Math.abs(s.r3km - ref) / ref <= 0.2 });
  }
}
// Triaj r3 (S17): plafonul se aplică MEREU (nu doar când P8 pică la rularea respectivă), ca R3 să nu sară între săptămâni
const P8pica = P8.filter((x) => !x.ok).length, P8PICA = P8.length > 0 && P8pica > P8.length / 3, PLAFON = true;
let faraStationare = 0;
for (const d of LV) for (const s of d.seg.filter((q) => q.cat === 'golTure')) {
  s.r3fin = s.r3km ?? 0; s.nelamurit = 0;
  if (!PLAFON || !(s.r3km > 0)) continue;
  if (!s.lunga || !s.de) { s.nelamurit = s.r3fin; s.r3fin = 0; faraStationare++; continue; }
  const k = await kmDrum({ lat: s.de[0], lon: s.de[1] }, { lat: s.lunga[0], lon: s.lunga[1] });
  const cap = k == null ? 0 : 2 * k * 1.05;
  s.plafon = r1(cap); s.r3fin = Math.min(s.r3km, cap); s.nelamurit = +(s.r3km - s.r3fin).toFixed(2);
}
const PE_ZI = [];
for (const d of LV) {
  const reale = d.jumatati.filter((j) => j.reala), nedet = d.jumatati.filter((j) => !j.reala);
  const exclus = exclusDe(d);
  const lk = leiKm(d.m, d.z);
  const gt = d.seg.filter((s) => s.cat === 'golTure');
  const liv = d.seg.filter((s) => s.cat === 'livrare');
  const R1a = liv.filter((s) => !s.ocol).reduce((a, s) => a + s.km, 0), R1b = liv.filter((s) => s.ocol).reduce((a, s) => a + s.km, 0);
  const sumR = (f) => gt.filter(f).reduce((a, s) => a + s.r3fin, 0);
  const r3 = { a: sumR(() => oPereche(d)) };
  for (const T of PRAGURI_R3) { r3[`b${T}`] = sumR((s) => (E(s.lin, s.schimb) ?? 0) > T); r3[`c${T}`] = sumR((s) => eligibilR3(d, s, T)); }
  const R3 = r3[`c${pragR3}`], R3vechi = sumR((s) => eligibilVechi(d, s, pragR3));
  const nelamurit = gt.filter((s) => eligibilR3(d, s, pragR3)).reduce((a, s) => a + s.nelamurit, 0);
  const deja = { n: gt.filter((s) => s.inZona).length, km: gt.reduce((a, s) => a + (s.kmZona ?? 0), 0) };
  let A = null, ideal = null;
  if (!exclus) {
    ideal = d.perechi.reduce((a, p) => a + 4 * E(p.lin, p.schimb), 0) + reale.reduce((a, j) => a + 2 * E(j.lin, j.schimb), 0)
      + d.km.parc + d.km.service + d.km.deplasare + d.km.necunoscut;
    A = d.total - ideal;
  }
  PE_ZI.push({ m: d.m, z: d.z, sapt: d.sapt, dow: d.dow, tipar: d.tipar, total: d.total, km: d.km, exclus, nedet: nedet.length, reale: reale.length,
    perechi: d.perechi.length, linii: d.linii, lk, A: A == null ? null : r1(A), ideal: ideal == null ? null : r1(ideal),
    R1a: r1(R1a), R1b: r1(R1b), R3: r1(R3), R3vechi: r1(R3vechi), nelamurit: r1(nelamurit), B: r1(R1a + R1b + R3),
    r3: Object.fromEntries(Object.entries(r3).map(([k, v]) => [k, r1(v)])),
    deja: { n: deja.n, km: r1(deja.km) }, golTure: r1(gt.reduce((a, s) => a + s.km, 0)),
    // F3 (aditiv): unde stă nelămuritul și unde sunt cursele de prânz — intervale de timp, pentru proba P10 «un km, un loc»
    nelamuritLista: gt.filter((s) => eligibilR3(d, s, pragR3) && s.nelamurit > 0).map((s) => ({ t0: s.t0, t1: s.t1, ora: s.ora, km: r1(s.nelamurit), lin: s.lin })),
    curseDePranz: d.seg.filter((s) => s.cursaPranz).map((s) => ({ t0: s.t0, t1: s.t1, ora: s.ora, km: r1(s.km), lin: s.lin ?? null })),
    // ION-105 (aditiv): cât din fiecare interval al perechii intră în R3 (după prag și plafon), ca pagina să-l pună la cazul lui
    r3Lista: gt.filter((s) => eligibilR3(d, s, pragR3) && s.r3fin > 0).map((s) => ({ t0: s.t0, km: r1(s.r3fin) })) });
}
// Codex r2 (C4): lista intervalelor «nelămurit» (eșantion, citirea aleasă), cu mașina, ziua, ora, km și motivul
const NELAMURIT = [];
for (const d of LV) { if (exclusDe(d)) continue;
  for (const s of d.seg.filter((q) => q.cat === "golTure" && q.nelamurit > 0 && eligibilR3(d, q, pragR3)))
    NELAMURIT.push({ m: d.m, z: d.z, ora: s.ora, lin: s.lin, km: r1(s.nelamurit), r3: r1(s.r3fin), motiv: s.lunga ? `exces peste plafon (${r1(s.plafon)} km până la oprirea de ${s.lunga[2]} min)` : "fără oprire ≥ 20 min în afara zonei" }); }
NELAMURIT.sort((a, b) => b.km - a.km);
const ES = PE_ZI.filter((x) => !x.exclus);             // eșantionul comun pentru A și B
const ESANTION = LV.filter((d) => ES.some((x) => x.m === d.m && x.z === d.z));


// ---- R2: realocarea pe (zi, schimb, clasă)
const hungarian = (C) => { // C: n×m (n ≤ m), minimizează; întoarce asignarea rând → coloană
  const n = C.length, m = C[0].length, INF = 1e18, u = Array(n + 1).fill(0), v = Array(m + 1).fill(0), p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) { p[0] = i; let j0 = 0; const minv = Array(m + 1).fill(INF), used = Array(m + 1).fill(false);
    do { used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) { const cur = C[i0 - 1][j - 1] - u[i0] - v[j]; if (cur < minv[j]) { minv[j] = cur; way[j] = j0; } if (minv[j] < delta) { delta = minv[j]; j1 = j; } }
      for (let j = 0; j <= m; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1; } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0); }
  const a = Array(n).fill(-1); for (let j = 1; j <= m; j++) if (p[j]) a[p[j] - 1] = j - 1; return a; };
const grupe = new Map(); // zi|schimb|clasa → { perechi: [{m, lin}], despartite: n }
for (const d of ESANTION) {
  for (const p of d.perechi) { const c = clasa(p.lin); const k = `${d.z}|${p.schimb}|${c}`; const g = grupe.get(k) ?? grupe.set(k, { z: d.z, schimb: p.schimb, clasa: c, perechi: [], despartite: 0 }).get(k); g.perechi.push({ m: d.m, lin: p.lin }); }
  for (const j of d.jumatati.filter((j) => j.reala)) { const c = clasa(j.lin); const k = `${d.z}|${j.schimb}|${c}`; const g = grupe.get(k) ?? grupe.set(k, { z: d.z, schimb: j.schimb, clasa: c, perechi: [], despartite: 0 }).get(k); g.despartite += 0.5; }
}
const costCasa = async (m, lin) => { const c = casaDe.get(m), cap = LIN[lin]?.capatC; if (!c || !cap) return null; const k = await kmDrum(c, cap); return k == null ? null : 2 * k; };
const R2 = { grupe: 0, calculate: 0, steag: { multipla: 0, despartita: 0, faraCasa: 0 }, steagN: [], peClasa: {}, peMasina: new Map(), mutari: new Map() };
for (const g of grupe.values()) {
  R2.grupe++;
  const cnt = new Map(); for (const p of g.perechi) cnt.set(p.m, (cnt.get(p.m) ?? 0) + 1);
  const multi = [...cnt.values()].some((n) => n > 1);
  const K = g.clasa ?? 'fără clasă'; const PC = R2.peClasa[K] ??= { grupe: 0, calculate: 0, steag: 0, curent: 0, optim: 0, castig: 0, perechi: 0 };
  PC.grupe++;
  if (g.perechi.length < 2) continue;
  // mașina cu ≥ 2 perechi în aceeași (zi, schimb, clasă) → grupa întreagă cu steag; perechea despărțită între două
  // mașini (jumătăți reale) nu intră în atribuire — rămâne la mașinile ei, cu steag numărat
  if (g.despartite) { R2.steag.despartita += g.despartite; R2.steagN.push(`${g.z} ${g.schimb} clasa ${K}: ${g.despartite} pereche(i) despărțită(e) rămân pe loc`); }
  if (multi) { R2.steag.multipla++; PC.steag++; R2.steagN.push(`${g.z} ${g.schimb} clasa ${K}: mașină cu ≥ 2 perechi, n = ${g.perechi.length}`); continue; }
  const masini = g.perechi.map((p) => p.m), linii = g.perechi.map((p) => p.lin);
  const C = []; let lipsa = false;
  for (const m of masini) { const row = []; for (const l of linii) { const c = await costCasa(m, l); if (c == null) lipsa = true; row.push(c ?? 1e6); } C.push(row); }
  if (lipsa) { R2.steag.faraCasa++; PC.steag++; continue; }
  const a = hungarian(C);
  let cur = 0, opt = 0;
  masini.forEach((m, i) => {
    const ci = C[i][i], co = C[i][a[i]]; cur += ci; opt += co;
    const M = R2.peMasina.get(m) ?? R2.peMasina.set(m, { contributie: 0, mutari: 0, zile: new Set() }).get(m);
    M.contributie += ci - co; if (a[i] !== i) { M.mutari++; M.zile.add(g.z); const k = `${m}: ${linii[i]} → ${linii[a[i]]}`; R2.mutari.set(k, (R2.mutari.get(k) ?? 0) + 1); }
  });
  R2.calculate++; PC.calculate++; PC.curent += cur; PC.optim += opt; PC.castig += cur - opt; PC.perechi += masini.length;
}
salveazaCache(); verificaValhalla();

// ---- agregarea: pe mașină (eșantion), pe flotă (măsurat pe eșantion + extrapolare pe zile-mașină L–V)
const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) ?? 0), 0);
const lei = (arr, f) => { let s = 0, ok = false; for (const x of arr) { const v = f(x); if (v != null && x.lk != null) { s += v * x.lk; ok = true; } } return ok ? Math.round(s) : null; };
const CHEI = ['A', 'R1a', 'R1b', 'R3', 'B', 'nelamurit', 'R3vechi'];
const masini = MASINI.map((m) => {
  const Z = PE_ZI.filter((x) => x.m === m), inc = Z.filter((x) => !x.exclus);
  if (!Z.length) return null;
  const s = Object.fromEntries(CHEI.map((k) => [k, r1(sum(inc, (x) => x[k]))]));
  const r3 = {}; for (const k of ['a', ...PRAGURI_R3.flatMap((T) => [`b${T}`, `c${T}`])]) r3[k] = r1(sum(inc, (x) => x.r3[k]));
  // Triaj r2 (S10 / B11): B e regula Drăxlmaier; A se calculează doar ca referință (8.4), nu se alege
  const best = { regula: 'B', km: s.B }, Amaibun = inc.length > 0 && s.A > s.B;
  // extrapolarea pe mașină (B10): B pe zi-mașină al ei × zilele ei L–V; fără nicio zi măsurată → null («nemăsurat»)
  const Bext = inc.length ? Math.round(s.B / inc.length * Z.length) : null;
  const lkM = med(Z.map((x) => x.lk).filter((x) => x != null));
  const km = {}; for (const k of ZZ.CAT) km[k] = r1(sum(Z, (x) => x.km[k]));
  const tip = {}; for (const x of Z) tip[x.tipar] = (tip[x.tipar] ?? 0) + 1;
  const R2m = R2.peMasina.get(m);
  return { m, zile: Z.length, zileIncluse: inc.length, zileExcluse: Z.length - inc.length, total: r1(sum(Z, (x) => x.total)), km,
    kmZi: Object.fromEntries(Object.entries(km).map(([k, v]) => [k, r1(v / Z.length)])),
    ...s, r3, regula: 'B', Amaibun, Bext, best: { ...best, km: r1(best.km), kmZi: inc.length ? r1(best.km / inc.length) : null },
    deja: { n: sum(inc, (x) => x.deja.n), km: r1(sum(inc, (x) => x.deja.km)) },
    R2: R2m ? r1(R2m.contributie) : 0, R2mutari: R2m?.mutari ?? 0,
    nelamuritLista: Z.flatMap((x) => x.nelamuritLista.map((q) => ({ zi: x.z, exclus: !!x.exclus, ...q }))),
    curseDePranz: { intervale: sum(Z, (x) => x.curseDePranz.length), km: r1(sum(Z, (x) => x.curseDePranz.reduce((a, q) => a + q.km, 0))),
      lista: Z.flatMap((x) => x.curseDePranz.map((q) => ({ zi: x.z, ...q }))) },
    leiKm: lkM == null ? null : +lkM.toFixed(2), normaLipsa: lkM == null,
    lei: Object.fromEntries(CHEI.map((k) => [k, lei(inc, (x) => x[k])])),
    casa: casaDe.get(m), clasa: med(Z.flatMap((x) => x.linii.map(clasa)).filter(Boolean)), tipare: tip, sapt: [...new Set(Z.map((x) => x.sapt))].sort() };
}).filter(Boolean).sort((a, b) => (b.Bext ?? -1) - (a.Bext ?? -1));

// pe flotă: ce s-a MĂSURAT pe eșantion, pe zi-mașină, și EXTRAPOLAREA la toate zilele-mașină L–V (marcată)
const flotaDin = (filtru) => {
  const Z = PE_ZI.filter(filtru), inc = Z.filter((x) => !x.exclus), n = inc.length, N = Z.length;
  const mas = Object.fromEntries(CHEI.map((k) => [k, r1(sum(inc, (x) => x[k]))]));
  const pe = Object.fromEntries(CHEI.map((k) => [k, n ? r1(mas[k] / n) : null]));
  const ext = Object.fromEntries(CHEI.map((k) => [k, n ? Math.round(mas[k] / n * N) : null]));
  const km = {}; for (const k of ZZ.CAT) km[k] = r1(sum(Z, (x) => x.km[k]));
  const r3 = {}; for (const k of ['a', ...PRAGURI_R3.flatMap((T) => [`b${T}`, `c${T}`])]) r3[k] = r1(sum(inc, (x) => x.r3[k]));
  const leiM = Object.fromEntries(CHEI.map((k) => [k, lei(inc, (x) => x[k])]));
  return { zileLV: N, esantion: n, nedetectate: Z.filter((x) => x.exclus?.startsWith('jumatate')).length, faraEtalon: Z.filter((x) => x.exclus?.startsWith('linie')).length,
    masini: new Set(Z.map((x) => x.m)).size, total: r1(sum(Z, (x) => x.total)), km, masurat: mas, peZiMasina: pe, extrapolare: ext, r3,
    lei: { masurat: leiM, extrapolare: Object.fromEntries(CHEI.map((k) => [k, leiM[k] == null || !n ? null : Math.round(leiM[k] / n * N)])) },
    deja: { n: sum(inc, (x) => x.deja.n), km: r1(sum(inc, (x) => x.deja.km)) } };
};
const flota = { toate: flotaDin(() => true), s36_38: flotaDin((x) => x.sapt <= 38), ...Object.fromEntries(Object.keys(SAPT).map((w) => [`s${w}`, flotaDin((x) => x.sapt === +w)])) };
const t = flota.toate;
flota.peZiLucratoare = Object.fromEntries(CHEI.map((k) => [k, r1(t.extrapolare[k] / ZL)]));
flota.peLuna = Object.fromEntries(CHEI.map((k) => [k, Math.round(t.extrapolare[k] / ZL * LUNA)]));
flota.leiPeLuna = Object.fromEntries(CHEI.map((k) => [k, t.lei.extrapolare[k] == null ? null : Math.round(t.lei.extrapolare[k] / ZL * LUNA)]));
flota.regula = 'B';
flota.Areferinta = { masini: masini.filter((x) => x.Amaibun).map((x) => `${x.m} A ${Math.round(x.A)} / B ${Math.round(x.B)} pe ${x.zileIncluse} din ${x.zile} zile`) };
// extrapolarea pe mașină (B10), față de cea globală: mașinile nemăsurate primesc media flotei pe zi-mașină
const nemas = masini.filter((x) => x.Bext == null);
flota.BextPeMasina = Math.round(sum(masini, (x) => x.Bext) + sum(nemas, (x) => x.zile) * t.peZiMasina.B);
flota.nemasurate = nemas.map((x) => `${x.m} (${x.zile} zile)`);
flota.putinMasurate = masini.filter((x) => x.zileIncluse && x.zileIncluse < 0.5 * x.zile).map((x) => `${x.m} ${x.zileIncluse}/${x.zile}`);
flota.P8 = { intervale: P8.length, pica: P8pica, plafon: PLAFON, p8Pica: P8PICA, raportMedian: med(P8.map((x) => x.rap).filter((x) => x != null)), faraStationare, lista: P8 };
flota.C2 = { R3vechi: t.masurat.R3vechi, R3: t.masurat.R3, diferenta: r1(t.masurat.R3 - t.masurat.R3vechi), zileCuOPerecheSiJumatati: PE_ZI.filter((x) => !x.exclus && x.perechi === 1 && x.tipar !== 'o linie, o pereche').length };
flota.Apozitiv = { masini: masini.filter((x) => x.A > 0).length, km: r1(sum(masini, (x) => Math.max(0, x.A))), lista: masini.filter((x) => x.A > 0).map((x) => `${x.m} ${Math.round(x.A)}`) };
flota.weekend = { zile: WEEKEND.length, masini: new Set(WEEKEND.map((d) => d.m)).size, total: r1(sum(WEEKEND, (d) => d.total)),
  km: Object.fromEntries(ZZ.CAT.map((k) => [k, r1(sum(WEEKEND, (d) => d.km[k]))])) };
flota.zileNedetectate = { zile: t.nedetectate, km: Object.fromEntries(ZZ.CAT.map((k) => [k, r1(sum(PE_ZI.filter((x) => x.exclus?.startsWith('jumatate')), (x) => x.km[k]))])) };
const tipare = {}; for (const x of PE_ZI) { const k = x.tipar; const q = tipare[k] ??= { zile: 0, km: 0 }; q.zile++; q.km += x.total; }
for (const q of Object.values(tipare)) q.km = r1(q.km);
const r2c = Object.values(R2.peClasa);
const r2 = { propus: false, motiv: 'verdictul dezbaterii (întrebarea 3): atribuire pe zi cu rotație săptămânală, câștigul brut anulat în mare parte de mașinile pe minus; se remăsoară în F4',
  grupe: R2.grupe, calculate: R2.calculate, steag: R2.steag, steagExemple: R2.steagN.slice(0, 30),
  peClasa: Object.fromEntries(Object.entries(R2.peClasa).map(([k, v]) => [k, { ...v, curent: r1(v.curent), optim: r1(v.optim), castig: r1(v.castig) }])),
  castigFlota: r1(r2c.reduce((a, v) => a + v.castig, 0)),
  castigBrut: r1([...R2.peMasina.values()].reduce((a, v) => a + Math.max(0, v.contributie), 0)),
  pierderi: r1([...R2.peMasina.values()].reduce((a, v) => a + Math.min(0, v.contributie), 0)),
  mutariFrecvente: [...R2.mutari].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => ({ mutare: k, zile: n })),
  contributiiNegative: [...R2.peMasina].filter(([, v]) => v.contributie < -0.05).map(([m, v]) => ({ m, km: r1(v.contributie) })).sort((a, b) => a.km - b.km) };
const OUT = { rulat: new Date().toISOString(), fereastra: SAPT, atipice: ATIPICE, medLV, zileLucratoare: ZL, luna: LUNA, praguriR3: PRAGURI_R3, pragR3,
  rulare: { preturi: preturi.map((p) => ({ valid_from: p.valid_from, price_lei: +p.price_lei })), norme: Object.fromEntries(normaPlaca) },
  pana: PANA, nelamuritLista: NELAMURIT, flota, masini, r2, tipare, zile: PE_ZI, promovate: ZZ.promovate?.length ?? 0, promovareRespinsa: ZZ.promovareRespinsa ?? [], normaLipsa: masini.filter((x) => x.normaLipsa).map((x) => x.m) };
scrieAtomic(`${D}/economie.json`, OUT);
console.log(`L–V ${t.zileLV} zile-mașină (${ZL} zile lucrătoare), eșantion ${t.esantion} (nedetectate ${t.nedetectate}, fără etalon ${t.faraEtalon}); weekend ${WEEKEND.length}`);
console.log(`măsurat pe eșantion: A ${t.masurat.A} · R1a ${t.masurat.R1a} · R1b ${t.masurat.R1b} · R3 ${t.masurat.R3} · B ${t.masurat.B} · deja lângă uzină ${t.deja.n} int. ${t.deja.km} km`);
console.log(`pe zi-mașină: ${JSON.stringify(t.peZiMasina)} · extrapolare: ${JSON.stringify(t.extrapolare)} · pe zi lucr.: ${JSON.stringify(flota.peZiLucratoare)} · lei/lună ${JSON.stringify(flota.leiPeLuna)}`);
console.log(`regula B; A mai bun doar ca referință la: ${flota.Areferinta.masini.join('; ') || '—'} · B extrapolat pe mașină ${flota.BextPeMasina} față de global ${t.extrapolare.B} · nemăsurate: ${flota.nemasurate.join(', ') || '—'} · P8 ${flota.P8.intervale - flota.P8.pica}/${flota.P8.intervale} în ± 20 % (median ${flota.P8.raportMedian}), plafon ${flota.P8.plafon}, fără staționare ${faraStationare} · C2: R3 ${flota.C2.R3} față de ${flota.C2.R3vechi} (${flota.C2.diferenta}), ${flota.C2.zileCuOPerecheSiJumatati} zile · A pe plus: ${flota.Apozitiv.masini} mașini, ${flota.Apozitiv.km} km · R2 ${r2.castigFlota} (brut ${r2.castigBrut}, pierderi ${r2.pierderi})`);
console.log(`R3 citiri (eșantion): ${JSON.stringify(t.r3)}`);
console.log(`36–38 pe zi-mașină: ${JSON.stringify(flota.s36_38.peZiMasina)} · normă lipsă: ${OUT.normaLipsa.join(', ')}`);
