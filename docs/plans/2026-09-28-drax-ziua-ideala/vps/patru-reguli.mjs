// ION-120 — cele 4 reguli ale lui Ion (verdictul dezbaterii Claude + Codex: Codex r3 10/10, 28.09.2026; sursa: docs/plans/2026-09-28-drax-4-reguli/r3/patru-reguli-v3.mjs)
// r3 —, după runda-3.md (deciziile lui Ion 1–5 din 28.09.2026 + triajul Codex r2 C5–C8, toate acceptate).
// Pornește din r2/patru-reguli-v2.mjs. Săptămâna 14–20.09, rândul rescris după ION-119.
// DOAR CITIRE: economie-zile.json, economie.json (eșantionul §8.6, casa, zilele), analiza.json («de lămurit»), schelet-ideal.json activ.
// Valhalla (kmDrum din comun.mjs) pe o COPIE a cache-ului (ECON_D=/tmp/ion120r3/d); nimic în bază, codul VPS neatins.
//   ECON_D=/tmp/ion120r3/d node patru-reguli-v3.mjs  →  /tmp/ion120r3/patru-reguli-v3.json + rezumat pe stdout
// Schimbările față de v2:
//  R-1 (Ion 1, C8): nopțile în Bălți în afara totalului, raportate pe eșantion (kmEsant) + extrapolat; toate zilele doar diagnostic.
//  R-1 (Ion 2, §12.2): propunerea pe mașină doar dacă R-1 pe săptămână ≥ 100 km (km/zi măsurat × zilele L–V cu curse, ≥ 3 zile măsurate);
//       distanța locul nopții → X alături; naveta nu se numără (§5.10). Proprietarul bucăților R-1 = doar nopțile PROPUSE.
//  R-2 (Ion 3): fără plafonul §8.3 — toți km-ii din afara zonei uzinei între tur și retur (golTure); fără «nelămurit».
//  R-4: neschimbat.
//  R-3 (Ion 4, C5, C6, C7): costul de azi = rezidualul GPS al marginilor (livrare fără ocol, FĂRĂ golul impus) după R-1 propus;
//       costul după schimb = Valhalla (casa noii mașini → capetele), doar pe marginile rămase; stările nopților comune: R-1 (acoperită,
//       cost 0 pentru orice mașină), deja la X / Bălți / weekend / R-1 sub prag / neeligibilă (cost: GPS azi, Valhalla după);
//       mașinile cu vreo zi în afara eșantionului (§8.6 / de lămurit) nu intră în propuneri; criteriul lui Ion: totalul flotei
//       (A + B) scade ≥ 50 km/săpt.; toți candidații «capacitate de confirmat» (passenger_seats NULL). Valhalla–Valhalla = diagnostic.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PORTI, PARC, hav, hhmm, r1, kmDrum as kmDrum0 } from '/root/lde-worker/drax/cod/economie/comun.mjs';
let nNull = 0;
const kmDrum = async (a, b) => { if (a?.lat == null || b?.lat == null) return null; const v = await kmDrum0(a, b); if (v == null) nNull++; return v; };

