// etalon-gps.mjs — UN SINGUR modul pentru etalonul GPS al unei linii Drăxlmaier (ION-95 v4). Îl folosesc verificatorul (drax.mjs) și
// F3 (compara-ideal.mjs / pasul E, care scrie cardul = etalonul completat în schelet-ideal v2). Pur: nu citește și nu scrie fișiere.
// Regula lui Ion (26.09): «nu folosim geometria, folosim km reali din GPS». Triaj ION-95 r3, Q1 (c):
//   · fiecare picior se ia doar de pe POARTA SENSULUI liniei (turul pe poarta turului, returul pe poarta returului — ca C47);
//   · km-ul piciorului = `plin` (urma brută, de la marginea razei porții) + raza porții pe care a intrat/ieșit (EST 0,6 / VEST 0,5 din
//     drax/cod/ideal/curse.mjs:18, primite din fișierul sigilat porti-drax.json) — limita de jos măsurată, nu drum desenat;
//   · zi bună GPS = pereche (schimb, mașină, zi) cu tur ȘI retur la capăt, |t−r|/max ≤ 18 %, fiecare sens «trece» prin satele regulate pe
//     urma brută (apropiere ≤1,2 km din extracție sau oprire ≤1,5 km, pe partea cu oameni); etalonul = mediana km-ilor completați, ≥3 zile.
//   · ture/zi = replica etalon.mjs:115-128 (toate porțile — turele nu depind de poartă); `faraDedupIntreMasini` = V2.
import { creeazaFiltru, VERSIUNE_FILTRU } from './filtru-rupte.mjs';
export const VERSIUNE_ETALON = `etalon-gps v5 + ${VERSIUNE_FILTRU}`;
// v5 (ION-97, verdictul dezbaterii ideal-v3, 27.09.2026): (a) ture/zi deduplică ±3 min DOAR pe aceeași mașină sau pe același dispozitiv
// (implicit; `faraDedupIntreMasini = false` redă regula v4.1, dedup între mașini, pentru V2); (b) `etalonLinie(l, dec)`: etalonul liniei cu
// decizia din decizii-v3.json (mașini scoase din populație, metoda «orice poartă») și regula de rezervă pe toată fereastra (C20,
// alege.mjs:56-58) când sursa are < 3 perechi bune GPS după filtre, cu garda de similaritate a drumului (picioarele întregi din sursă în
// ±max(10 % × E, 1 km) de etalonul «toate» în ≥ 60 % — pragurile C47). Folosit de card-gps.mjs (lanț) și drax.mjs (G1, C47).
const cur = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const ALIAS = { mihaileniivechi: 'mihaileni', dobrujaveche: 'dobrogeaveche', satmarculesti: 'marculesti', zorojeni: 'zarojeni',
  grigoreuca: 'grigorauca', ustea: 'ustia', iezarenivechi: 'iezareniivechi', garacatranic: 'catranic', funduriivechi: 'fundurivechi', fundurivechi: 'funduriivechi' };
export const kk = s => { const k = cur(s); return [k, ALIAS[k]].filter(Boolean); };   // copie din drax/cod/ideal/verif.mjs:15-17
export const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
export const med = a => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : null; };
export const okey = c => `${c.m}|${c.t0}|${c.km}`;
const fmtLoc = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const oraLoc = t => { const p = Object.fromEntries(fmtLoc.formatToParts(new Date(t)).map(x => [x.type, x.value])); return +p.hour + +p.minute / 60; };

