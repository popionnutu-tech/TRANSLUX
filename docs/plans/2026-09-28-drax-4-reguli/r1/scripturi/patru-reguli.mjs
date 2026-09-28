// ION-120 r1 — cele 4 reguli ale lui Ion (28.09.2026), măsurate pe TOATĂ flota săptămânii 14–20.09 (Drăxlmaier Bălți).
// DOAR CITIRE: economie-zile.json (bucățile zilei), economie.json (eșantionul B, casa), schelet-ideal.json (capăt, sate, locuri),
// economie-urme/<dev>/<zi>.json (urma GPS). Valhalla (kmDrum din comun.mjs) doar pentru drumurile PROPUSE. Nu scrie în bază,
// nu atinge codul VPS; cache-ul Valhalla e o COPIE (ECON_D=/tmp/ion120/d), salveazaCache nu se cheamă.
//   ECON_D=/tmp/ion120/d node patru-reguli.mjs  →  /tmp/ion120/patru-reguli.json + rezumat pe stdout
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PORTI, PARC, hav, parcari, bucata, hhmm, r1, kmDrum as kmDrum0 } from '/root/lde-worker/drax/cod/economie/comun.mjs';
const kmDrum = async (a, b) => (a?.lat == null || b?.lat == null ? null : kmDrum0(a, b));

const W = '/root/lde-worker/drax/date/saptamanal/2026-09-14';
const J = (f) => JSON.parse(readFileSync(`${W}/${f}`, 'utf8'));
const ZZ = J('economie-zile.json'), EC = J('economie.json'), S = J('schelet-ideal.json');
const LIN = ZZ.linii;
const ZONA = 3, CASA_KM = 0.5, CASA_MIN = 20, LOC_KM = 1.5, SAT_KM = 1;

// ---- tipul mașinii (vehicles → lde_vehicle_norms → lde_vehicle_types.category, citit 28.09 prin MCP; passenger_seats e NULL în bază)
const CATEG = { '024XKY': 'autobuz_mic', '041BRAU': 'autobuz_mic', '144BRAZ': 'microbuz', '146BRAZ': 'microbuz', '206BZP': 'microbuz', '224BZP': 'microbuz',
  '302YEK': 'autobuz_mic', '345KAJ': 'microbuz', '346KAJ': 'microbuz', '350KAJ': 'microbuz', '386PKP': 'microbuz', '388ASB': 'autobuz_mare', '414ASB': 'autobuz_mare',
  '435ASB': 'autobuz_mare', '441ASB': 'autobuz_mare', '446ASB': 'autobuz_mare', '447ASB': 'autobuz_mare', '457BRAX': 'autobuz_mic', '549RNK': 'microbuz',
  '710CWN': 'microbuz', '713IZX': 'autobuz_mare', '715IZX': 'autobuz_mare', '725CWN': 'microbuz', '727CWN': 'microbuz', '744ARF': 'microbuz', '760BXI': 'autobuz_mic',
  '804MUM': 'autobuz_mare', '826GXP': 'autobuz_mare', '830MUM': 'autobuz_mare', '880RNK': 'autobuz_mare', '912RNK': 'microbuz' };
// fără tip în bază: 186OMM, 293QVT, 390ASB, 402VKV, 518MHD, 763LYY, 925FTI → capacitatea = cea mai mare clasă de linie dusă în săptămână (steag)
const CAP_CAT = { autobuz_mare: 50, autobuz_mic: 27, microbuz: 20 };   // PRESUPUNERE (întrebare pentru Ion): DAF 50, Sprinter 515/518 27, 313/315/316/Crafter 20

// ---- scheletul: satele fiecărei linii (pentru citirea «orice sat al rutei»)
const SATE = new Map(S.map((l) => [`${l.ruta}|${l.linie}`, [...(l.sateDrum ?? []).map((s) => ({ n: s.n, lat: s.c[0], lon: s.c[1] })), ...(l.capatC ? [{ n: l.capat, lat: l.capatC[0], lon: l.capatC[1] }] : [])]]));
const capC = (lin) => LIN[lin]?.capatC ?? null;   // în economie-zile.json capatC e deja { lat, lon }
const pt = (a) => (a ? { lat: a[0], lon: a[1] } : null);
const inZ = (p) => hav(p, PARC) <= ZONA || PORTI.some((q) => hav(p, q) <= ZONA);
const eZi = new Map(EC.zile.map((x) => [`${x.m}|${x.z}`, x]));
const casaDe = new Map(EC.masini.map((x) => [x.m, x.casa]));
const numeCasa = new Map(J('analiza.json').masini.map((x) => [x.m, x.casa]));

