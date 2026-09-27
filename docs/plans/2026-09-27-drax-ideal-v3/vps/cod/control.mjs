// Pasul 6: controlul automat pe TOATĂ flota, înainte de publicare (memoria «analiza-verifica-toata-flota»). Clasele (a)–(m)
// din plan; (a), (f), (g), (l), (m) blochează publicarea până sunt explicate în raport.
import { writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };   // F3 v5 (R3-1): fără rescriere pe loc
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const S = JSON.parse(readFileSync('../../date/ideal-v3/schelet-ideal.json', 'utf8'));
const E = JSON.parse(readFileSync('../../date/ideal-v3/etalon-ideal.json', 'utf8'));
const SC = existsSync('../../date/ideal-v3/schelet-cand.json') ? JSON.parse(readFileSync('../../date/ideal-v3/schelet-cand.json', 'utf8')) : { cand: {}, incercate: {} };
const RG = JSON.parse(readFileSync('../../date/ideal-v3/regulate-ideal.json', 'utf8'));
const O = JSON.parse(readFileSync('../../date/ideal-v3/obs-ideal.json', 'utf8'));
const D = JSON.parse(readFileSync('../../date/ideal-v3/curse-ideal.json', 'utf8'));
const N = JSON.parse(readFileSync('../../date/ideal-v3/nomenclator.json', 'utf8'));
const canon = s => { const p = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const m = p.match(/^([A-Z]{3})(\d{3})$/); return m ? m[2] + m[1] : p; };
const med = a => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : 0; };
const P = []; const pune = (cls, txt) => P.push([cls, txt]);
const cu = S.filter(l => l.km && !l.informativ), act = S.filter(l => !l.gps);
const id = l => `${l.ruta} ${l.linie}`;
// (a) linie din act fără ideal (după toate loturile)
for (const l of act) if (l.faraIdeal || l.deCompletat) pune('(a) BLOCANT · linie din act fără ideal', `${id(l)}: ${l.motiv || 'de completat'} · candidate ${l.nCand?.toate ?? 0}`);
// (b) sursa toate
for (const l of cu) if (l.sursa === 'toate') pune('(b) etalon din toată fereastra (sub 3 zile bune în sept.)', `${id(l)}: bune sept ${l.zileBune.sept}, toate ${l.zileBune.toate} · mașini ${l.masini.map(m => m.m).join(',')}`);
// (c) tur/retur real >18 % sau asim
for (const l of cu) if (l.asim || l.real.dif > 18) pune('(c) tur ≠ retur >18 % sau asim', `${id(l)}: real tur ${l.real.tur} / retur ${l.real.retur} (${l.real.dif}%)${l.asim ? ' · ASIM' : ''}`);
// (c2) mediana s1 vs s2 pe urmă >18 %
for (const l of cu) { const c = Object.values(SC.cand).filter(x => x.ruta === l.ruta && x.linie === l.linie); const m = {};
  for (const s of ['s1', 's2']) { const v = c.filter(x => x.schimb === s).flatMap(x => [x.tur.km, x.retur.km]); if (v.length >= 2) m[s] = med(v); }
  if (m.s1 && m.s2 && Math.abs(m.s1 - m.s2) / Math.max(m.s1, m.s2) > 0.18) pune('(c2) s1 și s2 pe drumuri diferite (>18 %)', `${id(l)}: s1 ${m.s1.toFixed(1)} / s2 ${m.s2.toFixed(1)}`); }
// (d) sat din act cu 0 % pe rută
for (const [r, v] of Object.entries(RG.lipsaPeRuta)) if (v.length) pune('(d) sat din act fără nicio oprire pe rută', `${r}: ${v.join(', ')}`);
// (e) sate în plus ≥25 %
for (const l of cu) if (l.inPlus?.length) pune('(e) opriri regulate în sate din afara actului (≥25 %)', `${id(l)}: ${l.inPlus.map(x => `${x.n} ${x.p}%`).join(', ')}`);
// (f) aceeași cursă pe două linii / aceeași cursă pe aceeași linie cu m diferit (dublură scăpată)
{ const k1 = new Map(); let n1 = 0; const ex = [];
  for (const c of O.curse) { if (!c.schimb) continue; const k = `${c.m}|${c.zi}|${c.schimb}|${c.sens}|${c.t0}`; const v = c.ruta + '|' + c.linie; if (k1.has(k) && k1.get(k) !== v) { n1++; if (ex.length < 5) ex.push(`${c.m} ${c.zi} ${c.sens}: ${k1.get(k)} și ${v}`); } k1.set(k, v); }
  if (n1) pune('(f) BLOCANT · aceeași cursă pe două linii', `${n1} cazuri, ex.: ${ex.join(' · ')}`);
  const byL = new Map(); for (const c of O.curse) { if (!c.schimb) continue; const k = `${c.ruta}|${c.linie}|${c.zi}|${c.schimb}|${c.sens}`; if (!byL.has(k)) byL.set(k, []); byL.get(k).push(c); }
  const dubl = new Map();
  for (const arr of byL.values()) for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) if (arr[i].m !== arr[j].m && Math.abs(new Date(arr[i].t0) - new Date(arr[j].t0)) <= 180000 && Math.abs(arr[i].km - arr[j].km) <= 1) { const k = [arr[i].m, arr[j].m].sort().join('='); dubl.set(k, (dubl.get(k) || 0) + 1); }
  const nPeLinie = new Map(); for (const c of O.curse) if (c.schimb) { const k = `${c.ruta}|${c.linie}|${c.m}`; nPeLinie.set(k, (nPeLinie.get(k) || 0) + 1); }
  for (const [k, n] of dubl) { const [a, b] = k.split('='); const lin = [...byL.keys()].find(x => true); const mn = Math.min(...[a, b].map(m => Math.max(1, ...[...nPeLinie].filter(([q]) => q.endsWith('|' + m)).map(([, v]) => v))));
    if (n >= 3) pune(n / mn >= 0.5 ? '(f) BLOCANT · aceeași cursă, aceeași linie, mașini diferite (dispozitiv dublu?)' : '(f) două mașini pornite împreună pe aceeași linie (sub 50 % din curse — nu e dublură)', `${k}: ${n} curse`); } }