// ctx = { O (obs-ideal), D (curse-ideal), E (etalon-ideal), N (nomenclator), porti: [{ nume, raza }], P: praguri }
export function creeazaEtalon(ctx) {
  const { O, D, E, N, P } = ctx;
  const raza = Object.fromEntries(ctx.porti.map(p => [p.nume, p.raza]));
  const byK = new Map(); for (const t of D.tinte) { if (!byK.has(t.k)) byK.set(t.k, []); byK.get(t.k).push(t); }
  const tinteSat = n => kk(n).flatMap(k => byK.get(k) || []);
  const depl = new Map(); for (const c of D.curse) depl.set(`${c.m}|${c.t0}|${c.km}`, c);
  const peLinie = new Map(); for (const c of O.curse) { if (!c.schimb) continue; const k = `${c.ruta}|${c.linie}`; if (!peLinie.has(k)) peLinie.set(k, []); peLinie.get(k).push(c); }
  const FR = creeazaFiltru({ porti: ctx.porti, E }); const rupt = FR.rupt;   // urma ruptă: exclusă din etalon și din C47
  const plinC = c => raza[c.poarta] == null ? null : +(c.plin + raza[c.poarta]).toFixed(2);   // km GPS completat cu raza porții
  function regulate(l, sursa, sens, scoate) {   // replică drax/cod/ideal/verif.mjs:26-52 pe o linie
    const e = E.find(x => x.ruta === l.ruta && x.linie === l.linie), r = N.rute.find(x => x.id === l.ruta); if (!e || !r) return null;
    const sate = r.sateNume.filter(n => !/^dra\d?$/i.test(cur(n))); const capC = e.capatC ? { lat: e.capatC[0], lon: e.capatC[1] } : null;
    const CS = (peLinie.get(`${l.ruta}|${l.linie}`) || []).filter(c => c.sens === sens && (sursa === 'toate' || c.zi >= P.SEPT) && !scoate.has(okey(c)));
    const nr = new Map();
    for (const c of CS) { const om = c.opr.filter(o => sens === 'tur' ? o.km >= c.kmCap - P.R_OPR : o.km <= c.kmCap + P.R_OPR);
      for (const s of sate) { const T = tinteSat(s); const laCap = capC && T.some(t => hav(t, capC) < 0.05); const O2 = laCap ? c.opr : om;
        if (T.some(t => O2.some(o => hav(o, t) <= P.R_SAT))) nr.set(s, (nr.get(s) || 0) + 1); } }
    return sate.filter(s => CS.length && (nr.get(s) || 0) / CS.length >= 0.5).sort();
  }
  function trece(c, sens, sate, capC) { const d = depl.get(okey(c)); if (!d) return false;
    const om = x => sens === 'tur' ? x.km >= c.kmCap - P.R_OPR : x.km <= c.kmCap + P.R_OPR;
    const ks = new Set(d.apr.filter(om).map(a => a.k)); const op = c.opr.filter(om);
    return sate.every(s => { const T = tinteSat(s); return !T.length || kk(s).some(k => ks.has(k)) || (capC && T.some(t => hav(t, capC) < 0.05)) || T.some(t => op.some(o => hav(o, t) <= P.R_TRECE)); }); }
  // l = linia din schelet (ruta, linie, sursa, real.poartaTur/poartaRetur); scoate = Set(okey) observații excluse (variantele C4)
  function metrici(l, scoate = new Set(), faraDedupIntreMasini = true) {
    const sursa = l.sursa || 'toate', e = E.find(x => x.ruta === l.ruta && x.linie === l.linie);
    const capC = e?.capatC ? { lat: e.capatC[0], lon: e.capatC[1] } : null; const inS = z => sursa === 'toate' || z >= P.SEPT;
    const poarta = { tur: l.real?.poartaTur, retur: l.real?.poartaRetur };
    const reg = { tur: regulate(l, sursa, 'tur', scoate), retur: regulate(l, sursa, 'retur', scoate) };
    const ob = (peLinie.get(`${l.ruta}|${l.linie}`) || []).filter(c => !scoate.has(okey(c)));
    const pune = (map, c) => { const q = `${c.schimb}|${c.m}|${c.zi}`; if (!map.has(q)) map.set(q, {}); const p = map.get(q); if (!p[c.sens] || c.plin > p[c.sens].plin) p[c.sens] = c; };   // ca etalon.mjs:78
    const per = new Map(), perPoarta = new Map(), perOrice = new Map(); let altaPoarta = 0, rupte = 0;
    for (const c of ob) { pune(per, c); if (rupt(c)) { if (inS(c.zi)) rupte++; continue; } pune(perOrice, c); if (c.poarta === poarta[c.sens]) pune(perPoarta, c); else if (inS(c.zi)) altaPoarta++; }
    const bunePe = map => reg.tur && reg.retur ? [...map].filter(([q, p]) => p.tur && p.retur && inS(q.split('|')[2]) && Math.abs(p.tur.plin - p.retur.plin) / Math.max(p.tur.plin, p.retur.plin) <= P.DIF_TUR_RETUR
      && trece(p.tur, 'tur', reg.tur, capC) && trece(p.retur, 'retur', reg.retur, capC)).map(([q, p]) => ({ q, tur: plinC(p.tur), retur: plinC(p.retur), turBrut: p.tur.plin, returBrut: p.retur.plin })) : [];
    const bune = bunePe(perPoarta), buneOrice = bunePe(perOrice).filter(b => b.tur != null && b.retur != null);
    const etalonOricePoarta = buneOrice.length >= P.MIN_ZILE ? +med(buneOrice.flatMap(b => [b.tur, b.retur])).toFixed(1) : null;
    const ok = bune.filter(b => b.tur != null && b.retur != null);
    const etalonGPS = ok.length >= P.MIN_ZILE ? +med(ok.flatMap(b => [b.tur, b.retur])).toFixed(1) : null;
    const etalonBrut = ok.length >= P.MIN_ZILE ? +med(ok.flatMap(b => [b.turBrut, b.returBrut])).toFixed(1) : null;
    const amb = new Map(); for (const [q, p] of per) if (p.tur && p.retur && inS(q.split('|')[2])) { const s = q.split('|').slice(0, 2).join('|'); amb.set(s, (amb.get(s) || 0) + 1); }
    const calif = new Set([...amb].filter(([, n]) => n >= 3).map(([s]) => s)); const zile = new Map();
    for (const [q, p] of per) { const [s, m, z] = q.split('|'); if (!inS(z) || !calif.has(s + '|' + m)) continue; if (!zile.has(z)) zile.set(z, []); zile.get(z).push({ s, m, ...p }); }
    const apr = (a, b) => a && b && Math.abs(new Date(a.t0) - new Date(b.t0)) <= 180000;
    const dev = p => p.tur?.dev ?? p.retur?.dev ?? null;   // același dispozitiv = același autobuz, oricare plăcuță (verdict v3 (a))
    const acelasi = (x, p) => x.m === p.m || (dev(x) != null && dev(x) === dev(p));
    const cnt = [...zile.values()].map(arr => { const kept = []; for (const p of arr) if (!kept.some(x => x.s === p.s && (!faraDedupIntreMasini || acelasi(x, p)) && (apr(p.tur, x.tur) || apr(p.retur, x.retur)))) kept.push(p); return kept.length; });
    const tureZi = cnt.length ? Math.round(med(cnt)) : null;
    const ore = {}; for (const s of ['s1', 's2']) for (const sens of ['tur', 'retur']) { const h = ob.filter(c => c.schimb === s && c.sens === sens && inS(c.zi)).map(c => { const x = oraLoc(sens === 'tur' ? c.t1 : c.t0); return x < 3 ? x + 24 : x; }); ore[`${s} ${sens}`] = h.length ? +med(h).toFixed(2) : null; }
    return { sursa, poarta, reg, nBune: ok.length, etalonGPS, etalonBrut, etalonOricePoarta, nBuneOrice: buneOrice.length, rupte, tureZi, ore, altaPoarta, bune: new Set(ok.map(b => b.q)) };
  }
  // decizia unei linii (decizii-v3.json): { metoda: 'poarta-sensului' | 'orice-poarta' | 'card-vechi', scoate?: { masini: [...] } }
  const scoateDin = (l, dec) => { const ms = new Set(dec?.scoate?.masini || []); if (!ms.size) return new Set();
    return new Set((peLinie.get(`${l.ruta}|${l.linie}`) || []).filter(c => ms.has(c.m)).map(okey)); };
  function garda(l, E0, sursa, scoate) {   // picioarele întregi ale sursei, pe poarta sensului, fără rt, în toleranța C47 de etalonul «toate»
    const inS = z => sursa === 'toate' || z >= P.SEPT, tol = Math.max(P.C47_TOL * E0, P.C47_MIN_KM);
    const pe = (peLinie.get(`${l.ruta}|${l.linie}`) || []).filter(c => inS(c.zi) && !scoate.has(okey(c)) && !rupt(c) && !c.rt && c.poarta === (c.sens === 'tur' ? l.real?.poartaTur : l.real?.poartaRetur));
    const k = pe.filter(c => plinC(c) != null && Math.abs(plinC(c) - E0) <= tol).length;
    return { n: pe.length, inTol: k, rap: pe.length ? +(k / pe.length).toFixed(2) : null, ok: pe.length >= P.MIN_ZILE && k / pe.length >= P.C47_ABATERE }; }
  function etalonLinie(l, dec = null) {
    const scoate = scoateDin(l, dec); const m = metrici(l, scoate);
    if (dec?.metoda === 'orice-poarta') return { etalon: m.etalonOricePoarta, zile: m.nBuneOrice, metoda: 'orice poartă (decizie)', sursa: m.sursa, rezerva: null, m, scoate };
    if (m.etalonGPS != null || m.sursa === 'toate') return { etalon: m.etalonGPS, zile: m.nBune, metoda: 'poarta sensului', sursa: m.sursa, rezerva: null, m, scoate };
    const mt = metrici({ ...l, sursa: 'toate' }, scoate); if (mt.etalonGPS == null) return { etalon: null, zile: m.nBune, metoda: 'poarta sensului', sursa: m.sursa, rezerva: { etalon: null, zile: mt.nBune }, m, scoate };
    const g = garda(l, mt.etalonGPS, m.sursa, scoate); const rezerva = { etalon: mt.etalonGPS, zile: mt.nBune, garda: g };
    return g.ok ? { etalon: mt.etalonGPS, zile: mt.nBune, metoda: 'rezervă toată fereastra (C20)', sursa: 'toate', rezerva, m: mt, scoate }
      : { etalon: null, zile: m.nBune, metoda: 'poarta sensului', sursa: m.sursa, rezerva, m, scoate }; }
  return { metrici, etalonLinie, scoateDin, regulate, plinC, rupt, limita: FR.limita, tinteSat, depl };
}