// ---- urma zilei
const urma = (d) => { const f = `${W}/economie-urme/${d.dev}/${d.z}.json`; return existsSync(f) ? parcari(JSON.parse(readFileSync(f, 'utf8')).pts) : null; };
const cacheU = new Map(); const U = (d) => { const k = `${d.dev}|${d.z}`; if (!cacheU.has(k)) cacheU.set(k, urma(d)); return cacheU.get(k); };
function analizaGol(d, t0, t1, casa) {
  const P = U(d); if (!P) return null;
  const b = bucata(P, t0, t1), mv = b.pts;
  let afara = 0; for (let i = 1; i < mv.length; i++) { const dd = hav(mv[i - 1], mv[i]); if (dd > 5) continue;
    if (!inZ({ lat: (mv[i - 1].lat + mv[i].lat) / 2, lon: (mv[i - 1].lon + mv[i].lon) / 2 })) afara += dd; }
  // opririle ≥ 20 min: acasă și cea mai lungă din afara zonei (bucățile de parcare unite, ca categorii.mjs B13)
  const st = mv.filter((p) => p.stat), opr = [];
  for (const x of st) { const u = opr.at(-1); if (u && hav(u, x) <= 0.1 && x.t - u.t1 <= 65 * 60e3) u.t1 = Math.max(u.t1, x.t1 ?? x.t); else opr.push({ lat: x.lat, lon: x.lon, t: x.t, t1: x.t1 ?? x.t }); }
  const lungi = opr.filter((o) => o.t1 - o.t >= CASA_MIN * 60e3);
  const acasa = casa ? lungi.filter((o) => hav(o, casa) <= CASA_KM) : [];
  const lunga = lungi.filter((o) => !inZ(o)).sort((p, q) => (q.t1 - q.t) - (p.t1 - p.t))[0] ?? null;
  return { km: b.km, afara, acasaMin: Math.round(acasa.reduce((a, o) => a + (o.t1 - o.t), 0) / 60e3), lunga, start: mv[0], end: mv.at(-1) };
}

// ---- zilele: L–V cu curse; eșantionul B = fără «exclus» (§8.6)
const ZILE = ZZ.zile.filter((d) => d.dow <= 5 && d.seg.some((s) => s.cat === 'cuOameni'));
const esant = (d) => !eZi.get(`${d.m}|${d.z}`)?.exclus;
const curse = (d) => d.seg.filter((s) => s.cat === 'cuOameni').sort((a, b) => a.t0 - b.t0);
const kmSeg = (s) => s.km + (s.golImpus || 0);
const FARA = new Set(['cuOameni', 'deplasare', 'parc', 'service']);   // nu sunt ale regulilor (parcul/service/excursiile rămân)
const intre = (d, a, b) => d.seg.filter((s) => s.cat !== 'cuOameni' && s.t0 >= a - 1000 && s.t1 <= b + 1000);
const kmIntre = (d, a, b) => intre(d, a, b).filter((s) => !FARA.has(s.cat)).reduce((x, s) => x + kmSeg(s), 0);
const catIntre = (d, a, b) => { const o = {}; for (const s of intre(d, a, b)) o[s.cat + (s.ocol ? '(ocol)' : '')] = r1((o[s.cat + (s.ocol ? '(ocol)' : '')] ?? 0) + kmSeg(s)); return o; };
const capatNume = (lin) => LIN[lin]?.capat ?? lin;
// aceeași localitate: C1 = același capăt (nume sau ≤ 1,5 km între capete, între punctele GPS ale cursei); C2 = începutul turului la ≤ 1 km de un sat al liniei returului
const aceeasi = (ret, tur) => {
  const a = pt(ret.pana), b = pt(tur.de);
  const c1 = capatNume(ret.lin) === capatNume(tur.lin) || (capC(ret.lin) && capC(tur.lin) && hav(capC(ret.lin), capC(tur.lin)) <= LOC_KM) || (a && b && hav(a, b) <= LOC_KM);
  const c2 = c1 || (b && (SATE.get(ret.lin) ?? []).some((s) => hav(s, b) <= SAT_KM));
  return { c1, c2 };
};