// (g) cursă >140 km
for (const l of cu) if (l.turZi > 140 || l.returZi > 140) pune('(g) BLOCANT · cursă >140 km (lipită)', `${id(l)}: ${l.turZi}/${l.returZi}`);
// (h) mașină din grafic fără nicio linie
{ const dinNom = new Set(N.rute.flatMap(r => Object.values(r.masini || {}).flat().map(canon))); const cuL = new Set(E.flatMap(e => e.masini.map(m => m.m)));
  const lipsa = [...dinNom].filter(m => !cuL.has(m)); if (lipsa.length) pune('(h) mașină din grafic fără nicio linie', lipsa.map(m => `${m}${D.zilePoarta[m] ? ` (${D.zilePoarta[m].zile} zile la poartă)` : ' (nu e în flotă)'}`).join(', ')); }
// (i) linie servită de ≥3 mașini
for (const l of cu) if (l.masini.length >= 3) pune('(i) linie servită de ≥3 mașini pe fereastră', `${id(l)}: ${l.masini.map(m => `${m.m}(${m.zile}z)`).join(', ')}`);
// (j) linie * pe o rută cu linie din act
for (const l of S) if (l.gps && l.informativ) pune('(j) linie * (fără start KW24) pe o rută care are linie din act — informativă', `${id(l)}: ${l.masini.map(m => m.m).join(',')}`);
// (k) ture/zi ≠ EZ + D din act; steaguri
for (const l of cu) { const a = l.autobuze ? l.autobuze.EZ + l.autobuze.D : null; if (a !== null && l.tureZi !== a) pune('(k) ture/zi măsurate ≠ autobuze din act (EZ + D)', `${id(l)}: GPS ${l.tureZi} · act ${a} (EZ ${l.autobuze.EZ} / D ${l.autobuze.D}) · sursa ${l.sursa}`);
  if (l.tureZiFlag) pune('(k) ture/zi luat din altă sursă', `${id(l)}: ${l.tureZiFlag} → ${l.tureZi}`); }
// (l) capăt de linie din act cu 0 atingeri
for (const e of E) if (!e.gps && (!e.capat || !(e.atingeri > 0 || e.nCand.toate > 0))) pune('(l) BLOCANT · capătul liniei din act negăsit sau fără atingeri', `${e.ruta} ${e.linie}: ${e.capat || 'NEGĂSIT'} (${e.atingeri})`);
// (m) km ≤ 0 / kmZi ≤ 0 / NaN
for (const l of cu) if (!(l.km > 0) || !(l.kmZi > 0)) pune('(m) BLOCANT · linie cu ideal fără km', `${id(l)}: km ${l.km} kmZi ${l.kmZi}`);
const grup = new Map(); for (const [c, t] of P) { if (!grup.has(c)) grup.set(c, []); grup.get(c).push(t); }
const out = [`schelet ideal: ${cu.length} linii cu ideal (din act ${cu.filter(l => !l.gps).length}/${act.length}) pe ${new Set(cu.flatMap(l => l.masini.map(m => m.m))).size} mașini, ${new Set(cu.map(l => l.ruta)).size}/${N.rute.length} rute · km/zi ${cu.reduce((s, l) => s + l.kmZi, 0).toFixed(0)}`, ''];
for (const [c, t] of grup) { out.push(`## ${c} — ${t.length}`); for (const x of t) out.push('  ' + x); out.push(''); }
out.push(`blocante: ${[...grup.keys()].filter(c => c.includes('BLOCANT')).length} clase`);
scrieAtomic('../../date/ideal-v3/control-ideal.log', out.join('\n'));
console.log(out.join('\n'));
