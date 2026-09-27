// Drăxlmaier Bălți — pasul 2 al SCHELETULUI IDEAL (ION-71): perechile tur/retur pe schimb, strânse pe rută × LINIE.
// Copie a cod/etalon.mjs (ION-45) cu:
//  · NU se calculează etalonul aici (km-ul brut sare golurile de semnal; etalonul iese pe urmă, în alege.mjs);
//    aici ies doar CANDIDATELE (zile cu tur ȘI retur la capăt, ≤25 % pe brut), septembrie întâi;
//  · împerecherea rămâne pe schimb (turul și returul ACELUIAȘI schimb), apoi perechile se strâng pe rută|linie;
//  · ture/zi pe linie, pe două surse (sept / toate): mediana perechilor distincte (schimb, mașină) pe zi, numărate doar
//    pentru mașinile cu ≥3 zile cu ambele sensuri (altfel intră și tranzitul: 412BRAY 23 zile doar tur pe Bilicenii);
//  · obs-ideal.json = toate cursele cu rută, inclusiv cele din afara ferestrelor FER (schimb null), ca ore.mjs să vadă
//    și vârfurile ieșite din fereastră; `afara` se numără pe lună, DOAR pe cursele cu rută.
import { writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };   // F3 v5 (R3-1): fără rescriere pe loc
import { readFileSync, writeFileSync } from 'node:fs';
const IN = '../../date/ideal-v3.1/curse-ideal.json', NOM = '../../date/ideal-v3.1/nomenclator.json', OUT = '/tmp/ion99/etalon-exp.json', OBS = '/tmp/ion99/obs-exp.json';
const SEPT = '2026-09-01';
const N = JSON.parse(readFileSync(NOM, 'utf8'));
const D = JSON.parse(readFileSync(IN, 'utf8'));
const cur = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const canon = s => { const p = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const m = p.match(/^([A-Z]{3})(\d{3})$/); return m ? m[2] + m[1] : p; };
const med = a => { const q = [...a].sort((x, y) => x - y); const n = q.length;
  return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : 0; };
// v3 (ION-97): ora locală prin Intl Europe/Chisinau, nu UTC + 3 fix (EET din 25.10.2026 e UTC + 2); ziua = ziua de lucru 03:00 → 03:00
// locală (în v2: data UTC, adică 03:00 EEST — aceeași vara, greșită iarna cu o oră)
import { oraLoc, ziLucru } from './timp.mjs';
const ora = d => oraLoc(d);
const ziua = d => ziLucru(d);
const ALIAS = { mihaileniivechi: 'mihaileni', dobrujaveche: 'dobrogeaveche', satmarculesti: 'marculesti', zorojeni: 'zarojeni',
  grigoreuca: 'grigorauca', ustea: 'ustia', iezarenivechi: 'iezareniivechi', garacatranic: 'catranic', funduriivechi: 'fundurivechi', fundurivechi: 'funduriivechi' };
const kk = s => { const k = cur(s); return [k, ALIAS[k]].filter(Boolean); };
// ferestrele la poartă (ION-45, învățate pe 13.04–20.07): turul SOSEȘTE înaintea schimbului, returul PLEACĂ după el
const FER = { tur: { s1: [3.5, 7.0], s2: [13.5, 16.0] }, retur: { s1: [15.0, 17.75], s2: [23.0, 25.75] } };
const inF = (h, [a, b]) => { const x = h < 3 ? h + 24 : h; return x >= a && x <= b; };
const PORTI = N.porti;
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };

const cnt = new Map(), cntId = new Map();
for (const c of D.curse) for (const a of c.apr) { cnt.set(c.m + '|' + a.id, (cnt.get(c.m + '|' + a.id) || 0) + 1); cntId.set(a.id, (cntId.get(a.id) || 0) + 1); }
const RUTE = N.rute.map(r => {
  const sate = [...new Set([...r.sateNume, ...r.sate, ...r.sateDb].flatMap(kk))];
  const masini = new Set(Object.values(r.masini || {}).flat().map(canon));
  const linii = [];
  for (const l of r.linii) {
    const ks = kk(l.start); const cand = D.tinte.filter(g => ks.includes(g.k));
    let best = null, bn = -1;
    const urm = r.sateNume[1] ? D.tinte.filter(g => kk(r.sateNume[1]).includes(g.k)) : [];
    for (const g of cand) { let n = 0; for (const m of masini) n += cnt.get(m + '|' + g.id) || 0;
      const dUrm = urm.length ? Math.min(...urm.map(u => hav(g, u))) : null;
      const scor = n > 0 ? n : dUrm !== null ? -dUrm / 1000 : -1 - Math.abs(2 * hav(g, PORTI[0]) - l.km) / 1000;
      if (scor > bn) { bn = scor; best = g; } }
    if (!linii.some(x => x.capat && best && x.capat.id === best.id)) linii.push({ start: l.start, km: l.km, locuri: l.locuri, autobuze: l.autobuze, capat: best, n: bn });
  }
  linii.sort((a, b) => (b.capat ? hav(b.capat, PORTI[0]) : 0) - (a.capat ? hav(a.capat, PORTI[0]) : 0));
  return { ...r, k: sate, M: masini, LN: linii };
});