const OUT = { R1n: [], R1s: [], R2: [], R4: [], R3: null };
const TIPURI = {};   // toate golurile dintre două curse ale zilei, pe tipul trecerii (eșantion)
const zi = (m, z) => ZZ.zile.find((d) => d.m === m && d.z === z);
const urm = (z) => { const x = new Date(z + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

for (const d of ZILE) {
  const C = curse(d), casa = pt(casaDe.get(d.m) ? [casaDe.get(d.m).lat, casaDe.get(d.m).lon] : null);
  // ---- R-1 NOAPTEA: ultimul retur al zilei la X, primul tur de a doua zi din X → mașina doarme la X
  const last = C.at(-1), d2 = zi(d.m, urm(d.z));
  if (last?.sens === 'retur' && d2 && d2.dow <= 5) {
    const first = curse(d2)[0];
    if (first?.sens === 'tur') {
      const { c1, c2 } = aceeasi(last, first);
      if (c2) {
        const seara = kmIntre(d, last.t1, Math.max(...d.seg.map((s) => s.t1))), dim = kmIntre(d2, Math.min(...d2.seg.map((s) => s.t0)), first.t0);
        const inR1a = intre(d, last.t1, Math.max(...d.seg.map((s) => s.t1))).concat(intre(d2, Math.min(...d2.seg.map((s) => s.t0)), first.t0)).filter((s) => s.cat === 'livrare' && !s.ocol).reduce((x, s) => x + s.km, 0);
        const cost = c1 ? 0 : (await kmDrum(pt(last.pana), pt(first.de))) ?? 0;
        const dejaLaX = d.noapteB && hav(d.noapteB, pt(last.pana)) <= LOC_KM;
        OUT.R1n.push({ m: d.m, z: d.z, z2: d2.z, c1, esant: esant(d) && esant(d2), X: capatNume(last.lin), Y: capatNume(first.lin), linX: last.lin, linY: first.lin,
          seara: r1(seara), dim: r1(dim), cost: r1(cost), km: r1(Math.max(0, seara + dim - cost)), inR1a: r1(inR1a), dejaLaX, ora: `${hhmm(last.t1)} → ${hhmm(first.t0)}`,
          noapte: d.noapteB ? r1(hav(d.noapteB, pt(last.pana))) : null });
      }
    }
  }
  // ---- golurile dintre două curse ale zilei
  for (let i = 0; i + 1 < C.length; i++) {
    const a = C[i], b = C[i + 1];
    const g = await analizaGol(d, a.t1, b.t0, casa); if (!g) continue;
    const kmR = kmIntre(d, a.t1, b.t0), cat = catIntre(d, a.t1, b.t0), dur = (b.t0 - a.t1) / 36e5;
    const tip = `${a.sens}→${b.sens}`, pereche = a.sens === 'tur' && b.sens === 'retur' && a.lin === b.lin && a.schimb === b.schimb;
    if (esant(d)) { const t = TIPURI[tip] ??= { n: 0, km: 0 }; t.n++; t.km = r1(t.km + kmIntre(d, a.t1, b.t0)); }
    const base = { m: d.m, z: d.z, esant: esant(d), ora: `${hhmm(a.t1)}–${hhmm(b.t0)}`, ore: r1(dur), tip, de: a.lin, spre: b.lin, pereche, kmGol: r1(kmR), cat, acasaMin: g.acasaMin };
    // R-1 între schimburi: retur la X → tur din X
    if (tip === 'retur→tur') { const { c1, c2 } = aceeasi(a, b);
      if (c2) { const cost = c1 ? 0 : (await kmDrum(pt(a.pana), pt(b.de))) ?? 0; OUT.R1s.push({ ...base, c1, X: capatNume(a.lin), Y: capatNume(b.lin), cost: r1(cost), km: r1(Math.max(0, kmR - cost)) }); } }
    // R-2 rămâne la uzină: tur (la poartă) → retur (de la poartă); economia = km din afara zonei, fără deplasare/parc
    if (tip === 'tur→retur') {
      const depl = (cat.deplasare ?? 0) + (cat.parc ?? 0);
      const afara = Math.max(0, Math.min(g.afara - (cat.deplasare ?? 0), kmR));
      let plafon = null; if (g.lunga) { const k = await kmDrum(g.start, g.lunga); plafon = k == null ? null : 2 * k * 1.05; }
      const cuPlafon = g.lunga ? Math.min(afara, plafon ?? 0) : 0;
      const E = LIN[a.lin]?.E?.[a.schimb] ?? 0, oPer = d.perechi.length === 1;
      OUT.R2.push({ ...base, afara: r1(afara), cuPlafon: r1(cuPlafon), plafon: plafon == null ? null : r1(plafon), lunga: g.lunga ? Math.round((g.lunga.t1 - g.lunga.t) / 60e3) : 0,
        eligibil83: pereche && (oPer || E > 30), E: r1(E), oPereche: oPer, acasa: g.acasaMin >= CASA_MIN });
    }
    // R-4 nu pleacă acasă între schimburi: oprire ≥ 20 min la casă în gol
    if (g.acasaMin >= CASA_MIN) {
      const ocol = intre(d, a.t1, b.t0).filter((s) => s.ocol).reduce((x, s) => x + s.km, 0);
      const direct = (await kmDrum(pt(a.pana) ?? g.start, pt(b.de) ?? g.end)) ?? 0;
      OUT.R4.push({ ...base, ocolR1b: r1(ocol), direct: r1(direct), tot: r1(Math.max(0, kmR - direct)), casa: numeCasa.get(d.m) ?? null, catGol: tip });
    }
  }
}

// ---- R-3 realocarea: pe (zi, schimb); cost = 2 × Valhalla(casă → capăt) (drum PROPUS), ca alternative.mjs:173; 3 variante de clasă
const hung = (Cm) => { const n = Cm.length, m = Cm[0].length, INF = 1e18, u = Array(n + 1).fill(0), v = Array(m + 1).fill(0), p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) { p[0] = i; let j0 = 0; const minv = Array(m + 1).fill(INF), used = Array(m + 1).fill(false);
    do { used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) { const cur = Cm[i0 - 1][j - 1] - u[i0] - v[j]; if (cur < minv[j]) { minv[j] = cur; way[j] = j0; } if (minv[j] < delta) { delta = minv[j]; j1 = j; } }
      for (let j = 0; j <= m; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; j0 = j1; } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0); }
  const a = Array(n).fill(-1); for (let j = 1; j <= m; j++) if (p[j]) a[p[j] - 1] = j - 1; return a; };
