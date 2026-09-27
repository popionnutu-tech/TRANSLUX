// Pasul 3: satele «regulate» ale fiecărei linii, din opririle deja extrase (obs-ideal.json), FĂRĂ recitirea tracker-ului.
// Partea cu oameni = opririle cu km ≥ kmCap − 0,8 la tur / ≤ kmCap + 0,8 la retur (R_OPR); satul capătului e atins prin
// tăietură. Oprire în sat = ≤1,2 km de o țintă a rutei (coordonate, nume prin ALIAS). Se calculează pe DOUĂ surse (sept /
// toate) și pe SENS (tur / retur): regulate = sate din act cu oprire în ≥50 % din curse; inPlus = locuri din index cu
// oprire ≥25 % dar absente din act (locurile la <2 km de porți sunt neutre). Satele din act sunt pe RUTĂ: «lipsește» = 0 %
// pe toate liniile rutei, ambele sensuri (sursa toate).
import { writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };   // F3 v5 (R3-1): fără rescriere pe loc
import { readFileSync, writeFileSync } from 'node:fs';
const O = JSON.parse(readFileSync('../../date/ideal-v3/obs-ideal.json', 'utf8'));
const E = JSON.parse(readFileSync('../../date/ideal-v3/etalon-ideal.json', 'utf8'));
const D = JSON.parse(readFileSync('../../date/ideal-v3/curse-ideal.json', 'utf8'));
const N = JSON.parse(readFileSync('../../date/ideal-v3/nomenclator.json', 'utf8'));
const OUT = '../../date/ideal-v3/regulate-ideal.json';
const SEPT = '2026-09-01', R_OPR = 0.8, R_SAT = 1.2;
const cur = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const ALIAS = { mihaileniivechi: 'mihaileni', dobrujaveche: 'dobrogeaveche', satmarculesti: 'marculesti', zorojeni: 'zarojeni',
  grigoreuca: 'grigorauca', ustea: 'ustia', iezarenivechi: 'iezareniivechi', garacatranic: 'catranic', funduriivechi: 'fundurivechi', fundurivechi: 'funduriivechi' };
const kk = s => { const k = cur(s); return [k, ALIAS[k]].filter(Boolean); };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const byK = new Map(); for (const t of D.tinte) for (const k of [t.k]) { if (!byK.has(k)) byK.set(k, []); byK.get(k).push(t); }
const tinteSat = nume => kk(nume).flatMap(k => byK.get(k) || []);
const langaPoarta = p => N.porti.some(g => hav(p, g) < 4);   // cartierele Bălțiului (Dacia) nu-s sate
const curse = new Map(); for (const c of O.curse) { if (!c.schimb) continue; const k = c.ruta + '|' + c.linie; if (!curse.has(k)) curse.set(k, []); curse.get(k).push(c); }
const out = {}, lipsaPeRuta = {};
const acum = new Map(); // ruta → sat → a fost vreodată oprit (toate liniile, ambele sensuri, sursa toate)
for (const e of E) {
  const key = e.ruta + '|' + e.linie, r = N.rute.find(x => x.id === e.ruta);
  // satele din act: numele original (sateNume) pentru afișare, potrivirea pe orice formă (sate = curățat)
  const sate = r.sateNume.map(n => ({ n, chei: kk(n) })).filter(s => !/^dra\d?$/i.test(cur(s.n)));
  const cheiAct = new Set(sate.flatMap(s => s.chei));
  const capC = e.capatC ? { lat: e.capatC[0], lon: e.capatC[1] } : null;
  const C = curse.get(key) || [];
  const res = {};
  for (const sursa of ['sept', 'toate']) {
    res[sursa] = {};
    for (const sens of ['tur', 'retur']) {
      const CS = C.filter(c => c.sens === sens && (sursa === 'toate' || c.zi >= SEPT)); const n = CS.length;
      const nr = new Map(), plus = new Map();
      for (const c of CS) {
        const oameni = c.opr.filter(o => sens === 'tur' ? o.km >= c.kmCap - R_OPR : o.km <= c.kmCap + R_OPR);
        const oprit = new Set();
        for (const s of sate) { const T = s.chei.flatMap(k => byK.get(k) || []);
          const laCapat = capC && T.some(t => hav(t, capC) < 0.05);
          const O2 = laCapat ? c.opr : oameni;   // capătul: orice oprire a cursei lângă el (tăietura e acolo)
          if (T.some(t => O2.some(o => hav(o, t) <= R_SAT))) oprit.add(s.n); }
        for (const s of oprit) nr.set(s, (nr.get(s) || 0) + 1);
        for (const nume of new Set(oameni.map(o => o.n))) { if (cheiAct.has(cur(nume))) continue; const o = oameni.find(x => x.n === nume); if (langaPoarta(o)) continue; plus.set(nume, (plus.get(nume) || 0) + 1); }
      }
      const procent = sate.map(s => ({ n: s.n, p: n ? Math.round(100 * (nr.get(s.n) || 0) / n) : 0 }));
      res[sursa][sens] = { n, procent, regulate: procent.filter(x => x.p >= 50).map(x => x.n),
        inPlus: [...plus].filter(([, v]) => n && v / n >= 0.25).sort((a, b) => b[1] - a[1]).map(([x, v]) => ({ n: x, p: Math.round(100 * v / n) })) };
      if (sursa === 'toate') { if (!acum.has(e.ruta)) acum.set(e.ruta, new Map()); for (const x of procent) acum.get(e.ruta).set(x.n, (acum.get(e.ruta).get(x.n) || 0) + (nr.get(x.n) || 0)); }
    }
  }
  res.panaInIulie = { tur: res.toate.tur.regulate.filter(s => !res.sept.tur.regulate.includes(s)), retur: res.toate.retur.regulate.filter(s => !res.sept.retur.regulate.includes(s)) };
  out[key] = res;
}
for (const [ruta, m] of acum) lipsaPeRuta[ruta] = [...m].filter(([, v]) => v === 0).map(([s]) => s);
scrieAtomic(OUT, JSON.stringify({ linii: out, lipsaPeRuta }));
for (const e of E) { const q = out[e.ruta + '|' + e.linie]; if (!q) continue;
  const f = (s, sens) => `${sens} (${q[s][sens].n}): ${q[s][sens].procent.map(x => `${x.n} ${x.p}%`).join(', ')}` + (q[s][sens].inPlus.length ? `  | în plus: ${q[s][sens].inPlus.map(x => `${x.n} ${x.p}%`).join(', ')}` : '');
  console.log(`\n${e.ruta} ${e.linie}  [${e.masini.map(m => m.m).join(', ')}]`);
  for (const s of ['sept', 'toate']) { console.log(`  ${s}: ${f(s, 'tur')}`); console.log(`  ${' '.repeat(s.length)}  ${f(s, 'retur')}`); }
  if (q.panaInIulie.tur.length || q.panaInIulie.retur.length) console.log(`  până în iulie: tur ${q.panaInIulie.tur.join(', ') || '—'} · retur ${q.panaInIulie.retur.join(', ') || '—'}`); }
console.log('\nsate din act cu 0 % pe toată ruta (toate liniile, ambele sensuri): ' + (Object.entries(lipsaPeRuta).filter(([, v]) => v.length).map(([r, v]) => `${r}: ${v.join(', ')}`).join(' · ') || '—'));
