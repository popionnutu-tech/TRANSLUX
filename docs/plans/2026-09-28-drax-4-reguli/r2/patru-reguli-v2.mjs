// ION-120 r2 — cele 4 reguli ale lui Ion (28.09.2026) după specificația unică docs/plans/2026-09-28-drax-4-reguli/runda-2.md
// (triajul Codex r1: C1–C4 acceptate). Săptămâna 14–20.09, rândul RESCRIS după ION-119 («cursă între uzine» = intreUzine, nu gol).
// DOAR CITIRE: economie-zile.json (bucățile zilei, cu proprietarul după categorie), economie.json (eșantionul §8.6, casa),
// analiza.json (lista «de lămurit»), schelet-ideal.json activ (capăt, locuri, mașinile fiecărei linii în fereastra scheletului).
// Valhalla (kmDrum din comun.mjs) pe o COPIE a cache-ului (ECON_D=/tmp/ion120r2/d); salveazaCache nu se cheamă; nimic în bază.
//   ECON_D=/tmp/ion120r2/d node patru-reguli-v2.mjs  →  /tmp/ion120r2/patru-reguli-v2.json + rezumat pe stdout
// Proprietarul fiecărei bucăți (C4): R-1 = livrare fără ocol la margine (prev null = dimineața, next null = seara), km fără golul impus;
// R-2 = golTure (orice tur → retur al aceleiași perechi), km din afara zonei plafonați §8.3, restul «nelămurit»; R-4 = livrare cu ocol
// (ION-115), oriunde; R-3 = schimb complet A ↔ B pe săptămână, cost Valhalla pe marginile NEACOPERITE de R-1, pe ambele părți.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PORTI, PARC, hav, hhmm, r1, kmDrum as kmDrum0 } from '/root/lde-worker/drax/cod/economie/comun.mjs';
let nNull = 0;
const kmDrum = async (a, b) => { if (a?.lat == null || b?.lat == null) return null; const v = await kmDrum0(a, b); if (v == null) nNull++; return v; };

