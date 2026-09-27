// Faza 2 (ION-97), opțiunile de card pe cele 7 linii: etalonul modulului comun (etalon-gps.mjs, metrici) pe submulțimi de picioare
// (scoate = restul) și pe porțile fiecărei variante; perechile bune listate. Doar citire, stdout.
import { readFileSync } from 'node:fs';
import { creeazaEtalon, med } from '/home/verif/verificator/cod/etalon-gps.mjs';
import { fazaSapt } from '/root/lde-worker/drax/cod/ideal-v3/timp.mjs';
const DIR = process.argv[2]; const J = f => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
const S = J('schelet-ideal.json'), O = J('obs-ideal.json'), E = J('etalon-ideal.json'), D = J('curse-ideal.json'), N = J('nomenclator.json');
const PORTI = JSON.parse(readFileSync('/home/verif/verificator/date/porti-drax.json', 'utf8'));
const P = { DIF_TUR_RETUR: 0.18, MIN_ZILE: 3, KM_5: 0.05, C47_TOL: 0.10, C47_MIN_KM: 1, C47_ABATERE: 0.60, R_SAT: 1.2, R_TRECE: 1.5, R_OPR: 0.8, SEPT: '2026-09-01', C4_FEREASTRA_MIN: 15 };
const EG = creeazaEtalon({ O, D, E, N, porti: PORTI, P });
const okey = c => `${c.m}|${c.t0}|${c.km}`;
const L = (r, n) => S.find(x => x.ruta === r && x.linie === n);
const obsL = l => O.curse.filter(c => c.schimb && c.ruta === l.ruta && c.linie === l.linie);
const sate = c => { const d = EG.depl.get(okey(c)); if (!d) return []; const om = a => c.sens === 'tur' ? a.km >= c.kmCap - P.R_OPR : a.km <= c.kmCap + P.R_OPR; return [...new Set(d.apr.filter(om).map(a => a.k))]; };
const grupa = c => { const f = fazaSapt(c.zi); return c.schimb === 's1' ? (f === 'A' ? 'D' : 'EZ') : (f === 'A' ? 'EZ' : 'D'); };
// etalon pe submulțime: pastreaza(c) = true pentru picioarele păstrate; real = porțile (tur/retur); sursa
const et = (l, pastreaza, real = l.real, sursa = l.sursa) => { const sc = new Set(obsL(l).filter(c => !pastreaza(c)).map(okey)); const m = EG.metrici({ ...l, real, sursa }, sc); const m2 = EG.metrici({ ...l, real, sursa }, sc, true);
  return { e: m.etalonGPS, n: m.nBune, o: m.etalonOricePoarta, no: m.nBuneOrice, tz: m.tureZi, tz1: m2.tureZi, bune: m.bune }; };
const f = x => `${x.e ?? '—'} (${x.n} zile; orice poartă ${x.o ?? '—'}/${x.no}; ture/zi ${x.tz ?? '—'}, fără dedup între mașini ${x.tz1 ?? '—'})`;
const kz = (km, tz) => km != null && tz != null ? (2 * km * tz).toFixed(1) : '—';
const perechi = (l, sursa = l.sursa, filt = () => true) => { const inS = z => sursa === 'toate' || z >= P.SEPT; const m = EG.metrici({ ...l, sursa }); const per = new Map();
  for (const c of obsL(l)) { if (!inS(c.zi) || !filt(c)) continue; const q = `${c.schimb}|${c.m}|${c.zi}`; (per.get(q) ?? per.set(q, {}).get(q))[c.sens] = c; }
  return [...per].filter(([, p]) => p.tur && p.retur).map(([q, p]) => ({ q, g: grupa(p.tur), t: EG.plinC(p.tur), r: EG.plinC(p.retur), pt: p.tur.poarta, pr: p.retur.poarta, st: sate(p.tur), sr: sate(p.retur), buna: m.bune.has(q), rupt: EG.rupt(p.tur) || EG.rupt(p.retur) })).sort((a, b) => a.q.localeCompare(b.q)); };
const arata = (l, sursa, strain) => { for (const p of perechi(l, sursa)) console.log(`    ${p.q} ${p.g} ${p.pt}/${p.pr} tur ${p.t} retur ${p.r}${p.buna ? ' BUNĂ' : ''}${p.rupt ? ' rupt' : ''}${strain ? ` · străine tur [${p.st.filter(strain).join(',')}] retur [${p.sr.filter(strain).join(',')}]` : ''}`); };
// satele «străine» unei rute = satele din actul ALTOR rute, care nu-s în actul ei (pentru cursele comasate)
const cur = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const satAct = r => new Set(N.rute.find(x => x.id === r).sateNume.map(cur));
const strainDe = r => { const a = satAct(r); const alte = new Set(N.rute.filter(x => x.id !== r).flatMap(x => x.sateNume.map(cur))); return k => alte.has(k) && !a.has(k); };