const R_CAPAT_CURSA = 2.5; const LIN_GPS = new Map();
const atinse = c => new Set(c.apr.map(a => a.k));
const capatCursa = (c, sens) => { const p = sens === 'tur' ? c.a : c.b; return { lat: p[0], lon: p[1] }; };
// v3.1 (ION-99) pas 2 — REGULA SATELOR ÎN ORDINE (Ion, 27.09: «fă cârpiri dacă sare GPS-ul»; linia R6 după 14.09): piciorul trece pe linia
// ale cărei sate le atinge în ordine, nu pe linia mașinii din grafic. Pe TOATĂ flota, fără nume de mașină:
//   · candidată «în ordine» = linie DIN ACT (start KW24, nu «*») al cărei capăt e atins (ca până acum) și a cărei parte cu oameni a piciorului
//     (tur: de la capăt spre poartă; retur: de la poartă la capăt; kmCap ca mai jos) atinge ≥ 2 sate distincte ale rutei (capătul inclus;
//     satele = sateNume + sate + sateDb, ca r.k), în ORDINEA drumului: șirul cel mai lung de apropieri (ordinea km) cu distanța satului
//     la poarta EST strict descrescătoare spre poartă (tur) / crescătoare dinspre poartă (retur) — subșir crescător maxim, O(n²);
//   · dintre candidatele «în ordine» câștigă cea cu cele mai multe sate; la egalitate, scorul vechi (acoperire + grafic 0,5 + depărtare);
//   · filtrul vechi rămâne (fără grafic și fără dus-întors, gol > plin → nu);
//   · fără nicio candidată «în ordine», alegerea veche neschimbată (inclusiv liniile «*» ale mașinii din grafic).
const TID = new Map(D.tinte.map(g => [g.id, g]));
function sateInOrdine(c, sens, r, kmCap) {
  const parte = c.apr.filter(a => (sens === 'tur' ? a.km >= kmCap : a.km <= kmCap) && r.k.includes(a.k) && TID.has(a.id)).sort((x, y) => x.km - y.km);
  const sir = (sens === 'tur' ? parte : parte.slice().reverse()).map(a => ({ k: a.k, d: hav(TID.get(a.id), PORTI[0]) }));   // ordinea capăt → poartă
  const L = sir.map(() => ({ n: 1, ks: null }));
  let best = 0;
  for (let i = 0; i < sir.length; i++) {
    L[i].ks = new Set([sir[i].k]);
    for (let j = 0; j < i; j++) if (sir[j].d > sir[i].d && !L[j].ks.has(sir[i].k) && L[j].ks.size + 1 > L[i].ks.size) L[i].ks = new Set([...L[j].ks, sir[i].k]);
    best = Math.max(best, L[i].ks.size);
  }
  return best;
}
function alege(c, sens) {
  const at = atinse(c), ids = new Set(c.apr.map(a => a.id)), pc = capatCursa(c, sens); let best = null, bestOrd = null;
  const laCapat = g => ids.has(g.id) || hav(g, pc) <= R_CAPAT_CURSA;
  for (const r of RUTE) {
    const grafic = r.M.has(c.m);
    let lin = r.LN.find(l => l.capat && laCapat(l.capat));
    if (!lin && grafic) {
      const satele = D.tinte.filter(g => r.k.includes(g.k) && laCapat(g)).sort((x, y) => hav(y, PORTI[0]) - hav(x, PORTI[0]));
      if (satele.length) { lin = { start: satele[0].n + '*', km: null, locuri: null, autobuze: { EZ: 0, D: 0 }, capat: satele[0], gps: true }; LIN_GPS.set(r.id + '|' + lin.start, lin); }
    }
    if (!lin) continue;
    const acop = r.k.filter(k => at.has(k)).length / Math.max(1, r.k.length);
    const ap = c.apr.filter(a => a.id === lin.capat.id);
    const kmCap = ap.length ? (sens === 'tur' ? ap[0].km : ap[ap.length - 1].km) : (sens === 'tur' ? 0 : c.km);
    const plin = sens === 'tur' ? c.km - kmCap : kmCap, gol = c.km - plin;
    if (!grafic && !(c.dinP && c.spreP) && gol > plin) continue;
    const scor = acop + (grafic ? 0.5 : 0) + hav(lin.capat, PORTI[0]) / 1000;
    const ord = lin.gps ? 0 : sateInOrdine(c, sens, r, kmCap);
    const nS = new Set(r.sateNume.map(s => kk(s)[0])).size, cov = ord / Math.max(1, nS);
    if (!best || scor > best.scor) best = { r, lin, scor, acop, ord, cov, regula: 'veche' };
    const RG = process.env.REGULA_V31 || 'A';
    const mai = RG === 'B' ? (!bestOrd || cov > bestOrd.cov || (cov === bestOrd.cov && (ord > bestOrd.ord || (ord === bestOrd.ord && scor > bestOrd.scor))))
      : (!bestOrd || ord > bestOrd.ord || (ord === bestOrd.ord && scor > bestOrd.scor));
    if (ord >= 2 && mai) bestOrd = { r, lin, scor, acop, ord, cov, regula: 'sate-in-ordine' };
  }
  const RG = process.env.REGULA_V31 || 'A';
  if (RG === 'A' && best && !best.lin.gps) return best;
  if (bestOrd && best && (bestOrd.r !== best.r || bestOrd.lin !== best.lin)) return { ...bestOrd, vechi: `${best.r.id}|${best.lin.start}` };
  return best;
}