const locuri = (lin) => LIN[lin]?.locuri ?? null;
const capMasina = new Map(); for (const d of ZILE) { const mx = Math.max(0, ...d.perechi.map((p) => locuri(p.lin) ?? 0)); capMasina.set(d.m, Math.max(capMasina.get(d.m) ?? 0, mx)); }
// capacitatea = max(clasa tipului, cea mai mare clasă de linie dusă deja în săptămână): ce a dus o dată, poate duce (39 de perechi-zi contrazic presupunerea tipului)
const cap = (m) => Math.max(CATEG[m] ? CAP_CAT[CATEG[m]] : 0, capMasina.get(m) || 0) || null;
const nepotriviri = []; for (const d of ZILE) for (const p of d.perechi) if (CATEG[d.m] && locuri(p.lin) && locuri(p.lin) > cap(d.m)) nepotriviri.push(`${d.m} (${CATEG[d.m]}) pe ${p.lin} (${locuri(p.lin)} loc.) ${d.z}`);
const costCasa = async (m, lin) => { const c = casaDe.get(m), k = capC(lin); if (!c || !k) return null; const v = await kmDrum(c, k); return v == null ? null : 2 * v; };
// «real azi»: marginile zilei din urmă (livrare fără ocol + golul impus), pe zilele cu o singură pereche și fără alte curse
const realAzi = (d) => { const C = curse(d); if (d.perechi.length !== 1 || C.length !== 2) return null;
  return intre(d, Math.min(...d.seg.map((s) => s.t0)), C[0].t0).concat(intre(d, C.at(-1).t1, Math.max(...d.seg.map((s) => s.t1)))).filter((s) => s.cat === 'livrare' && !s.ocol).reduce((x, s) => x + kmSeg(s), 0); };