console.log('## R18 Zarojeni'); { const l = L('R18', 'Zarojeni'); const st = strainDe('R18'); arata(l, 'sept', st);
  const cur_ = c => !sate(c).some(st);
  const a = et(l, () => true), b = et(l, () => true, l.real, 'toate'), c = et(l, cur_), d = et(l, c2 => grupa(c2) === 'D'), e = et(l, c2 => grupa(c2) === 'EZ'), e2 = et(l, c2 => grupa(c2) === 'EZ', l.real, 'toate'), d2 = et(l, c2 => grupa(c2) === 'D', l.real, 'toate');
  console.log(`  sept toate picioarele: ${f(a)}\n  «toate»: ${f(b)}\n  sept fără picioare comasate (sate din actul altor rute): ${f(c)}\n  sept grupa D (s1 în faza B… după fază): ${f(d)} · «toate» D: ${f(d2)}\n  sept grupa EZ: ${f(e)} · «toate» EZ: ${f(e2)}`);
  const ez = obsL(l).filter(c => grupa(c) === 'EZ' && c.zi >= P.SEPT && !sate(c).some(st)); console.log(`  EZ sept pe sens (fără comasate): tur ${med(ez.filter(c => c.sens === 'tur').map(EG.plinC))} (n${ez.filter(c => c.sens === 'tur').length}) · retur ${med(ez.filter(c => c.sens === 'retur').map(EG.plinC))} (n${ez.filter(c => c.sens === 'retur').length})`);
  for (const km of [28.9, 29.9, 30.0, 30.7]) console.log(`  opțiune ${km}: km/zi ${kz(km, l.tureZi)} (Δ ${(2 * (km - l.km) * l.tureZi).toFixed(1)})`); }

console.log('\n## R24 Catranic'); { const l = L('R24', 'Catranic'); arata(l, 'sept');
  const a = et(l, () => true), b = et(l, () => true, l.real, 'toate');
  console.log(`  sept: ${f(a)}\n  «toate» (C20, alege.mjs:54-58): ${f(b)}`);
  const lg = obsL(l).filter(c => c.zi >= P.SEPT && !EG.rupt(c)); console.log(`  sept, picioare întregi pe poarta sensului: tur ${med(lg.filter(c => c.sens === 'tur' && c.poarta === l.real.poartaTur).map(EG.plinC))} · retur ${med(lg.filter(c => c.sens === 'retur' && c.poarta === l.real.poartaRetur).map(EG.plinC))} · rupte sept ${obsL(l).filter(c => c.zi >= P.SEPT && EG.rupt(c)).length} (dispozitive ${JSON.stringify([...new Set(obsL(l).filter(c => EG.rupt(c)).map(c => c.dev))])})`);
  for (const km of [30, 29.3]) console.log(`  opțiune ${km}: km/zi ${kz(km, l.tureZi)} (Δ ${(2 * (km - l.km) * l.tureZi).toFixed(1)})`);
  const lu = {}; for (const c of obsL(l)) { const k = c.zi.slice(0, 7); lu[k] ??= [0, 0]; lu[k][0]++; if (EG.rupt(c)) lu[k][1]++; } console.log(`  picioare / rupte pe lună: ${JSON.stringify(lu)}`); }

console.log('\n## R36 Bocancea Schit'); { const l = L('R36', 'Bocancea Schit'); arata(l, 'sept');
  const lung = c => sate(c).includes('biliceniivechi'); const a = et(l, () => true), b = et(l, lung), c = et(l, x => !lung(x)), d = et(l, () => true, l.real, 'toate');
  console.log(`  sept: ${f(a)}\n  sept varianta lungă (prin Bilicenii Vechi): ${f(b)}\n  sept varianta scurtă: ${f(c)}\n  «toate»: ${f(d)}`);
  const lg = obsL(l).filter(x => x.zi >= P.SEPT && !EG.rupt(x)); const ps = (s, sch) => lg.filter(x => x.sens === s && (!sch || x.schimb === sch) && x.poarta === (s === 'tur' ? l.real.poartaTur : l.real.poartaRetur)).map(EG.plinC);
  const T = med(ps('tur')), R = med(ps('retur'));
  console.log(`  pe sens (sept, poarta sensului, întregi): tur ${T} (n${ps('tur').length}) · retur ${R} (n${ps('retur').length}) · pe schimb: tur s1 ${med(ps('tur', 's1'))} · tur s2 ${med(ps('tur', 's2'))} · retur s1 ${med(ps('retur', 's1'))} · retur s2 ${med(ps('retur', 's2'))}`);
  const lu = {}; for (const x of obsL(l)) { const k = x.zi.slice(0, 7); lu[k] ??= { lung: 0, scurt: 0 }; lu[k][lung(x) ? 'lung' : 'scurt']++; } console.log(`  lung/scurt pe lună: ${JSON.stringify(lu)}`);
  for (const km of [54.5, 46.2]) console.log(`  opțiune ${km}: km/zi ${kz(km, l.tureZi)} (Δ ${(2 * (km - l.km) * l.tureZi).toFixed(1)})`);
  console.log(`  opțiune pe sens ${T}+${R}: km/zi ${((T + R) * l.tureZi).toFixed(1)} (Δ ${((T + R) * l.tureZi - l.kmZi).toFixed(1)})`); }