const obs = new Map();   // ruta|linie|schimb|masina|zi → { tur, retur }  (perechea rămâne PE SCHIMB)
const pune = (k, sens, v) => { if (!obs.has(k)) obs.set(k, {}); const o = obs.get(k); if (!o[sens] || v.plin > o[sens].plin) o[sens] = v; };
const obsAll = [], afaraL = {};
let fara = 0, afara = 0, date = 0;
// v3 (ION-97) pct. 3: deplasarea poartă → ALTĂ poartă de ≤5 km (salt VEST↔EST, 3,6–4,0 km) nu e cursă cu oameni și nu se atribuie
// nicio linii (în v2 dădea 138 de observații liniei R7 Slobozia*: capătul «*» e la ≤2,5 km de poartă). Aceeași definiție ca V6 din
// verificator (drax.mjs `eSalt`, SALT_KM 5).
const SALT_KM = 5, eSalt = c => c.dinP && c.spreP && c.pIn && c.pOut && c.pIn !== c.pOut && c.km <= SALT_KM;
let salturi = 0, mutari = 0;
for (const c of D.curse) {
  if (!(c.dinP || c.spreP)) continue;
  if (eSalt(c)) { salturi++; continue; }
  const sensuri = []; if (c.spreP) sensuri.push('tur'); if (c.dinP) sensuri.push('retur');
  for (const sens of sensuri) {
    const h = ora(sens === 'tur' ? c.t1 : c.t0);
    const b = alege(c, sens); if (!b) { fara++; continue; }
    const s = Object.entries(FER[sens]).filter(([, f]) => inF(h, f)).map(([s]) => s)[0] || null;
    const zi = ziua(sens === 'tur' ? c.t1 : c.t0), luna = zi.slice(0, 7);
    const ap = c.apr.filter(a => a.id === b.lin.capat.id);
    let a;
    if (c.dinP && c.spreP) a = sens === 'retur' ? ap[0] : ap[ap.length - 1];
    else a = sens === 'tur' ? ap[0] : ap[ap.length - 1];
    if (!a) a = { km: sens === 'tur' ? 0 : c.km };
    const plin = sens === 'tur' ? c.km - a.km : a.km;
    const gol = c.dinP && c.spreP ? 0 : c.km - plin;
    if (plin < 0.5) continue;
    afaraL[luna] ??= { cuRuta: 0, afara: 0 }; afaraL[luna].cuRuta++;
    const rec = { m: c.m, zi, schimb: s, sens, ruta: b.r.id, linie: b.lin.start, t0: c.t0, t1: c.t1, ora: +h.toFixed(2),
      kmCap: +a.km.toFixed(2), plin: +plin.toFixed(1), gol: +gol.toFixed(1), km: c.km, rt: c.dinP && c.spreP,
      poarta: sens === 'tur' ? c.pOut : c.pIn, grafic: b.r.M.has(c.m), acop: +b.acop.toFixed(2), afara: !s, opr: c.opr,
      pranz: !s && h >= 8 && h < 15, dev: c.dev ?? null, dispozitiv: c.dev ?? null };   // F3 v5: cursă de prânz (F2 categorii.mjs:185-187) — steag, fără schimb
    // v3.1 (ION-99): regula satelor în ordine (atribuire + linia veche, doar la mutare) și cârpirea (km cârpiți pe partea cu oameni, steag)
    if (b.regula === 'sate-in-ordine') { rec.atribuire = { regula: b.regula, sate: b.ord, vechi: b.vechi }; mutari++; }
    if (c.carpit) { const [p0, p1] = sens === 'tur' ? [a.km, c.km] : [0, a.km];
      const pc = (c.goluri || []).filter(g => g.carpit).reduce((s, g) => s + Math.max(0, Math.min(p1, g.kmB) - Math.max(p0, g.kmA)), 0);
      rec.carpit = true; rec.kmCarpitCursa = c.kmCarpit; rec.plinCarpit = +pc.toFixed(2); rec.steagCarpit = !!c.steagCarpit;
      if ((c.apr || []).some(x => x.id === b.lin.capat.id && x.carpit && Math.abs(x.km - a.km) < 0.011)) rec.capatCarpit = true; }
    obsAll.push(rec);
    if (!s) { afara++; afaraL[luna].afara++; continue; }
    date++;
    pune(`${b.r.id}|${b.lin.start}|${s}|${c.m}|${zi}`, sens, rec);
  }
}

// perechile, strânse pe rută|linie
const linii = new Map();
for (const [k, o] of obs) { const [ruta, linie, s, m, z] = k.split('|'); const g = `${ruta}|${linie}`;
  if (!linii.has(g)) linii.set(g, []);
  linii.get(g).push({ z, schimb: s, m, tur: o.tur, retur: o.retur }); }

