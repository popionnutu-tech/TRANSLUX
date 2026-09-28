// ION-120 r1 — suprapunerile dintre reguli pe mașină (din /tmp/ion120/patru-reguli.json), doar citire
import { readFileSync } from 'node:fs';
const o = JSON.parse(readFileSync('/tmp/ion120/patru-reguli.json', 'utf8'));
const L = o.liste, r1 = (x) => Math.round(x * 10) / 10;
const pe = (arr, f) => { const m = {}; for (const x of arr) m[x.m] = (m[x.m] ?? 0) + f(x); return m; };
const R1n = pe(L.R1n.filter((x) => x.c1 && x.esant), (x) => x.km);
const R3 = Object.fromEntries(o.R3.capacitate.peMasina.map((x) => [x.m, x.km]));
let ov = 0; const lista = [];
for (const m of Object.keys(R3)) if (R3[m] > 0 && R1n[m]) { const v = Math.min(R3[m], R1n[m]); ov += v; lista.push(`${m} R-3 +${R3[m]} / R-1n ${r1(R1n[m])}`); }
console.log('R-3 (capacitate) ∩ R-1n, margine superioară:', r1(ov), lista.join('; '));
// R-1n: nopțile după lungime (ultimul retur → primul tur)
const nopti = L.R1n.filter((x) => x.c1 && x.esant);
const scurta = nopti.filter((x) => /^0[0-2]:.. → 0[3-7]/.test(x.ora)), lunga = nopti.filter((x) => !/^0[0-2]:.. → 0[3-7]/.test(x.ora));
console.log('R-1n noapte scurtă (retur s2 → tur s1):', scurta.length, r1(scurta.reduce((a, x) => a + x.km, 0)), '· restul (tur s2 a doua zi):', lunga.length, r1(lunga.reduce((a, x) => a + x.km, 0)));
console.log('R-1n deja la X (≤ 1,5 km):', nopti.filter((x) => x.dejaLaX).length, '· la > 10 km de X:', nopti.filter((x) => x.noapte > 10).length, r1(nopti.filter((x) => x.noapte > 10).reduce((a, x) => a + x.km, 0)));
console.log('R-1n pe mașină (km, nopți, distanța nopții la X):', Object.entries(pe(nopti, (x) => x.km)).sort((a, b) => b[1] - a[1]).map(([m, v]) => `${m} ${r1(v)} (${nopti.filter((x) => x.m === m).length}n, ${[...new Set(nopti.filter((x) => x.m === m).map((x) => x.noapte))].slice(0, 2).join('/')} km, X=${nopti.find((x) => x.m === m).X})`).join('; '));
// R-4 pe mașină: ocol vs tot, cu tipul trecerii
const r4 = L.R4.filter((x) => x.esant);
const M4 = {}; for (const x of r4) { const q = M4[x.m] ??= { ocol: 0, tot: 0, n: 0, casa: x.casa }; q.ocol += x.ocolR1b; q.tot += x.tot; q.n++; }
console.log('R-4 pe mașină (ocol / tot / goluri):', Object.entries(M4).sort((a, b) => b[1].tot - a[1].tot).map(([m, q]) => `${m} ${r1(q.ocol)}/${r1(q.tot)}/${q.n} (${q.casa})`).join('; '));
// R-2: goluri tur→retur cu km în afara zonei
const r2 = L.R2.filter((x) => x.esant && x.afara > 0);
console.log('R-2 goluri cu km în afara zonei:', r2.map((x) => `${x.m} ${x.z} ${x.ora} afară ${x.afara} gol ${x.kmGol} oprire≥20′ afară ${x.lunga} min`).join('; '));
const r2p = L.R2.filter((x) => x.esant && x.pereche); console.log('R-2 perechi: gol total', r1(r2p.reduce((a, x) => a + x.kmGol, 0)), 'ore mediane', r2p.map((x) => x.ore).sort((a, b) => a - b)[Math.floor(r2p.length / 2)]);
const r2a = L.R2.filter((x) => x.esant && !x.pereche); console.log('R-2 tur→retur linii/schimburi diferite:', r2a.length, 'gol', r1(r2a.reduce((a, x) => a + x.kmGol, 0)), 'ore max', Math.max(...r2a.map((x) => x.ore)));