console.log('\n## R27 Sturzovca / R11 Limbenii Noi'); { const l = L('R27', 'Sturzovca'), ln = L('R11', 'Limbenii Noi');
  const bucla = c => c.m === '727CWN' && (sate(c).includes('limbeniinoi') || sate(c).includes('funduriinoi'));
  const nb = x => !bucla(x);
  const a = et(l, () => true), b = et(l, nb), bVV = et(l, nb, { poartaTur: 'VEST', poartaRetur: 'VEST' }), bEE = et(l, nb, { poartaTur: 'EST', poartaRetur: 'EST' }), bT = et(l, nb, l.real, 'toate');
  const bl = et(l, bucla), blEE = et(l, bucla, { poartaTur: 'VEST', poartaRetur: 'EST' });
  console.log(`  sept tot: ${f(a)}\n  sept fără bucla 727CWN, porțile actuale ${l.real.poartaTur}/${l.real.poartaRetur}: ${f(b)}\n  … VEST/VEST: ${f(bVV)}\n  … EST/EST: ${f(bEE)}\n  «toate» fără buclă: ${f(bT)}\n  doar bucla (VEST/EST): ${f(blEE)}`);
  const bb = obsL(l).filter(bucla); const g = {}; for (const c of bb) g[`${c.sens} ${c.schimb} ${grupa(c)} ${c.poarta}`] = (g[`${c.sens} ${c.schimb} ${grupa(c)} ${c.poarta}`] || 0) + 1;
  console.log(`  bucla: ${bb.length} picioare (toată fereastra), sept ${bb.filter(c => c.zi >= P.SEPT).length} · ${JSON.stringify(g)} · km med tur ${med(bb.filter(c => c.sens === 'tur').map(EG.plinC))} retur ${med(bb.filter(c => c.sens === 'retur').map(EG.plinC))}`);
  const tz = [3, 2]; for (const t of tz) console.log(`  Sturzovca ${l.km} × ${t} ture: ${kz(l.km, t)} (Δ ${(2 * l.km * (t - l.tureZi)).toFixed(1)})`);
  console.log(`  R11 Limbenii Noi azi: card ${ln.km} · ture/zi ${ln.tureZi} · ${ln.kmZi} · mașini ${ln.masini.map(m => m.m + '(' + m.zile + ')').join(' ')}`);
  const olim = obsL(ln); const zl = new Set(olim.filter(c => c.zi >= P.SEPT).map(c => c.zi)), zb = new Set(bb.filter(c => c.zi >= P.SEPT).map(c => c.zi));
  console.log(`  zile sept cu Limbenii Noi (457BRAX…) ${zl.size} · cu bucla 727CWN ${zb.size} · în ambele ${[...zb].filter(z => zl.has(z)).length}`);
  const grB = {}; for (const c of bb.filter(c => c.zi >= P.SEPT)) grB[grupa(c)] = (grB[grupa(c)] || 0) + 1; const grL = {}; for (const c of olim.filter(c => c.zi >= P.SEPT)) grL[grupa(c)] = (grL[grupa(c)] || 0) + 1;
  console.log(`  grupa (după fază) sept: bucla ${JSON.stringify(grB)} · Limbenii Noi ${JSON.stringify(grL)}`); }