// ION-120 (în lanț, 28.09.2026): dosarul săptămânii e argumentul (ECON_D al lui saptamanal.sh); ieșirea: <dosar>/patru-reguli.json
const W = process.argv[2];
if (!W || !existsSync(`${W}/analiza.json`)) { console.error('patru-reguli.mjs <dosarul săptămânii> (lipsește analiza.json)'); process.exit(2); }
const OUT = W;
const J = (f) => JSON.parse(readFileSync(f.startsWith('/') ? f : `${W}/${f}`, 'utf8'));
const ZZ = J('economie-zile.json'), EC = J('economie.json'), AN = J('analiza.json');
const S = J('schelet-ideal.json');   // instantaneul scheletului din dosarul săptămânii (același pe care l-a folosit rândul)
const LIN = ZZ.linii;
const X_KM = 1.5, DEJA_KM = 2.5, ZONA = 3, NET_MIN = 50, PRAG_MASINA = 100, ZILE_MIN = 3;
const ALIAS_M = { '0357544371228442': '880RNK', '350KAJ#2284': '350KAJ' };
const numeM = (m) => ALIAS_M[m] ?? m;
const pt = (a) => (a ? (Array.isArray(a) ? { lat: a[0], lon: a[1] } : a) : null);
const departeUz = (p) => Math.min(hav(p, PARC), ...PORTI.map((q) => hav(p, q)));
const grupeaza = (arr, f) => { const o = {}; for (const x of arr) (o[f(x)] ??= []).push(x); return o; };
const S_ = (arr, f) => r1(arr.reduce((a, x) => a + (f(x) ?? 0), 0));
const ziua = (z, k) => { const x = new Date(z + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
const med = (a) => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : null; };

// ---- eșantionul regulilor: zilele L–V din economie.json fără «exclus» (§8.6) și fără «de lămurit»
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
const PROPRIETAR = new Map();   // bucata → regula (proba «niciun km în două reguli», inclusiv R-3)
const ia = (d, s, regula) => { const k = cheieB(d, s); if (PROPRIETAR.has(k) && PROPRIETAR.get(k) !== regula) throw new Error(`bucata ${k} în ${PROPRIETAR.get(k)} și ${regula}`); PROPRIETAR.set(k, regula); };
const margini = (d, care) => d.seg.filter((s) => s.cat === 'livrare' && !s.ocol && (care === 'dim' ? !s.prev : !s.next));
const MAS = [...new Set(ZILE.map((d) => d.m))].sort();
// zilele mașinii (L–V cu curse) și zilele măsurate (în eșantion) — pentru §12.2
const zileLV = (m) => ZILE.filter((d) => d.m === m && d.dow <= 5);
const zileMas = (m) => zileLV(m).filter((d) => inEsant(d, 'livrare'));

// ============ R-1: cheia mașină–noapte ============
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
  r.acelasiX = !!X && r.returLaX != null && r.returLaX <= X_KM && r.turDinX != null && r.turDinX <= X_KM;
  r.stare = !X ? (last?.sens !== 'retur' ? 'ziua nu se termină cu retur' : 'linie fără capăt în schelet')
    : r.returLaX > X_KM ? 'returul nu se termină la capăt' : first?.sens !== 'tur' ? 'ziua următoare nu începe cu tur'
    : r.turDinX > X_KM ? 'turul pornește din altă localitate' : !noapte ? 'locul nopții necunoscut' : r.noapteLaX <= DEJA_KM ? 'doarme deja la X' : 'ELIGIBIL';
  r.eligibil = r.stare === 'ELIGIBIL';
  r.kmToate = r.eligibil ? r1(kS + kD) : 0;
  r.kmEsant = r.eligibil ? r1((inS ? kS : 0) + (inD ? kD : 0)) : 0;
  r.inTotal = r.eligibil && !r.weekend && !r.noapteBalti;          // Ion 1: Bălți rămâne separat (§7.4)
  r.steag = r.weekend ? 'weekend' : r.noapteBalti ? 'noaptea în Bălți §7.4' : null;
  r._d = d; r._d2 = d2; r._seara = seara; r._dim = dim;
  NOPTI.push(r);
}
// Ion 2 + §12.2: R-1 pe săptămână pe mașină = (km R-1 pe eșantion / zilele măsurate) × zilele L–V cu curse, doar cu ≥ 3 zile măsurate
const R1M = MAS.map((m) => {
  const v = NOPTI.filter((x) => x.m === m && x.inTotal);
  const nZ = zileLV(m).length, nMas = zileMas(m).length, km = S_(v, (x) => x.kmEsant);
  const sapt = nMas ? r1(km / nMas * nZ) : 0;
  const dist = v.map((x) => x.noapteLaX).filter((x) => x != null);
  const motiv = !v.length ? 'fără nopți R-1' : nMas < ZILE_MIN ? `doar ${nMas} zile măsurate (< ${ZILE_MIN}, §12.2)` : sapt < PRAG_MASINA ? `sub prag (${sapt} < ${PRAG_MASINA} km/săpt.)` : null;
  return { m, nopti: v.length, kmEsant: km, kmToate: S_(v, (x) => x.kmToate), zileLV: nZ, zileMasurate: nMas, kmSapt12_2: sapt, propus: !motiv, motiv,
    X: [...new Set(v.map((x) => x.X))].join(' / '), soferKm: { min: dist.length ? Math.min(...dist) : null, med: med(dist), max: dist.length ? Math.max(...dist) : null },
    noptiDetaliu: v.map((x) => ({ noapte: x.noapte, ora: x.ora, X: x.X, retur: x.retur, tur: x.tur, locNoapteLaX: x.noapteLaX, seara: x.esantS ? x.seara : 0, dim: x.esantD ? x.dim : 0 })) };
}).filter((x) => x.nopti);
const R1_PROPUS = new Set(R1M.filter((x) => x.propus).map((x) => x.m));
for (const r of NOPTI) {
  r.propus = r.inTotal && R1_PROPUS.has(r.m);
  if (r.propus) { if (r.esantS) for (const s of r._seara) ia(r._d, s, 'R-1'); if (r.esantD) for (const s of r._dim) ia(r._d2, s, 'R-1'); }
}
// jumătățile de weekend nemăsurabile în fereastră
const JUM_WE = [];
for (const d of ZILE.filter((x) => x.dow <= 5)) {
  if (d.dow === 1) { const f = curse(d)[0]; if (f?.sens === 'tur' && capatLin(f.lin) && f.de && hav(pt(f.de), capatLin(f.lin)) <= X_KM) JUM_WE.push({ m: d.m, z: d.z, jumatate: 'luni dimineața', lin: f.lin, km: S_(margini(d, 'dim'), (s) => s.km), esant: inEsant(d, 'livrare') }); }
  if (d.dow === 5 && !zi.has(`${d.m}|${ziua(d.z, 1)}`)) { const l = curse(d).at(-1); if (l?.sens === 'retur' && capatLin(l.lin) && l.pana && hav(pt(l.pana), capatLin(l.lin)) <= X_KM) JUM_WE.push({ m: d.m, z: d.z, jumatate: 'vineri seara', lin: l.lin, km: S_(margini(d, 'seara'), (s) => s.km), esant: inEsant(d, 'livrare') }); }
}