const W = '/root/lde-worker/drax/date/saptamanal/2026-09-14';
const J = (f) => JSON.parse(readFileSync(f.startsWith('/') ? f : `${W}/${f}`, 'utf8'));
const ZZ = J('economie-zile.json'), EC = J('economie.json'), AN = J('analiza.json');
const S = J('/root/lde-worker/drax/date/ideal-activ/schelet-ideal.json');
const R1_VECHI = existsSync('/tmp/ion120/patru-reguli.json') ? J('/tmp/ion120/patru-reguli.json').liste.R1n : [];
const LIN = ZZ.linii;
const X_KM = 1.5, DEJA_KM = 2.5, ZONA = 3, NET_MIN = 50;
const ALIAS_M = { '0357544371228442': '880RNK', '350KAJ#2284': '350KAJ' };
const numeM = (m) => ALIAS_M[m] ?? m;
const pt = (a) => (a ? (Array.isArray(a) ? { lat: a[0], lon: a[1] } : a) : null);
const departeUz = (p) => Math.min(hav(p, PARC), ...PORTI.map((q) => hav(p, q)));
const grupeaza = (arr, f) => { const o = {}; for (const x of arr) (o[f(x)] ??= []).push(x); return o; };
const S_ = (arr, f) => r1(arr.reduce((a, x) => a + (f(x) ?? 0), 0));
const ziua = (z, k) => { const x = new Date(z + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };

// ---- eșantionul regulilor: zilele L–V din economie.json fără «exclus» (§8.6) și fără «de lămurit» pe livrare (analiza.json)
const eZi = new Map(EC.zile.map((x) => [`${x.m}|${x.z}`, x]));
const DL = AN.deLamurit ?? [];
const deLamurit = (d, cat) => DL.some((x) => x.m === d.m && (x.economie?.cat ?? []).includes(cat) && ((x.economie?.dow ?? []).includes(d.dow) || (x.economie?.zile ?? []).includes(d.z)));
const inEsant = (d, cat) => d.dow <= 5 && eZi.has(`${d.m}|${d.z}`) && !eZi.get(`${d.m}|${d.z}`).exclus && !deLamurit(d, cat);
const motivAfara = (d, cat) => (d.dow > 5 ? 'weekend' : !eZi.has(`${d.m}|${d.z}`) ? 'fără rând în economie.json' : eZi.get(`${d.m}|${d.z}`).exclus ? `§8.6: ${eZi.get(`${d.m}|${d.z}`).exclus}` : deLamurit(d, cat) ? 'de lămurit' : null);
const casaDe = new Map(EC.masini.map((x) => [x.m, x.casa ? { lat: x.casa.lat, lon: x.casa.lon } : null]));

const ZILE = ZZ.zile.filter((d) => d.seg.some((s) => s.cat === 'cuOameni'));
const zi = new Map(ZILE.map((d) => [`${d.m}|${d.z}`, d]));
const curse = (d) => d.seg.filter((s) => s.cat === 'cuOameni').sort((a, b) => a.t0 - b.t0);
const cheieB = (d, s) => `${d.m}|${d.z}|${s.t0}|${s.t1}|${s.cat}|${s.ocol ? 1 : 0}|${s.km}`;
const PROPRIETAR = new Map();   // bucata → regula (proba «niciun km în două reguli»)
const ia = (d, s, regula) => { const k = cheieB(d, s); if (PROPRIETAR.has(k) && PROPRIETAR.get(k) !== regula) throw new Error(`bucata ${k} în ${PROPRIETAR.get(k)} și ${regula}`); PROPRIETAR.set(k, regula); };
const margini = (d, care) => d.seg.filter((s) => s.cat === 'livrare' && !s.ocol && (care === 'dim' ? !s.prev : !s.next));

// ============ R-1: cheia mașină–noapte ============
// noaptea z → z+1 (ziua calendaristică următoare, amândouă cu curse). L–J → M–V = noapte de lucru; V → S și orice noapte cu sâmbătă/duminică = weekend.
const capatLin = (lin) => pt(LIN[lin]?.capatC);
const NOPTI = [];
for (const d of ZILE) {
  const d2 = zi.get(`${d.m}|${ziua(d.z, 1)}`); if (!d2) continue;
  const last = curse(d).at(-1), first = curse(d2)[0];
  const X = last?.sens === 'retur' ? capatLin(last.lin) : null;
  const noapte = d.noapteB ? pt(d.noapteB) : null;
  const seara = margini(d, 'seara'), dim = margini(d2, 'dim');
  const kS = S_(seara, (s) => s.km), kD = S_(dim, (s) => s.km);
  const inS = inEsant(d, 'livrare'), inD = inEsant(d2, 'livrare');
  const r = { m: d.m, noapte: `${d.z}→${d2.z}`, z: d.z, z2: d2.z, weekend: d2.dow > 5 || d.dow > 5,
    ora: `${last ? hhmm(last.t1) : '?'} → ${first ? hhmm(first.t0) : '?'}`, retur: last?.sens === 'retur' ? last.lin : null, tur: first?.sens === 'tur' ? first.lin : null,
    X: last?.sens === 'retur' ? LIN[last.lin]?.capat ?? null : null,
    returLaX: X && last.pana ? r1(hav(pt(last.pana), X)) : null, turDinX: X && first?.sens === 'tur' && first.de ? r1(hav(pt(first.de), X)) : null,
    noapteLaX: X && noapte ? r1(hav(noapte, X)) : null, noapteBalti: !!noapte && departeUz(noapte) <= ZONA, noapteTip: d.noapteB?.tip ?? null,
    seara: kS, dim: kD, golImpusS: S_(seara, (s) => s.golImpus), golImpusD: S_(dim, (s) => s.golImpus),
    esantS: inS, esantD: inD, motivS: inS ? null : motivAfara(d, 'livrare'), motivD: inD ? null : motivAfara(d2, 'livrare') };
  // eligibilitatea (spec): ultimul retur la X (≤ 1,5 km de capătul liniei), primul tur din X (≤ 1,5 km), locul nopții la > 2,5 km de X
  r.acelasiX = !!X && r.returLaX != null && r.returLaX <= X_KM && r.turDinX != null && r.turDinX <= X_KM;
  r.stare = !X ? (last?.sens !== 'retur' ? 'ziua nu se termină cu retur' : 'linie fără capăt în schelet')
    : r.returLaX > X_KM ? 'returul nu se termină la capăt' : first?.sens !== 'tur' ? 'ziua următoare nu începe cu tur'
    : r.turDinX > X_KM ? 'turul pornește din altă localitate' : !noapte ? 'locul nopții necunoscut' : r.noapteLaX <= DEJA_KM ? 'doarme deja la X' : 'ELIGIBIL';
  r.eligibil = r.stare === 'ELIGIBIL';
  r.kmToate = r.eligibil ? r1(kS + kD) : 0;
  r.kmEsant = r.eligibil ? r1((inS ? kS : 0) + (inD ? kD : 0)) : 0;
  r.inTotal = r.eligibil && !r.weekend && !r.noapteBalti;
  r.steag = r.weekend ? 'weekend' : r.noapteBalti ? 'noaptea în Bălți §7.4' : null;
  if (r.inTotal) { if (inS) for (const s of seara) ia(d, s, 'R-1'); if (inD) for (const s of dim) ia(d2, s, 'R-1'); }
  // emularea citirii business r1 (fără lista lor): același loc = sfârșitul returului ≤ 2,5 km de începutul turului, noaptea > 2,5 km, toate zilele
  const bX = last?.sens === 'retur' && first?.sens === 'tur' && last.pana && first.de && hav(pt(last.pana), pt(first.de)) <= DEJA_KM;
  r.business = bX && noapte ? (hav(noapte, pt(last.pana)) <= DEJA_KM ? 'deja' : 'ELIGIBIL') : 'nu';
  NOPTI.push(r);
}
// jumătățile de weekend nemăsurabile în fereastră: luni 14.09 dimineața (noaptea 13 → 14) și vineri seara fără sâmbătă (noaptea → 21.09)
const JUM_WE = [];
for (const d of ZILE.filter((x) => x.dow <= 5)) {
  if (d.dow === 1) { const f = curse(d)[0]; if (f?.sens === 'tur' && capatLin(f.lin) && f.de && hav(pt(f.de), capatLin(f.lin)) <= X_KM) JUM_WE.push({ m: d.m, z: d.z, jumatate: 'luni dimineața (noaptea duminică → luni)', lin: f.lin, km: S_(margini(d, 'dim'), (s) => s.km), esant: inEsant(d, 'livrare') }); }
  if (d.dow === 5 && !zi.has(`${d.m}|${ziua(d.z, 1)}`)) { const l = curse(d).at(-1); if (l?.sens === 'retur' && capatLin(l.lin) && l.pana && hav(pt(l.pana), capatLin(l.lin)) <= X_KM) JUM_WE.push({ m: d.m, z: d.z, jumatate: 'vineri seara (noaptea vineri → luni)', lin: l.lin, km: S_(margini(d, 'seara'), (s) => s.km), esant: inEsant(d, 'livrare') }); }
}
// reconcilierea cu r1 (analist, rândul de dinainte de ION-119) pe cheia mașină–noapte
const cheieN = (m, z) => `${m}|${z}`;
const nouN = new Map(NOPTI.map((x) => [cheieN(x.m, x.z), x]));
const RECON = [];
for (const v of R1_VECHI.filter((x) => x.c1)) {
  const n = nouN.get(cheieN(v.m, v.z));
  const motiv = !n ? 'noaptea lipsește din rândul nou' : n.eligibil ? (v.dejaLaX ? 'r1 o număra «deja la X» (1,5 km); acum eligibilă (> 2,5 km)' : Math.abs(n.kmToate - v.km) > 0.5 ? `km: r1 ${v.km} (cu golul impus și toate categoriile marginii, înainte de ION-119) → ${n.kmToate} (doar livrare)` : 'aceeași')
    : `acum: ${n.stare}${n.stare === 'returul nu se termină la capăt' || n.stare === 'turul pornește din altă localitate' ? ` (r1 potrivea după nume / capete GPS: retur ${n.returLaX} km, tur ${n.turDinX} km de capătul din schelet)` : ''}`;
  RECON.push({ m: v.m, noapte: `${v.z}→${v.z2}`, r1: { km: v.km, dejaLaX: v.dejaLaX, esant: v.esant }, r2: n ? { stare: n.stare, kmToate: n.kmToate, kmEsant: n.kmEsant, steag: n.steag } : null, motiv });
}
for (const n of NOPTI.filter((x) => x.eligibil)) if (!R1_VECHI.some((v) => v.c1 && cheieN(v.m, v.z) === cheieN(n.m, n.z)))
  RECON.push({ m: n.m, noapte: n.noapte, r1: null, r2: { stare: n.stare, kmToate: n.kmToate, kmEsant: n.kmEsant, steag: n.steag }, motiv: n.weekend ? 'nouă: r1 lua doar nopțile spre L–V (aceasta e vineri → sâmbătă)' : 'nouă: r1 n-o găsea' });

// ============ R-2: bucățile golTure ============
const R2 = [];
for (const d of ZILE.filter((x) => x.dow <= 5)) for (const s of d.seg.filter((q) => q.cat === 'golTure')) {
  const afara = Math.min(s.r3km ?? 0, s.km);
  let plafon = null, r2km = 0, nel = afara;
  if (afara > 0 && s.lunga && s.de) { const k = await kmDrum(pt(s.de), { lat: s.lunga[0], lon: s.lunga[1] }); plafon = k == null ? null : r1(2 * k * 1.05); r2km = Math.min(afara, plafon ?? 0); nel = afara - r2km; }
  const es = inEsant(d, 'golTure');
  R2.push({ m: d.m, z: d.z, ora: s.ora, lin: s.lin, schimb: s.schimb, kmGol: r1(s.km), afara: r1(afara), oprireMin: s.lunga?.[2] ?? 0, plafon, r2: r1(r2km), nelamurit: r1(nel), esant: es, pePeAcasa: !!s.pePeAcasa });
  if (es && r2km > 0) ia(d, s, 'R-2');
}

// ============ R-4: bucățile livrare cu ocol ============
const R4 = [];
for (const d of ZILE.filter((x) => x.dow <= 5)) for (const s of d.seg.filter((q) => q.cat === 'livrare' && q.ocol)) {
  const parte = (x) => { const t = (x ?? '').split(' '); return [t.slice(0, -2).join(' '), t.at(-2)]; };   // «R33|Iezărenii Vechi tur s1»
  const [linN, sensN] = parte(s.next), [linP, sensP] = parte(s.prev);
  const unde = sensN === 'tur' ? `la capătul ${LIN[linN]?.capat ?? linN}` : sensN === 'retur' ? 'la uzină' : '?';
  const es = inEsant(d, 'livrare');
  R4.push({ m: d.m, z: d.z, ora: s.ora, km: r1(s.km), trecere: `${sensP}→${sensN}`, de: s.prev, spre: s.next, perecheLiniiDiferite: linP !== linN, unde, esant: es });
  if (es) ia(d, s, 'R-4');
}

// ============ proba pe mașină (eșantion) ============
const MAS = [...new Set(ZILE.map((d) => d.m))].sort();
const PROBA = MAS.map((m) => {
  const Z = ZILE.filter((d) => d.m === m && d.dow <= 5);
  const baza = S_(Z, (d) => d.seg.filter((s) => ['livrare', 'golTure', 'golRuta', 'legatura'].includes(s.cat) && inEsant(d, s.cat === 'golTure' ? 'golTure' : 'livrare')).reduce((a, s) => a + s.km + (s.golImpus || 0), 0));
  const a = S_(NOPTI.filter((x) => x.m === m && x.inTotal), (x) => x.kmEsant), b = S_(R2.filter((x) => x.m === m && x.esant), (x) => x.r2), c = S_(R4.filter((x) => x.m === m && x.esant), (x) => x.km);
  return { m, R1: a, R2: b, R4: c, suma: r1(a + b + c), baza, ok: a + b + c <= baza + 0.05 };
});

// ============ R-3: schimb complet A ↔ B pe săptămână ============
// capacitatea = cea mai mare clasă de linie dusă de mașină în fereastra scheletului (schelet-ideal.json → masini[], toate zilele)
const capM = new Map(), capM3 = new Map();
for (const l of S) for (const q of l.masini ?? []) { const m = numeM(q.m); if (!l.locuri) continue;
  capM.set(m, Math.max(capM.get(m) ?? 0, l.locuri)); if ((q.zile ?? 0) >= 3) capM3.set(m, Math.max(capM3.get(m) ?? 0, l.locuri)); }
// atribuirea săptămânii (L–V): ziua → prima și ultima cursă, punctele marginii, acoperirea R-1 a nopților (din program, nu din mașină)
const acoperita = new Set(NOPTI.filter((x) => x.acelasiX).map((x) => cheieN(x.m, x.z)));   // noaptea z → z+1 cu același X în program
const PROG = new Map();
for (const m of MAS) {
  const Z = ZILE.filter((d) => d.m === m && d.dow <= 5).sort((a, b) => a.z.localeCompare(b.z));
  const zile = Z.map((d) => { const C = curse(d), f = C[0], l = C.at(-1);
    const pDim = f.sens === 'tur' ? capatLin(f.lin) ?? pt(f.de) : pt(f.de), pSea = l.sens === 'retur' ? capatLin(l.lin) ?? pt(l.pana) : pt(l.pana);
    const noapteAnt = zi.has(`${m}|${ziua(d.z, -1)}`) && acoperita.has(cheieN(m, ziua(d.z, -1)));
    return { z: d.z, pDim, pSea, dimAcop: noapteAnt, seaAcop: acoperita.has(cheieN(m, d.z)),
      linii: [...new Set(C.map((s) => s.lin))], schimburi: [...new Set(C.filter((s) => s.schimb).map((s) => `${s.lin} ${s.sens} ${s.schimb}`))],
      gpsMargini: r1(margini(d, 'dim').reduce((a, s) => a + s.km + (s.golImpus || 0), 0) * (noapteAnt ? 0 : 1) + margini(d, 'seara').reduce((a, s) => a + s.km + (s.golImpus || 0), 0) * (acoperita.has(cheieN(m, d.z)) ? 0 : 1)),
      exclus: !inEsant(d, 'livrare') };
  });
  const nevoie = Math.max(0, ...zile.flatMap((x) => x.linii.map((l) => LIN[l]?.locuri ?? 0)));
  PROG.set(m, { zile, nevoie, faraClasa: [...new Set(zile.flatMap((x) => x.linii).filter((l) => !LIN[l]?.locuri))] });
}
const costCache = new Map();
async function cost(casaM, progM) {   // Valhalla: casa → capătul primei curse + capătul ultimei curse → casa, pe marginile neacoperite de R-1
  const k = `${casaM}|${progM}`; if (costCache.has(k)) return costCache.get(k);
  const c = casaDe.get(casaM); if (!c) return null;
  let s = 0;
  for (const x of PROG.get(progM).zile) {
    if (!x.dimAcop) { const v = await kmDrum(c, x.pDim); if (v == null) return null; s += v; }
    if (!x.seaAcop) { const v = await kmDrum(x.pSea, c); if (v == null) return null; s += v; }
  }
  costCache.set(k, s); return s;
}
const R3 = { perechi: [], fezabile: 0, respinseCap: 0, faraCasa: 0, azi: [] };
for (const m of MAS) { const v = await cost(m, m); R3.azi.push({ m, valhalla: v == null ? null : r1(v), gps: S_(PROG.get(m).zile, (x) => x.gpsMargini), cap: capM.get(m) ?? null, nevoie: PROG.get(m).nevoie }); }
for (let i = 0; i < MAS.length; i++) for (let j = i + 1; j < MAS.length; j++) {
  const A = MAS[i], B = MAS[j], PA = PROG.get(A), PB = PROG.get(B);
  if (!casaDe.get(A) || !casaDe.get(B)) { R3.faraCasa++; continue; }
  if ((capM.get(A) ?? 0) < PB.nevoie || (capM.get(B) ?? 0) < PA.nevoie) { R3.respinseCap++; continue; }
  const aa = await cost(A, A), bb = await cost(B, B), ab = await cost(A, B), ba = await cost(B, A);
  if ([aa, bb, ab, ba].some((x) => x == null)) continue;
  R3.fezabile++;
  const gA = aa - ab, gB = bb - ba;   // A preia programul lui B, B pe al lui A
  R3.perechi.push({ A, B, net: r1(gA + gB), castigA: r1(gA), castigB: r1(gB), aziA: r1(aa), aziB: r1(bb), dupaA: r1(ab), dupaB: r1(ba),
    cap3ok: (capM3.get(A) ?? 0) >= PB.nevoie && (capM3.get(B) ?? 0) >= PA.nevoie, capA: capM.get(A), capB: capM.get(B), nevoieA: PA.nevoie, nevoieB: PB.nevoie });
}
R3.perechi.sort((p, q) => q.net - p.net);
const luat = new Set(), PROPUSE = [];
for (const p of R3.perechi) { if (p.net < NET_MIN) break; if (luat.has(p.A) || luat.has(p.B)) continue; luat.add(p.A); luat.add(p.B);
  PROPUSE.push({ ...p, programA: PROG.get(p.A).zile.map((x) => `${x.z}: ${x.schimburi.join(', ')}`), programB: PROG.get(p.B).zile.map((x) => `${x.z}: ${x.schimburi.join(', ')}`),
    zileExcluseA: PROG.get(p.A).zile.filter((x) => x.exclus).length, zileExcluseB: PROG.get(p.B).zile.filter((x) => x.exclus).length }); }
const luatFP = new Set(), FARA_PIERDERI = [];
for (const p of R3.perechi.filter((q) => q.castigA >= 0 && q.castigB >= 0)) { if (p.net < NET_MIN) break; if (luatFP.has(p.A) || luatFP.has(p.B)) continue; luatFP.add(p.A); luatFP.add(p.B); FARA_PIERDERI.push(p); }

// ============ agregarea ============
const N_LV = EC.flota.toate.zileLV, N_ES = EC.flota.toate.esantion, F = N_LV / N_ES;
const el = NOPTI.filter((x) => x.eligibil);
const rez = {
  sursa: { rand: W, economieZileRulat: ZZ.rulat, economieRulat: EC.rulat, schelet: 'ideal-activ → ' + 'ideal-v4.3', zileLV: N_LV, esantion: N_ES, factorExtrapolare: +F.toFixed(4) },
  R1: {
    nopti: NOPTI.length, noptiLucru: NOPTI.filter((x) => !x.weekend).length,
    peStare: Object.fromEntries([...new Set(NOPTI.map((x) => x.stare))].map((k) => [k, { n: NOPTI.filter((x) => x.stare === k).length, kmMargini: S_(NOPTI.filter((x) => x.stare === k), (x) => x.seara + x.dim) }])),
    eligibileToate: { n: el.length, km: S_(el, (x) => x.kmToate) },
    inTotal: { n: el.filter((x) => x.inTotal).length, kmToateZilele: S_(el.filter((x) => x.inTotal), (x) => x.kmToate), kmEsant: S_(el.filter((x) => x.inTotal), (x) => x.kmEsant),
      jumatatiScoase: el.filter((x) => x.inTotal && (!x.esantS || !x.esantD)).length, extrapolat: Math.round(S_(el.filter((x) => x.inTotal), (x) => x.kmEsant) * F) },
    steag: { weekend: { n: el.filter((x) => x.weekend).length, km: S_(el.filter((x) => x.weekend), (x) => x.kmToate) }, balti: { n: el.filter((x) => !x.weekend && x.noapteBalti).length, km: S_(el.filter((x) => !x.weekend && x.noapteBalti), (x) => x.kmToate) },
      jumatatiWeekendNemasurabile: { n: JUM_WE.length, km: S_(JUM_WE, (x) => x.km) } },
    dejaLaX: { n: NOPTI.filter((x) => x.stare === 'doarme deja la X').length, km: S_(NOPTI.filter((x) => x.stare === 'doarme deja la X'), (x) => x.seara + x.dim) },
    business: { eligibil: NOPTI.filter((x) => x.business === 'ELIGIBIL').length, km: S_(NOPTI.filter((x) => x.business === 'ELIGIBIL'), (x) => x.seara + x.dim), deja: NOPTI.filter((x) => x.business === 'deja').length,
      eligibilLucru: NOPTI.filter((x) => x.business === 'ELIGIBIL' && !x.weekend).length, kmLucru: S_(NOPTI.filter((x) => x.business === 'ELIGIBIL' && !x.weekend), (x) => x.seara + x.dim),
      diferenteSpec: NOPTI.filter((x) => (x.business === 'ELIGIBIL') !== x.eligibil).map((x) => `${x.m} ${x.noapte}: business ${x.business}, spec ${x.stare} (retur ${x.returLaX} / tur ${x.turDinX} km de capăt, noaptea ${x.noapteLaX} km)`) },
    reconR1: { r1C1: R1_VECHI.filter((x) => x.c1).length, r1km: S_(R1_VECHI.filter((x) => x.c1), (x) => x.km), r1Deja: R1_VECHI.filter((x) => x.c1 && x.dejaLaX).length,
      peMotiv: Object.fromEntries(Object.entries(grupeaza(RECON, (x) => x.motiv.split(':')[0].split(' (')[0] + (x.motiv.startsWith('acum') ? ': ' + x.r2?.stare : ''))).map(([k, v]) => [k, { n: v.length, kmR1: S_(v, (x) => x.r1?.km ?? 0), kmR2: S_(v, (x) => x.r2?.kmToate ?? 0) }])) },
    peMasina: Object.entries(grupeaza(el.filter((x) => x.inTotal), (x) => x.m)).map(([m, v]) => ({ m, nopti: v.length, kmEsant: S_(v, (x) => x.kmEsant), kmToate: S_(v, (x) => x.kmToate), X: [...new Set(v.map((x) => x.X))].join('/'), noapteLaX: Math.max(...v.map((x) => x.noapteLaX)) })).sort((a, b) => b.kmEsant - a.kmEsant),
  },
  R2: (() => { const e = R2.filter((x) => x.esant); return {
    bucati: { toate: R2.length, esant: e.length }, kmGol: S_(e, (x) => x.kmGol), afara: S_(e, (x) => x.afara), plafonat: S_(e, (x) => x.r2), nelamurit: S_(e, (x) => x.nelamurit),
    nelamuritFaraOprire: S_(e.filter((x) => x.afara > 0 && !x.oprireMin), (x) => x.nelamurit), nelamuritPestePlafon: S_(e.filter((x) => x.oprireMin), (x) => x.nelamurit),
    extrapolat: Math.round(S_(e, (x) => x.r2) * F), toateZilele: { afara: S_(R2, (x) => x.afara), plafonat: S_(R2, (x) => x.r2) },
    peMasina: Object.entries(grupeaza(e.filter((x) => x.afara > 0), (x) => x.m)).map(([m, v]) => ({ m, r2: S_(v, (x) => x.r2), nelamurit: S_(v, (x) => x.nelamurit), bucati: v.length })) }; })(),
  R4: (() => { const e = R4.filter((x) => x.esant); return {
    bucati: e.length, km: S_(e, (x) => x.km), extrapolat: Math.round(S_(e, (x) => x.km) * F), toateZilele: S_(R4, (x) => x.km),
    peTrecere: Object.fromEntries(Object.entries(grupeaza(e, (x) => x.trecere + (x.perecheLiniiDiferite ? ' (linii diferite)' : ' (aceeași linie)'))).map(([k, v]) => [k, { n: v.length, km: S_(v, (x) => x.km) }])),
    peUnde: { laCapat: S_(e.filter((x) => x.unde.startsWith('la capătul')), (x) => x.km), laUzina: S_(e.filter((x) => x.unde === 'la uzină'), (x) => x.km) },
    economieJson: EC.flota.toate.masurat.R1b,
    peMasina: Object.entries(grupeaza(e, (x) => x.m)).map(([m, v]) => ({ m, km: S_(v, (x) => x.km), bucati: v.length })).sort((a, b) => b.km - a.km) }; })(),
  R3: { masini: MAS.length, perechiTotal: MAS.length * (MAS.length - 1) / 2, fezabile: R3.fezabile, respinseCapacitate: R3.respinseCap, faraCasa: R3.faraCasa,
    aziValhalla: S_(R3.azi, (x) => x.valhalla), aziGps: S_(R3.azi, (x) => x.gps),
    peste50: R3.perechi.filter((p) => p.net >= NET_MIN).length, propuse: PROPUSE.length, netPropus: S_(PROPUSE, (p) => p.net),
    pierderiInPropuse: S_(PROPUSE, (p) => Math.min(0, p.castigA) + Math.min(0, p.castigB)), cap3okPropuse: PROPUSE.filter((p) => p.cap3ok).length,
    faraPierderi: { propuse: FARA_PIERDERI.length, net: S_(FARA_PIERDERI, (p) => p.net) } },
  proba: { masini: PROBA.length, ok: PROBA.filter((x) => x.ok).length, rele: PROBA.filter((x) => !x.ok), bucatiCuProprietar: PROPRIETAR.size, peRegula: Object.fromEntries(['R-1', 'R-2', 'R-4'].map((k) => [k, [...PROPRIETAR.values()].filter((v) => v === k).length])) },
  valhallaNull: nNull,
};
rez.flota = { R1: { masurat: rez.R1.inTotal.kmEsant, extrapolat: rez.R1.inTotal.extrapolat }, R2: { masurat: rez.R2.plafonat, extrapolat: rez.R2.extrapolat, nelamurit: rez.R2.nelamurit },
  R4: { masurat: rez.R4.km, extrapolat: rez.R4.extrapolat }, R3: { masuratToateZilele: rez.R3.netPropus, nota: 'pe toate zilele L–V (Valhalla ambele părți), fără extrapolare; separat, cu semn' },
  sumaR1R2R4: { masurat: r1(rez.R1.inTotal.kmEsant + rez.R2.plafonat + rez.R4.km), extrapolat: rez.R1.inTotal.extrapolat + rez.R2.extrapolat + rez.R4.extrapolat } };
writeFileSync('/tmp/ion120r2/patru-reguli-v2.json', JSON.stringify({ rulat: new Date().toISOString(), rez, liste: { nopti: NOPTI, jumatatiWeekend: JUM_WE, reconciliere: RECON, R2, R4, proba: PROBA,
  R3: { azi: R3.azi, propuse: PROPUSE, faraPierderi: FARA_PIERDERI, top30: R3.perechi.slice(0, 30), capacitate: Object.fromEntries(capM), capacitate3zile: Object.fromEntries(capM3), program: Object.fromEntries([...PROG].map(([m, p]) => [m, { nevoie: p.nevoie, faraClasa: p.faraClasa, zile: p.zile.map((x) => ({ z: x.z, schimburi: x.schimburi, dimAcop: x.dimAcop, seaAcop: x.seaAcop })) }])) } } }, null, 1));
console.log(JSON.stringify({ ...rez, R1: { ...rez.R1, business: { ...rez.R1.business, diferenteSpec: rez.R1.business.diferenteSpec.slice(0, 40) } } }, null, 1));
console.log('PROPUSE', JSON.stringify(PROPUSE.map((p) => ({ A: p.A, B: p.B, net: p.net, gA: p.castigA, gB: p.castigB, azi: [p.aziA, p.aziB], dupa: [p.dupaA, p.dupaB], cap: [p.capA, p.capB], nevoie: [p.nevoieA, p.nevoieB], cap3: p.cap3ok, excl: [p.zileExcluseA, p.zileExcluseB] }))));
console.log('RECON', JSON.stringify(RECON.filter((x) => x.motiv !== 'aceeași').slice(0, 80)));