console.log('\n## R32 Trifanesti'); { const l = L('R32', 'Trifanesti'); const a = et(l, () => true), b = et(l, c => c.m === '146BRAZ'), c = et(l, c => c.m === '518MHD'), bT = et(l, c => c.m === '146BRAZ', l.real, 'toate'), cT = et(l, c => c.m === '518MHD', l.real, 'toate');
  console.log(`  sept tot: ${f(a)}\n  146BRAZ: ${f(b)} · «toate» ${f(bT)}\n  518MHD: ${f(c)} · «toate» ${f(cT)}`);
  const ms = {}; for (const x of obsL(l).filter(x => x.zi >= P.SEPT)) { const k = `${x.m} ${x.schimb} ${grupa(x)}`; ms[k] = (ms[k] || 0) + 1; } console.log(`  picioare sept pe mașină/schimb/grupă: ${JSON.stringify(ms)}`);
  const lu = {}; for (const x of obsL(l)) { const k = `${x.m} ${x.zi.slice(0, 7)}`; lu[k] = (lu[k] || 0) + 1; } console.log(`  pe lună: ${JSON.stringify(lu)}`);
  // 518MHD în alte linii (Florești / Vărvăreuca)
  const alt = {}; for (const x of O.curse.filter(x => x.m === '518MHD' && x.schimb)) { const k = `${x.ruta}|${x.linie}`; alt[k] = (alt[k] || 0) + 1; } console.log(`  518MHD pe linii (toată fereastra): ${JSON.stringify(alt)}`);
  const vv = L('R16', 'Varvareuca'), fl = L('R16', 'Floresti'); console.log(`  R16 Varvareuca: card ${vv.km} ture ${vv.tureZi} mașini ${vv.masini.map(m => m.m + '(' + m.zile + ')').join(' ')} · R16 Floresti: card ${fl.km} ture ${fl.tureZi} mașini ${fl.masini.map(m => m.m + '(' + m.zile + ')').join(' ')}`);
  const opt = [['v2: o linie, 2 ture', l.km, 2], ['v3 mecanic: o linie, 4 ture', l.km, 4]]; for (const [t, k, z] of opt) console.log(`  ${t}: ${kz(k, z)}`);
  console.log(`  două linii: 146BRAZ ${b.e} × ${b.tz1} + 518MHD ${c.e} × ${c.tz1} = ${(2 * b.e * b.tz1 + 2 * c.e * c.tz1).toFixed(1)} km/zi`); }

console.log('\n## R3 Nihoreni'); { const l = L('R3', 'Nihoreni'); arata(l, 'sept');
  const a = et(l, () => true), ez = et(l, c => grupa(c) === 'EZ'), d = et(l, c => grupa(c) === 'D'), ezVE = et(l, c => grupa(c) === 'EZ', { poartaTur: 'VEST', poartaRetur: 'EST' }), dEE = et(l, c => grupa(c) === 'D', { poartaTur: 'EST', poartaRetur: 'EST' });
  const pm = {}; for (const m of ['186OMM', '345KAJ', '457BRAX']) pm[m] = et(l, c => c.m === m);
  const pmEE = et(l, c => c.m === '186OMM', { poartaTur: 'EST', poartaRetur: 'EST' });
  console.log(`  sept: ${f(a)}\n  grupa EZ (porțile liniei): ${f(ez)} · VEST/EST: ${f(ezVE)}\n  grupa D: ${f(d)} · EST/EST: ${f(dEE)}\n  pe mașină: ${Object.entries(pm).map(([m, x]) => m + ' ' + f(x)).join(' | ')} · 186OMM EST/EST ${f(pmEE)}`);
  const gm = {}; for (const x of obsL(l).filter(x => x.zi >= P.SEPT)) { const k = `${x.m} ${grupa(x)} ${x.schimb}`; gm[k] = (gm[k] || 0) + 1; } console.log(`  mașină/grupă/schimb sept: ${JSON.stringify(gm)}`); }

console.log('\n## R6 Mihailenii Vechi'); { const l = L('R6', 'Mihailenii Vechi'); arata(l, 'sept', strainDe('R6'));
  const st = strainDe('R6'); const a = et(l, () => true), b = et(l, () => true, { poartaTur: 'VEST', poartaRetur: 'EST' }), c = et(l, x => !sate(x).some(st)), c2 = et(l, x => !sate(x).some(st), { poartaTur: 'VEST', poartaRetur: 'EST' }), t = et(l, () => true, l.real, 'toate');
  console.log(`  sept porțile ${l.real.poartaTur}/${l.real.poartaRetur}: ${f(a)}\n  sept VEST/EST: ${f(b)}\n  sept fără comasate (EST/EST): ${f(c)} · VEST/EST: ${f(c2)}\n  «toate»: ${f(t)}`);
  for (const km of [55.7, 58, 54.8]) console.log(`  opțiune ${km}: km/zi ${kz(km, l.tureZi)} (Δ ${(2 * (km - l.km) * l.tureZi).toFixed(1)})`); }