// ============ R-2 (Ion 3): golTure, TOȚI km-ii din afara zonei, fără plafon ============
const R2 = [];
for (const d of ZILE.filter((x) => x.dow <= 5)) for (const s of d.seg.filter((q) => q.cat === 'golTure')) {
  const afara = Math.min(s.r3km ?? 0, s.km);
  const es = inEsant(d, 'golTure');
  R2.push({ m: d.m, z: d.z, ora: s.ora, lin: s.lin, schimb: s.schimb, kmGol: r1(s.km), afara: r1(afara), oprireMin: s.lunga?.[2] ?? 0, r2: r1(afara), esant: es, motiv: es ? null : motivAfara(d, 'golTure') });
  if (es && afara > 0) ia(d, s, 'R-2');
}

// ============ R-4: livrare cu ocol (neschimbat) ============
const R4 = [];
for (const d of ZILE.filter((x) => x.dow <= 5)) for (const s of d.seg.filter((q) => q.cat === 'livrare' && q.ocol)) {
  const parte = (x) => { const t = (x ?? '').split(' '); return [t.slice(0, -2).join(' '), t.at(-2)]; };
  const [linN, sensN] = parte(s.next), [linP, sensP] = parte(s.prev);
  const unde = sensN === 'tur' ? `la capătul ${LIN[linN]?.capat ?? linN}` : sensN === 'retur' ? 'la uzină' : '?';
  const es = inEsant(d, 'livrare');
  R4.push({ m: d.m, z: d.z, ora: s.ora, km: r1(s.km), trecere: `${sensP}→${sensN}`, de: s.prev, spre: s.next, perecheLiniiDiferite: linP !== linN, unde, esant: es });
  if (es) ia(d, s, 'R-4');
}

// ============ proba pe mașină (eșantion) ============
const PROBA = MAS.map((m) => {
  const Z = zileLV(m);
  const baza = S_(Z, (d) => d.seg.filter((s) => ['livrare', 'golTure', 'golRuta', 'legatura'].includes(s.cat) && inEsant(d, s.cat === 'golTure' ? 'golTure' : 'livrare')).reduce((a, s) => a + s.km + (s.golImpus || 0), 0));
  const a = S_(NOPTI.filter((x) => x.m === m && x.propus), (x) => x.kmEsant), aM = S_(NOPTI.filter((x) => x.m === m && x.inTotal), (x) => x.kmEsant);
  const b = S_(R2.filter((x) => x.m === m && x.esant), (x) => x.r2), c = S_(R4.filter((x) => x.m === m && x.esant), (x) => x.km);
  return { m, R1propus: a, R1masurat: aM, R2: b, R4: c, suma: r1(aM + b + c), baza, ok: aM + b + c <= baza + 0.05 };
});

