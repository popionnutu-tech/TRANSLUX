// Ideal-v3.1 (ION-99) pasul 2 — LISTA MUTĂRILOR regulii satelor în ordine, pe toată flota (doar citire: obs-ideal.json v3.1 + v3).
// Scrie mutari-v31.json (fiecare picior mutat: mașină, zi, schimb, sens, linia veche → nouă, sate în ordine, km GPS = plin + raza porții,
// km cârpiți pe partea cu oameni) și tipărește rezumatul + tabelul 345KAJ pe R6. km GPS = plinC din etalon-gps.mjs (aceeași formulă).
//   cd /root/lde-worker/drax/cod/ideal-v3.1 && node mutari.mjs
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
const DIR = '../../date/ideal-v3.1';
const O = JSON.parse(readFileSync(`${DIR}/obs-ideal.json`, 'utf8'));
const V3 = JSON.parse(readFileSync(`${DIR}/proba/v3/obs-ideal.json`, 'utf8'));
const PORTI = JSON.parse(readFileSync('/home/verif/verificator/date/porti-drax.json', 'utf8')); const raza = Object.fromEntries(PORTI.map(p => [p.nume, p.raza]));
const plinC = c => raza[c.poarta] == null ? null : +(c.plin + raza[c.poarta]).toFixed(2);
const k3 = new Map(V3.curse.map(c => [`${c.m}|${c.t0}|${c.sens}`, c]));
const M = O.curse.filter(c => c.atribuire).map(c => { const v = k3.get(`${c.m}|${c.t0}|${c.sens}`);
  return { m: c.m, zi: c.zi, schimb: c.schimb, sens: c.sens, vechi: c.atribuire.vechi, nou: `${c.ruta}|${c.linie}`, sate: c.atribuire.sate, kmGPS: plinC(c), plin: c.plin,
    plinV3: v ? v.plin : null, plinCarpit: c.plinCarpit || 0, carpit: !!c.carpit, poarta: c.poarta, t0: c.t0 }; }).sort((a, b) => a.m.localeCompare(b.m) || a.t0.localeCompare(b.t0) || a.sens.localeCompare(b.sens));
writeFileSync(`${DIR}/mutari-v31.json.tmp`, JSON.stringify({ regula: 'sate-in-ordine (etalon.mjs v3.1)', n: M.length, cuSchimb: M.filter(x => x.schimb).length, picioare: M }, null, 1)); renameSync(`${DIR}/mutari-v31.json.tmp`, `${DIR}/mutari-v31.json`);
const g = new Map(); for (const x of M) { const k = `${x.vechi} → ${x.nou}`; const y = g.get(k) || { n: 0, s: 0, m: {} }; y.n++; if (x.schimb) y.s++; y.m[x.m] = (y.m[x.m] || 0) + 1; g.set(k, y); }
console.log(`picioare mutate: ${M.length} (cu schimb, deci în perechi/etalon: ${M.filter(x => x.schimb).length})`);
console.log('| linia veche → nouă | picioare | cu schimb | mașini |\n|---|---:|---:|---|');
for (const [k, y] of [...g].sort((a, b) => b[1].n - a[1].n)) console.log(`| ${k} | ${y.n} | ${y.s} | ${Object.entries(y.m).map(([m, n]) => `${m} ${n}`).join(', ')} |`);
const z = M.filter(x => x.m === '345KAJ' && x.nou.startsWith('R6|'));
console.log(`\n345KAJ pe R6 (${z.length} picioare, zile ${[...new Set(z.map(x => x.zi))].length}):\n| zi | schimb | sens | poarta | km GPS (plin + raza) | plin v3 (pe R3\\|Recea*) | km cârpiți |\n|---|---|---|---|---:|---:|---:|`);
for (const x of z) console.log(`| ${x.zi} | ${x.schimb ?? '— (în afara FER)'} | ${x.sens} | ${x.poarta} | ${x.kmGPS} | ${x.plinV3 ?? '—'} | ${x.plinCarpit} |`);
// dezbaterea 27.09 pct. 4: atribuirea nu mai folosește punctele cârpite (etalon.mjs aprR) — mutările pierdute / câștigate față de rularea 1
import { existsSync } from 'node:fs';
if (existsSync(`${DIR}/proba/mutari-v31-r1.json`)) {
  const R1 = JSON.parse(readFileSync(`${DIR}/proba/mutari-v31-r1.json`, 'utf8')).picioare, k = x => `${x.m}|${x.t0}|${x.sens}`;
  const a = new Map(R1.map(x => [k(x), x])), b = new Map(M.map(x => [k(x), x]));
  const pierdute = R1.filter(x => !b.has(k(x))), noi = M.filter(x => !a.has(k(x))), alta = M.filter(x => a.has(k(x)) && a.get(k(x)).nou !== x.nou);
  console.log(`\nfață de rularea 1 (cu punctele cârpite la atribuire): ${R1.length} → ${M.length} · pierdute ${pierdute.length} · noi ${noi.length} · altă linie nouă ${alta.length}`);
  for (const x of pierdute) console.log(`  pierdută: ${x.m} ${x.zi} ${x.schimb ?? '—'} ${x.sens} ${x.vechi} → ${x.nou} (sate ${x.sate})`);
  for (const x of noi) console.log(`  nouă: ${x.m} ${x.zi} ${x.schimb ?? '—'} ${x.sens} ${x.vechi} → ${x.nou} (sate ${x.sate})`);
}