async function realoca(varianta, esantion) {
  const grupe = new Map();
  for (const d of ZILE.filter((x) => !esantion || esant(x))) for (const p of d.perechi) {
    const cls = varianta === 'linie' ? locuri(p.lin) : 'toate';
    const k = `${d.z}|${p.schimb}|${cls}`; (grupe.get(k) ?? grupe.set(k, []).get(k)).push({ m: d.m, lin: p.lin, d }); }
  let brut = 0, pierd = 0, n = 0, mut = 0, real = { curentReal: 0, curentVal: 0, n: 0 }; const peM = new Map(), mutari = new Map(), steag = [];
  for (const [k, G] of grupe) {
    if (G.length < 2) continue;
    if (new Set(G.map((x) => x.m)).size < G.length) { steag.push(k); continue; }
    const Cm = []; let lipsa = false;
    for (const x of G) { const row = []; for (const y of G) { let c = await costCasa(x.m, y.lin); if (c == null) lipsa = true;
      if (varianta !== 'linie' && (locuri(y.lin) ?? 0) > (cap(x.m) ?? 0)) c = 1e6;          // mașina mai mică decât linia: nu se poate
      row.push(c ?? 1e6); } Cm.push(row); }
    if (lipsa) { steag.push(k + ' fără casă'); continue; }
    if (varianta === 'faraPierderi') for (let i = 0; i < G.length; i++) for (let j = 0; j < G.length; j++) if (Cm[i][j] > Cm[i][i] + 1e-6) Cm[i][j] = 1e6;
    const a = hung(Cm); n++;
    G.forEach((x, i) => { const c = Cm[i][i] - Cm[i][a[i]]; if (Math.abs(c) > 1e5) return;
      if (c > 0) brut += c; else pierd += c; const M = peM.get(x.m) ?? peM.set(x.m, 0).get(x.m); peM.set(x.m, M + c);
      if (a[i] !== i) { mut++; const kk = `${x.m} (${CATEG[x.m] ?? '?'}): ${x.lin} → ${G[a[i]].lin}`; mutari.set(kk, (mutari.get(kk) ?? 0) + 1); }
      const ra = realAzi(x.d); if (ra != null) { real.curentReal += ra; real.curentVal += Cm[i][i]; real.n++; } });
  }
  return { varianta, esantion, grupe: n, brut: r1(brut), pierderi: r1(pierd), net: r1(brut + pierd), mutari: mut, steag: steag.length,
    peMasina: [...peM].map(([m, v]) => ({ m, tip: CATEG[m] ?? '?', km: r1(v) })).filter((x) => Math.abs(x.km) >= 0.1).sort((p, q) => q.km - p.km),
    frecvente: [...mutari].sort((p, q) => q[1] - p[1]).slice(0, 12).map(([k, z]) => `${k} ×${z}`),
    realVsValhalla: { zilePereche: real.n, real: r1(real.curentReal), valhalla: r1(real.curentVal) } };
}
OUT.R3 = { linie: await realoca('linie', true), capacitate: await realoca('capacitate', true), faraPierderi: await realoca('faraPierderi', true),
  capacitateToate: await realoca('capacitate', false), nepotriviri: nepotriviri.length, nepotriviriEx: [...new Set(nepotriviri.map((x) => x.split(' ').slice(0, 4).join(' ')))].slice(0, 12) };