// ============ R-3: schimb complet A ↔ B pe săptămână ============
// capacitatea OBSERVATĂ (C7: nu e confirmată): cea mai mare clasă de linie dusă de mașină în fereastra scheletului
const capM = new Map(), capM3 = new Map();
// Ion, 28.09.2026: «27 locuri 043/041/917/302/457/912, restul 20 locuri, daf-urile 50» (migr. 424, vehicles.passenger_seats; tipul, migr. 422, doar dacă mașina n-are): capacitatea mașinii =
// max(locurile tipului ei, clasa cea mai mare de linie dusă deja). Tipurile fără cifră (microbuzele 20–30) rămân pe clasa observată.
const LOC = new Map();
{ const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (SB && KEY) { const g = async (q) => { const r = await fetch(`${SB}/rest/v1/${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }); if (!r.ok) throw new Error(`${q}: HTTP ${r.status}`); return r.json(); };
    const [v, n, t] = await Promise.all([g('vehicles?select=id,plate_number,passenger_seats'), g('lde_vehicle_norms?select=vehicle_id,vehicle_type_id'), g('lde_vehicle_types?select=id,passenger_seats')]);
    const loc = new Map(t.filter((x) => x.passenger_seats).map((x) => [x.id, x.passenger_seats])), tipV = new Map(n.filter((x) => x.vehicle_type_id).map((x) => [x.vehicle_id, loc.get(x.vehicle_type_id)]));
    const canon = (p) => { const q = String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const m = q.match(/^([A-Z]{3})(\d{3})$/); return m ? m[2] + m[1] : q; };
    // Ion, 28.09.2026 (migr. 424): locurile PE MAȘINĂ (vehicles.passenger_seats) bat locurile tipului
    for (const x of v) { const l = x.passenger_seats ?? tipV.get(x.id); if (l) LOC.set(canon(x.plate_number), l); } }
  else console.error('atenție: fără SUPABASE_URL — locurile pe tip nu se citesc, capacitatea rămâne cea observată'); }
for (const l of S) for (const q of l.masini ?? []) { const m = numeM(q.m); if (!l.locuri) continue;
  capM.set(m, Math.max(capM.get(m) ?? 0, l.locuri)); if ((q.zile ?? 0) >= 3) capM3.set(m, Math.max(capM3.get(m) ?? 0, l.locuri)); }
for (const [m, l] of LOC) { capM.set(m, Math.max(capM.get(m) ?? 0, l)); capM3.set(m, Math.max(capM3.get(m) ?? 0, l)); }
// C6: starea comună a fiecărei jumătăți de noapte a programului, după R-1 propus / R-2 / R-4
const nMap = new Map(NOPTI.map((x) => [`${x.m}|${x.z}`, x]));
const stareJum = (m, zSeara) => {   // noaptea zSeara → zSeara+1 a mașinii m
  const n = nMap.get(`${m}|${zSeara}`);
  if (!n) return 'weekend / fără zi vecină';
  if (n.propus) return 'R-1 (acoperită)';
  if (n.stare === 'doarme deja la X') return 'deja la X';
  if (n.eligibil && n.noapteBalti) return 'Bălți (exclusă §7.4)';
  if (n.eligibil && n.weekend) return 'weekend';
  if (n.eligibil) return 'R-1 sub prag';
  return 'neeligibilă';
};
const PROG = new Map();
for (const m of MAS) {
  const Z = zileLV(m).sort((a, b) => a.z.localeCompare(b.z));
  const zile = Z.map((d) => { const C = curse(d), f = C[0], l = C.at(-1);
    const pDim = f.sens === 'tur' ? capatLin(f.lin) ?? pt(f.de) : pt(f.de), pSea = l.sens === 'retur' ? capatLin(l.lin) ?? pt(l.pana) : pt(l.pana);
    const stDim = stareJum(m, ziua(d.z, -1)), stSea = stareJum(m, d.z);
    const bDim = margini(d, 'dim'), bSea = margini(d, 'seara');
    return { z: d.z, pDim, pSea, stDim, stSea, dimAcop: stDim === 'R-1 (acoperită)', seaAcop: stSea === 'R-1 (acoperită)',
      gpsDim: S_(bDim, (s) => s.km), gpsSea: S_(bSea, (s) => s.km), golImpus: r1(S_(bDim, (s) => s.golImpus) + S_(bSea, (s) => s.golImpus)), _d: d, _bDim: bDim, _bSea: bSea,
      linii: [...new Set(C.map((s) => s.lin))], schimburi: [...new Set(C.filter((s) => s.schimb).map((s) => `${s.lin} ${s.sens} ${s.schimb}`))],
      exclus: !inEsant(d, 'livrare'), motivExclus: inEsant(d, 'livrare') ? null : motivAfara(d, 'livrare') };
  });
  const nevoie = Math.max(0, ...zile.flatMap((x) => x.linii.map((l) => LIN[l]?.locuri ?? 0)));
  const gpsRezidual = r1(zile.reduce((a, x) => a + (x.dimAcop ? 0 : x.gpsDim) + (x.seaAcop ? 0 : x.gpsSea), 0));
  PROG.set(m, { zile, nevoie, gpsRezidual, zileExcluse: zile.filter((x) => x.exclus).length, faraClasa: [...new Set(zile.flatMap((x) => x.linii).filter((l) => !LIN[l]?.locuri))] });
}
const costCache = new Map();
async function costV(casaM, progM) {   // Valhalla: casa → capătul primei curse + capătul ultimei curse → casa, pe marginile neacoperite de R-1 propus
  const k = `${casaM}|${progM}`; if (costCache.has(k)) return costCache.get(k);
  const c = casaDe.get(casaM); if (!c) return null;
  let s = 0;
  for (const x of PROG.get(progM).zile) {
    if (!x.dimAcop) { const v = await kmDrum(c, x.pDim); if (v == null) return null; s += v; }
    if (!x.seaAcop) { const v = await kmDrum(x.pSea, c); if (v == null) return null; s += v; }
  }
  costCache.set(k, s); return s;
}
const R3 = { perechi: [], diag: [], fezabileObs: 0, respinseCapObs: 0, faraCasa: 0, cuZileExcluse: 0, azi: [] };
for (const m of MAS) { const p = PROG.get(m), v = await costV(m, m);
  R3.azi.push({ m, gpsRezidual: p.gpsRezidual, valhallaPropriu: v == null ? null : r1(v), biasGpsMinusValhalla: v == null ? null : r1(p.gpsRezidual - v), zileExcluse: p.zileExcluse, cap: capM.get(m) ?? null, nevoie: p.nevoie, casa: !!casaDe.get(m) }); }
const eligR3 = (m) => PROG.get(m).zileExcluse === 0 && !!casaDe.get(m);
for (let i = 0; i < MAS.length; i++) for (let j = i + 1; j < MAS.length; j++) {
  const A = MAS[i], B = MAS[j], PA = PROG.get(A), PB = PROG.get(B);
  if (!casaDe.get(A) || !casaDe.get(B)) { R3.faraCasa++; continue; }
  const aa = await costV(A, A), bb = await costV(B, B), ab = await costV(A, B), ba = await costV(B, A);
  if ([aa, bb, ab, ba].some((x) => x == null)) continue;
  const capObsOk = (capM.get(A) ?? 0) >= PB.nevoie && (capM.get(B) ?? 0) >= PA.nevoie;
  const gA = PA.gpsRezidual - ab, gB = PB.gpsRezidual - ba;   // A preia programul lui B, B pe al lui A — față de costul REAL de azi (GPS)
  const rec = { A, B, totalAzi: r1(PA.gpsRezidual + PB.gpsRezidual), totalDupa: r1(ab + ba), net: r1(gA + gB), castigA: r1(gA), castigB: r1(gB),
    aziA: PA.gpsRezidual, aziB: PB.gpsRezidual, dupaA: r1(ab), dupaB: r1(ba),
    netValhallaDiag: r1(aa + bb - ab - ba), biasReper: r1((PA.gpsRezidual - aa) + (PB.gpsRezidual - bb)),
    capObsOk, cap3ok: (capM3.get(A) ?? 0) >= PB.nevoie && (capM3.get(B) ?? 0) >= PA.nevoie, capA: capM.get(A) ?? null, capB: capM.get(B) ?? null, nevoieA: PA.nevoie, nevoieB: PB.nevoie,
    zileExcluseA: PA.zileExcluse, zileExcluseB: PB.zileExcluse, capacitate: LOC.has(A) && LOC.has(B) ? 'confirmată (locurile pe tip)' : 'observată (clasa dusă deja; microbuz 20–30 locuri)' };
  if (!eligR3(A) || !eligR3(B)) { R3.cuZileExcluse++; R3.diag.push(rec); continue; }
  if (!capObsOk) { R3.respinseCapObs++; R3.diag.push(rec); continue; }
  R3.fezabileObs++; R3.perechi.push(rec);
}
R3.perechi.sort((p, q) => q.net - p.net); R3.diag.sort((p, q) => q.net - p.net);
const luat = new Set(), CANDIDATI = [];
for (const p of R3.perechi) { if (p.net < NET_MIN) break; if (luat.has(p.A) || luat.has(p.B)) continue; luat.add(p.A); luat.add(p.B);
  const PA = PROG.get(p.A), PB = PROG.get(p.B);
  // proba pe bucăți: marginile rămase ale ambelor programe devin proprietatea R-3 (nu pot fi ale R-1 propus, R-2, R-4)
  for (const P of [PA, PB]) for (const x of P.zile) { if (!x.dimAcop) for (const s of x._bDim) ia(x._d, s, 'R-3'); if (!x.seaAcop) for (const s of x._bSea) ia(x._d, s, 'R-3'); }
  const st = (P) => Object.fromEntries(Object.entries(grupeaza(P.zile.flatMap((x) => [x.stDim, x.stSea]), (s) => s)).map(([k, v]) => [k, v.length]));
  CANDIDATI.push({ ...p, conditionat: true, programA: PA.zile.map((x) => `${x.z}: ${x.schimburi.join(', ')}`), programB: PB.zile.map((x) => `${x.z}: ${x.schimburi.join(', ')}`),
    stariA: st(PA), stariB: st(PB), subPragValhalla: p.netValhallaDiag < NET_MIN }); }
// suprapunerea cu R-1 sub prag (km R-1 măsurați, nepropuși, care stau în marginile candidaților R-3)
const suprapR1SubPrag = S_(NOPTI.filter((x) => x.inTotal && !x.propus && luat.has(x.m)), (x) => x.kmEsant);

// ============ agregarea ============
const N_LV = EC.flota.toate.zileLV, N_ES = EC.flota.toate.esantion, F = N_LV / N_ES;
const el = NOPTI.filter((x) => x.eligibil), inT = el.filter((x) => x.inTotal), prop = el.filter((x) => x.propus);
const balti = el.filter((x) => !x.weekend && x.noapteBalti);
const rez = {
  sursa: { rand: W, economieZileRulat: ZZ.rulat, economieRulat: EC.rulat, schelet: 'ideal-activ → ideal-v4.3', zileLV: N_LV, esantion: N_ES, factorExtrapolare: +F.toFixed(4) },
  R1: {
    nopti: NOPTI.length,
    peStare: Object.fromEntries([...new Set(NOPTI.map((x) => x.stare))].map((k) => [k, { n: NOPTI.filter((x) => x.stare === k).length, kmMargini: S_(NOPTI.filter((x) => x.stare === k), (x) => x.seara + x.dim) }])),
    eligibile: { n: el.length, kmToate: S_(el, (x) => x.kmToate) },
    masurat: { n: inT.length, kmEsant: S_(inT, (x) => x.kmEsant), kmToate: S_(inT, (x) => x.kmToate), extrapolat: Math.round(S_(inT, (x) => x.kmEsant) * F) },
    propus: { masini: R1_PROPUS.size, n: prop.length, kmEsant: S_(prop, (x) => x.kmEsant), extrapolat: Math.round(S_(prop, (x) => x.kmEsant) * F), kmSapt12_2: S_(R1M.filter((x) => x.propus), (x) => x.kmSapt12_2) },
    subPrag: { masini: R1M.filter((x) => !x.propus).length, kmEsant: S_(R1M.filter((x) => !x.propus), (x) => x.kmEsant) },
    balti: { n: balti.length, kmEsant: S_(balti, (x) => x.kmEsant), extrapolat: Math.round(S_(balti, (x) => x.kmEsant) * F), kmToateDiag: S_(balti, (x) => x.kmToate),
      peMasina: Object.entries(grupeaza(balti, (x) => x.m)).map(([m, v]) => ({ m, n: v.length, kmEsant: S_(v, (x) => x.kmEsant), kmToate: S_(v, (x) => x.kmToate), X: [...new Set(v.map((x) => x.X))].join('/'), laX: Math.max(...v.map((x) => x.noapteLaX)) })) },
    weekend: { n: el.filter((x) => x.weekend).length, km: S_(el.filter((x) => x.weekend), (x) => x.kmToate) },
    jumatatiWeekendNemasurabile: { n: JUM_WE.length, km: S_(JUM_WE, (x) => x.km) },
    peMasina: R1M.map(({ noptiDetaliu, ...x }) => x).sort((a, b) => b.kmSapt12_2 - a.kmSapt12_2),
  },
  R2: (() => { const e = R2.filter((x) => x.esant); return {
    bucati: { toate: R2.length, esant: e.length }, kmGol: S_(e, (x) => x.kmGol), afara: S_(e, (x) => x.afara), extrapolat: Math.round(S_(e, (x) => x.r2) * F), toateZilele: S_(R2, (x) => x.afara),
    cuOprire20: S_(e.filter((x) => x.oprireMin >= 20), (x) => x.afara), faraOprire: S_(e.filter((x) => x.afara > 0 && !(x.oprireMin >= 20)), (x) => x.afara),
    peMasina: Object.entries(grupeaza(e.filter((x) => x.afara > 0), (x) => x.m)).map(([m, v]) => ({ m, km: S_(v, (x) => x.afara), bucati: v.length, zile: v.map((x) => `${x.z} ${x.ora} ${x.lin} ${x.afara}`) })).sort((a, b) => b.km - a.km) }; })(),
  R4: (() => { const e = R4.filter((x) => x.esant); return {
    bucati: e.length, km: S_(e, (x) => x.km), extrapolat: Math.round(S_(e, (x) => x.km) * F), toateZilele: S_(R4, (x) => x.km), economieJson: EC.flota.toate.masurat.R1b,
    peUnde: { laCapat: S_(e.filter((x) => x.unde.startsWith('la capătul')), (x) => x.km), laUzina: S_(e.filter((x) => x.unde === 'la uzină'), (x) => x.km) } }; })(),
  R3: { masini: MAS.length, perechiTotal: MAS.length * (MAS.length - 1) / 2, faraCasa: R3.faraCasa, cuZileExcluse: R3.cuZileExcluse,
    masiniEligibile: MAS.filter(eligR3).length, masiniCuZileExcluse: MAS.filter((m) => PROG.get(m).zileExcluse > 0),
    respinseCapObservata: R3.respinseCapObs, fezabileObservat: R3.fezabileObs,
    aziGpsRezidualFlota: S_(R3.azi, (x) => x.gpsRezidual), aziGpsRezidualEligibile: S_(R3.azi.filter((x) => eligR3(x.m)), (x) => x.gpsRezidual),
    aziValhallaEligibile: S_(R3.azi.filter((x) => eligR3(x.m)), (x) => x.valhallaPropriu), biasEligibile: S_(R3.azi.filter((x) => eligR3(x.m)), (x) => x.biasGpsMinusValhalla),
    peste50: R3.perechi.filter((p) => p.net >= NET_MIN).length, candidati: CANDIDATI.length, netCandidati: S_(CANDIDATI, (p) => p.net),
    candidatiSubPragValhalla: CANDIDATI.filter((p) => p.subPragValhalla).length, netCandidatiValhallaDiag: S_(CANDIDATI, (p) => p.netValhallaDiag),
    candidatiCap3ok: CANDIDATI.filter((p) => p.cap3ok).length, suprapR1SubPrag,
    diagCuZileExcusePeste50: R3.diag.filter((p) => p.net >= NET_MIN && (p.zileExcluseA || p.zileExcluseB)).length },
  proba: { masini: PROBA.length, ok: PROBA.filter((x) => x.ok).length, rele: PROBA.filter((x) => !x.ok), bucatiCuProprietar: PROPRIETAR.size,
    peRegula: Object.fromEntries(['R-1', 'R-2', 'R-4', 'R-3'].map((k) => [k, [...PROPRIETAR.values()].filter((v) => v === k).length])) },
  valhallaNull: nNull,
};
rez.flota = {
  R1propus: { masurat: rez.R1.propus.kmEsant, extrapolat: rez.R1.propus.extrapolat },
  R1masuratToateMasinile: { masurat: rez.R1.masurat.kmEsant, extrapolat: rez.R1.masurat.extrapolat },
  R2: { masurat: rez.R2.afara, extrapolat: rez.R2.extrapolat }, R4: { masurat: rez.R4.km, extrapolat: rez.R4.extrapolat },
  sumaPropusa: { masurat: r1(rez.R1.propus.kmEsant + rez.R2.afara + rez.R4.km), extrapolat: rez.R1.propus.extrapolat + rez.R2.extrapolat + rez.R4.extrapolat },
  sumaMasurata: { masurat: r1(rez.R1.masurat.kmEsant + rez.R2.afara + rez.R4.km), extrapolat: rez.R1.masurat.extrapolat + rez.R2.extrapolat + rez.R4.extrapolat },
  R3: { candidati: rez.R3.candidati, net: rez.R3.netCandidati, nota: 'CONDIȚIONAT (capacitate de confirmat), în afara totalului; pe toate zilele L–V ale mașinilor fără zile excluse (= eșantion), fără extrapolare' },
  balti: { masurat: rez.R1.balti.kmEsant, extrapolat: rez.R1.balti.extrapolat, toateZileleDiag: rez.R1.balti.kmToateDiag, nota: 'separat §7.4, în afara totalului' } };
const curata = (x) => { const { _d, _d2, _seara, _dim, ...r } = x; return r; };
writeFileSync(`${OUT}/patru-reguli.json`, JSON.stringify({ rulat: new Date().toISOString(), rez, liste: {
  nopti: NOPTI.map(curata), R1peMasina: R1M, jumatatiWeekend: JUM_WE, R2, R4, proba: PROBA,
  R3: { azi: R3.azi, candidati: CANDIDATI, top30: R3.perechi.slice(0, 30), diagnosticCuZileExcluseSauCap: R3.diag.slice(0, 30),
    capacitateObservata: Object.fromEntries(capM), capacitateObservata3zile: Object.fromEntries(capM3),
    program: Object.fromEntries([...PROG].map(([m, p]) => [m, { nevoie: p.nevoie, gpsRezidual: p.gpsRezidual, zileExcluse: p.zileExcluse, faraClasa: p.faraClasa,
      zile: p.zile.map((x) => ({ z: x.z, schimburi: x.schimburi, stDim: x.stDim, stSea: x.stSea, gpsDim: x.gpsDim, gpsSea: x.gpsSea, golImpus: x.golImpus, exclus: x.motivExclus })) }])) } } }, null, 1));
console.log(JSON.stringify(rez, null, 1));
console.log('CANDIDATI', JSON.stringify(CANDIDATI.map((p) => ({ A: p.A, B: p.B, net: p.net, gA: p.castigA, gB: p.castigB, azi: [p.aziA, p.aziB], dupa: [p.dupaA, p.dupaB], netV: p.netValhallaDiag, bias: p.biasReper, cap: [p.capA, p.capB], nevoie: [p.nevoieA, p.nevoieB], cap3: p.cap3ok, stariA: p.stariA, stariB: p.stariB }))));
console.log('TOP10', JSON.stringify(R3.perechi.slice(0, 10).map((p) => [p.A, p.B, p.net, p.castigA, p.castigB, p.netValhallaDiag])));
console.log('DIAG10', JSON.stringify(R3.diag.slice(0, 10).map((p) => [p.A, p.B, p.net, p.netValhallaDiag, p.zileExcluseA, p.zileExcluseB, p.capObsOk])));