const inS = (p, sursa) => sursa === 'toate' || p.z >= SEPT;
function tureZi(P, sursa) {
  const Ls = P.filter(p => inS(p, sursa));
  const ambele = new Map(); for (const p of Ls) if (p.tur && p.retur) { const k = p.schimb + '|' + p.m; ambele.set(k, (ambele.get(k) || 0) + 1); }
  const calif = new Set([...ambele].filter(([, n]) => n >= 3).map(([k]) => k));
  if (!calif.size) return null;
  const zile = new Map();
  for (const p of Ls) if (calif.has(p.schimb + '|' + p.m)) { if (!zile.has(p.z)) zile.set(p.z, []); zile.get(p.z).push(p); }
  const apr = (a, b) => a && b && Math.abs(new Date(a.t0) - new Date(b.t0)) <= 180000;
  const cnt = [];
  for (const arr of zile.values()) { const kept = [];
    // v3 (ION-97) pct. 5: ±3 min se deduplică DOAR pe aceeași mașină (`q.m === p.m`); două autobuze reale care pleacă de la poartă la
    // același minut (146BRAZ + 518MHD pe Trifănești) nu se mai contopesc. Dispozitivele duble ale unui autobuz sunt deja unite pe plăcuță
    // (fix-350 / fix-dubluri / dubluri-placa), deci pe aceeași (schimb, mașină, zi) rămâne o singură pereche.
    // verdictul ideal-v3.1 (a): și același DISPOZITIV (două plăcuțe pe același tracker = același autobuz), ca etalon-gps.mjs v5
    const dev = p => p.tur?.dev ?? p.retur?.dev ?? null, acelasi = (q, p) => q.m === p.m || (dev(q) != null && dev(q) === dev(p));
    for (const p of arr) if (!kept.some(q => q.schimb === p.schimb && acelasi(q, p) && (apr(p.tur, q.tur) || apr(p.retur, q.retur)))) kept.push(p);
    cnt.push(kept.length); }
  return cnt.length ? Math.round(med(cnt)) : null;
}
const et = [];
const strip = o => o ? { plin: o.plin, gol: o.gol, km: o.km, t0: o.t0, t1: o.t1, ora: o.ora, rt: o.rt, poarta: o.poarta, kmCap: o.kmCap, dev: o.dev ?? null } : undefined;   // v3: + dev (cheia alege.mjs)
for (const r of RUTE) {
  const LN = [...r.LN, ...[...LIN_GPS.entries()].filter(([k]) => k.startsWith(r.id + '|')).map(([, l]) => l)];
  for (const lin of LN) {
    const P = linii.get(`${r.id}|${lin.start}`) || [];
    const cand = P.filter(p => p.tur && p.retur && Math.abs(p.tur.plin - p.retur.plin) / Math.max(p.tur.plin, p.retur.plin) <= 0.25)
      .sort((a, b) => (b.z >= SEPT) - (a.z >= SEPT) || b.z.localeCompare(a.z))
      .map(p => ({ z: p.z, schimb: p.schimb, m: p.m, tur: strip(p.tur), retur: strip(p.retur) }));
    const masini = new Map();
    for (const p of P) { if (!masini.has(p.m)) masini.set(p.m, { m: p.m, zile: new Set(), s1: 0, s2: 0, grafic: r.M.has(p.m) }); const M = masini.get(p.m); M.zile.add(p.z); M[p.schimb]++; }
    const zileDistincte = s => new Set(P.filter(p => inS(p, s)).map(p => p.z)).size;
    et.push({ ruta: r.id, nr: r.nr, nume: r.nume, linie: lin.start, gps: !!lin.gps, capat: lin.capat ? lin.capat.n : null, capatC: lin.capat ? [lin.capat.lat, lin.capat.lon] : null,
      atingeri: lin.capat ? (cntId.get(lin.capat.id) || 0) : 0, scorCapat: lin.n ?? null, kmKW24: lin.km, locuri: lin.locuri, autobuze: lin.autobuze, sate: r.sateNume, sateAct: r.sate,
      cand, nCand: { sept: cand.filter(c => c.z >= SEPT).length, toate: cand.length }, zile: { sept: zileDistincte('sept'), toate: zileDistincte('toate') },
      tureZi: { sept: tureZi(P, 'sept'), toate: tureZi(P, 'toate') },
      masini: [...masini.values()].map(M => ({ m: M.m, zile: M.zile.size, s1: M.s1, s2: M.s2, grafic: M.grafic })).sort((a, b) => b.zile - a.zile) });
  }
}
et.sort((a, b) => (a.nr || 99) - (b.nr || 99) || a.linie.localeCompare(b.linie));
scrieAtomic(OUT, JSON.stringify(et, null, 1));
scrieAtomic(OBS, JSON.stringify({ afara: afaraL, curse: obsAll }));