// ---- agregare: pe flotă (eșantion B și toate L–V), pe mașină, 3 exemple; suprapunerile și ordinea fără dublă numărare
const S_ = (arr, f) => r1(arr.reduce((a, x) => a + (f(x) ?? 0), 0));
const peMasina = (arr, f) => { const o = {}; for (const x of arr) o[x.m] = r1((o[x.m] ?? 0) + (f(x) ?? 0)); return Object.entries(o).filter(([, v]) => v >= 0.1).sort((a, b) => b[1] - a[1]); };
const top3 = (arr, f) => [...arr].sort((a, b) => f(b) - f(a)).slice(0, 3);
const R = {};
for (const es of [true, false]) {
  const k = es ? 'esantion' : 'toateLV', q = (arr) => (es ? arr.filter((x) => x.esant) : arr);
  const n1 = q(OUT.R1n), s1 = q(OUT.R1s), r2 = q(OUT.R2), r4 = q(OUT.R4);
  R[k] = {
    R1n_C1: { n: n1.filter((x) => x.c1).length, km: S_(n1.filter((x) => x.c1), (x) => x.km), dejaLaX: n1.filter((x) => x.c1 && x.dejaLaX).length, kmDejaLaX: S_(n1.filter((x) => x.c1 && x.dejaLaX), (x) => x.km), noapteScurta: S_(n1.filter((x) => x.c1 && /^0[0-2]:.. → 0[3-7]/.test(x.ora)), (x) => x.km), inR1a: S_(n1.filter((x) => x.c1), (x) => x.inR1a) },
    R1n_C2: { n: n1.length, km: S_(n1, (x) => x.km), cost: S_(n1, (x) => x.cost), inR1a: S_(n1, (x) => x.inR1a) },
    R1s_C1: { n: s1.filter((x) => x.c1).length, km: S_(s1.filter((x) => x.c1), (x) => x.km) }, R1s_C2: { n: s1.length, km: S_(s1, (x) => x.km) },
    R2_cu83: { n: r2.filter((x) => x.eligibil83).length, km: S_(r2.filter((x) => x.eligibil83), (x) => x.cuPlafon) },
    R2_pereche_faraRestr: { n: r2.filter((x) => x.pereche).length, afara: S_(r2.filter((x) => x.pereche), (x) => x.afara), cuPlafon: S_(r2.filter((x) => x.pereche), (x) => x.cuPlafon), kmGol: S_(r2.filter((x) => x.pereche), (x) => x.kmGol) },
    R2_toateTurRetur: { n: r2.length, afara: S_(r2, (x) => x.afara), cuPlafon: S_(r2, (x) => x.cuPlafon), kmGol: S_(r2, (x) => x.kmGol), acasa: r2.filter((x) => x.acasa).length },
    R2_pe_durata: Object.fromEntries([[0, 2], [2, 5], [5, 9], [9, 99]].map(([a, b]) => { const x = r2.filter((y) => y.ore >= a && y.ore < b); return [`${a}-${b}h`, { n: x.length, afara: S_(x, (y) => y.afara) }]; })),
    R4_ocol: { n: r4.length, km: S_(r4, (x) => x.ocolR1b) }, R4_tot: { n: r4.length, km: S_(r4, (x) => x.tot) },
    R4_peTip: Object.fromEntries([...new Set(r4.map((x) => x.tip))].map((t) => [t, { n: r4.filter((x) => x.tip === t).length, ocol: S_(r4.filter((x) => x.tip === t), (x) => x.ocolR1b), tot: S_(r4.filter((x) => x.tip === t), (x) => x.tot) }])),
    // suprapuneri (același gol în două reguli)
    supra: {
      R2_si_R4: { n: r2.filter((x) => x.acasa).length, afaraR2: S_(r2.filter((x) => x.acasa), (x) => x.afara), totR4: S_(r4.filter((x) => x.tip === 'tur→retur'), (x) => x.tot) },
      R1s_si_R4: { n: s1.filter((x) => x.acasaMin >= CASA_MIN).length, km: S_(s1.filter((x) => x.acasaMin >= CASA_MIN), (x) => x.km) },
      R1n_in_R1a: S_(n1, (x) => x.inR1a),
    },
  };
  // ordinea fără dublă numărare: fiecare gol UNEI reguli după tipul trecerii; R-1 → R-2 → R-4; R-3 separat (margini)
  const golR1s = new Set(s1.map((x) => `${x.m}|${x.z}|${x.ora}`)), golR2 = new Set(r2.map((x) => `${x.m}|${x.z}|${x.ora}`));
  const r4rest = r4.filter((x) => !golR1s.has(`${x.m}|${x.z}|${x.ora}`) && !golR2.has(`${x.m}|${x.z}|${x.ora}`));
  R[k].ordine = { R1n: R[k].R1n_C1.km, R1s: R[k].R1s_C1.km, R2: R[k].R2_toateTurRetur.cuPlafon, R2faraPlafon: R[k].R2_toateTurRetur.afara, R4_rest_ocol: S_(r4rest, (x) => x.ocolR1b), R4_rest_tot: S_(r4rest, (x) => x.tot) };
}
const EX = {
  R1n: top3(OUT.R1n.filter((x) => x.c1 && x.esant), (x) => x.km).map((x) => `${x.m} ${x.z}→${x.z2} ${x.ora}: retur ${x.linX} la ${x.X}, tur ${x.linY} din ${x.Y}; seara ${x.seara} + dim. ${x.dim} km, noaptea la ${x.noapte} km de X → ${x.km} km`),
  R1s: top3(OUT.R1s, (x) => x.km).map((x) => `${x.m} ${x.z} ${x.ora} (${x.ore} h): retur ${x.de} la ${x.X} → tur ${x.spre} din ${x.Y}, C1=${x.c1}; gol ${x.kmGol} km ${JSON.stringify(x.cat)} → ${x.km}`),
  R2: top3(OUT.R2.filter((x) => x.esant), (x) => x.afara).map((x) => `${x.m} ${x.z} ${x.ora} (${x.ore} h) ${x.de}→${x.spre} pereche=${x.pereche} E=${x.E}: gol ${x.kmGol}, afară ${x.afara}, plafon ${x.plafon} (oprire ${x.lunga} min) → ${x.cuPlafon}; acasă ${x.acasaMin} min; §8.3 ${x.eligibil83}`),
  R4: top3(OUT.R4.filter((x) => x.esant), (x) => x.tot).map((x) => `${x.m} ${x.z} ${x.ora} (${x.ore} h) ${x.tip} ${x.de}→${x.spre}, acasă (${x.casa}) ${x.acasaMin} min: gol ${x.kmGol}, direct ${x.direct} → tot ${x.tot}, ocol R1b ${x.ocolR1b}`),
};
const MAS = {
  R1n: peMasina(OUT.R1n.filter((x) => x.c1 && x.esant), (x) => x.km), R1s: peMasina(OUT.R1s.filter((x) => x.esant), (x) => x.km),
  R2: peMasina(OUT.R2.filter((x) => x.esant), (x) => x.afara), R2plafon: peMasina(OUT.R2.filter((x) => x.esant), (x) => x.cuPlafon),
  R4ocol: peMasina(OUT.R4.filter((x) => x.esant), (x) => x.ocolR1b), R4tot: peMasina(OUT.R4.filter((x) => x.esant), (x) => x.tot),
};
const ref = { B: EC.flota.toate.masurat, esantion: EC.flota.toate.esantion, zileLV: EC.flota.toate.zileLV, km: EC.flota.toate.km, r2: { brut: EC.r2.castigBrut, pierderi: EC.r2.pierderi, net: EC.r2.castigFlota } };
writeFileSync('/tmp/ion120/patru-reguli.json', JSON.stringify({ rulat: new Date().toISOString(), ref, R, R3: OUT.R3, EX, MAS, liste: { R1n: OUT.R1n, R1s: OUT.R1s, R2: OUT.R2, R4: OUT.R4 } }, null, 1));
console.log("TIPURI", JSON.stringify(TIPURI));
console.log(JSON.stringify({ ref, R, EX, MAS: Object.fromEntries(Object.entries(MAS).map(([k, v]) => [k, v.slice(0, 12)])) }, null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(OUT.R3).map(([k, v]) => [k, typeof v === 'object' && !Array.isArray(v) ? { ...v, peMasina: v.peMasina.slice(0, 8).concat(v.peMasina.slice(-6)) } : v])), null, 1));