console.log('capete (pe linie):');
for (const e of et) console.log(`  ${e.ruta.padEnd(4)} ${e.nume.slice(0, 44).padEnd(44)} ${e.linie.padEnd(18)} KW24 ${String(e.kmKW24 ?? '·').padStart(3)} km · ${e.capat ? e.capat : '— NEGĂSIT'} (${e.atingeri} atingeri)`);
console.log(`\ncurse cu rută și schimb: ${date} · fără rută/capăt: ${fara} · cu rută dar în afara ferestrelor: ${afara} · salturi poartă→altă poartă ≤${SALT_KM} km neatribuite: ${salturi} · picioare mutate de regula satelor în ordine (v3.1): ${mutari} · cu km cârpiți: ${obsAll.filter(o => o.carpit).length}`);
console.log('afara pe lună (pe cursele cu rută): ' + Object.entries(afaraL).sort().map(([l, v]) => `${l} ${v.afara}/${v.cuRuta} (${Math.round(100 * v.afara / v.cuRuta)}%)`).join(' · '));
console.log('\nrută  linie               cand sept/toate  zile sept/toate  ture/zi sept/toate  act EZ+D  mașini (zile, s1/s2)');
for (const e of et) console.log(`${e.ruta.padEnd(5)} ${(e.linie + (e.gps ? '' : '')).padEnd(19)} ${String(e.nCand.sept).padStart(4)}/${String(e.nCand.toate).padEnd(5)}     ${String(e.zile.sept).padStart(3)}/${String(e.zile.toate).padEnd(4)}       ${String(e.tureZi.sept ?? '·').padStart(3)}/${String(e.tureZi.toate ?? '·').padEnd(5)}    ${e.autobuze ? e.autobuze.EZ + e.autobuze.D : '·'}     ${e.masini.map(m => `${m.m}${m.grafic ? '' : '?'}(${m.zile},${m.s1}/${m.s2})`).join(' ')}`);
const act = et.filter(e => !e.gps);
console.log(`\nlinii din act: ${act.length} · cu ≥3 candidate în sept.: ${act.filter(e => e.nCand.sept >= 3).length} · cu ≥3 în total: ${act.filter(e => e.nCand.toate >= 3).length} · fără nicio candidată: ${act.filter(e => !e.nCand.toate).map(e => e.ruta + ' ' + e.linie).join(', ') || '—'}`);
console.log(`linii * (mașina din grafic fără start KW24 atins): ${et.filter(e => e.gps).map(e => e.ruta + ' ' + e.linie + '(' + e.nCand.toate + ')').join(', ') || '—'}`);
const dinNom = new Set(N.rute.flatMap(r => Object.values(r.masini || {}).flat().map(canon)));
const cuLinie = new Set(et.flatMap(e => e.masini.map(m => m.m)));
console.log('mașini din grafic fără nicio linie: ' + ([...dinNom].filter(m => !cuLinie.has(m)).join(', ') || '—'));
console.log('mașini din flotă fără nicio linie: ' + (Object.keys(D.zilePoarta).filter(m => !cuLinie.has(m)).map(m => `${m}(${D.zilePoarta[m].zile}z)`).join(' ') || '—'));
