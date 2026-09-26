// Scheletul ideal ION-71 (vechi, drax/date/) față de idealul v2 (drax/date/ideal-v2/), după pasul E.1 al F3. Doar citire.
//   node compara-ideal.mjs <schelet-ideal vechi> <dosarul ideal-v2> > ce-s-a-schimbat.md
// Ion, 26.09: «nu folosim geometria, folosim km reali din GPS» — TOATE comparațiile sunt pe km GPS (etalonul = mediana km GPS pe zilele
// bune, schelet-ideal.json → etalon / schimburi.*.km / real), ture/zi și ore; drumul desenat (Valhalla, `drum`) intră doar la harta din
// schelet-drax.json, cu controlul de consecvență ±5 % față de etalonul GPS (coloana «hartă»).
// (1) linie cu linie (rută|linie): etalonul GPS, km GPS pe schimb (tur/retur), ture/zi, orele, capătul, satele, cursele de prânz (steag nou);
// (2) dublurile scoase de dubluri-placa.mjs: km-ii cursei păstrate față de mediana ACELEIAȘI mașini pe rută|linie|sens în zilele fără
//     dublură — steag peste 15 % (decizia rămâne la om); dublurile cu alt sens, listate (nescoase); zilele incoerente.
import { readFileSync, existsSync } from 'node:fs';
const [fv, dv2] = process.argv.slice(2);
const V = JSON.parse(readFileSync(fv, 'utf8')), N = JSON.parse(readFileSync(`${dv2}/schelet-ideal.json`, 'utf8'));
const O = JSON.parse(readFileSync(`${dv2}/obs-ideal.json`, 'utf8')).curse;
const R = existsSync(`${dv2}/dubluri-placa-raport.json`) ? JSON.parse(readFileSync(`${dv2}/dubluri-placa-raport.json`, 'utf8')) : { scoase: [], altSens: [], zileIncoerente: [] };
const k = (l) => `${l.ruta}|${l.linie}`, med = (a) => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : null; };
const mv = new Map(V.map((l) => [k(l), l])), mn = new Map(N.map((l) => [k(l), l]));
const pranz = new Map(); for (const o of O) if (o.pranz) pranz.set(`${o.ruta}|${o.linie}`, (pranz.get(`${o.ruta}|${o.linie}`) ?? 0) + 1);
const sch = (l) => Object.entries(l?.schimburi ?? {}).map(([s, x]) => `${s} ${x.km?.tur ?? '—'}/${x.km?.retur ?? '—'} (${(x.masini ?? []).map((m) => m.m).join(',')})`).join('; ');
const ore = (l) => Object.entries(l?.schimburi ?? {}).map(([s, x]) => `${s} ${x.oraTur ?? '—'}/${x.oraRetur ?? '—'}`).join('; ');
const hav = (a, b) => { const R = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r; const q = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(q)); };
const lung = (d) => (d ?? []).reduce((a, p, i) => (i ? a + hav(d[i - 1], p) : 0), 0);
// harta: lungimea drumului desenat față de etalonul GPS (±5 %); doar pentru hartă, nu pentru cifre
const harta = (l) => { if (!l?.drum?.length || !l.etalon) return '—'; const r = lung(l.drum) / l.etalon - 1; return `${(100 * r).toFixed(1)} %${Math.abs(r) > 0.05 ? ' ⚑' : ''}`; };
const sate = (l) => (l?.sateDrum ?? []).map((s) => s.n).join(' · ');
const rand = []; let dif = 0;
for (const key of [...new Set([...mv.keys(), ...mn.keys()])].sort()) {
  const a = mv.get(key), b = mn.get(key); const d = [];
  if (!a) d.push('linie NOUĂ'); else if (!b) d.push('linie DISPĂRUTĂ');
  else {
    if (a.etalon !== b.etalon) d.push(`etalon GPS ${a.etalon} → ${b.etalon} km`);
    if (a.km !== b.km) d.push(`km ${a.km} → ${b.km}`);
    if (ore(a) !== ore(b)) d.push(`ore «${ore(a)}» → «${ore(b)}»`);
    if (a.tureZi !== b.tureZi) d.push(`ture/zi ${a.tureZi} → ${b.tureZi}`);
    if (sch(a) !== sch(b)) d.push(`schimburi «${sch(a)}» → «${sch(b)}»`);
    if (a.capat !== b.capat) d.push(`capăt ${a.capat} → ${b.capat}`);
    if (sate(a) !== sate(b)) d.push(`sate «${sate(a)}» → «${sate(b)}»`);
  }
  if (d.length) dif++;
  rand.push(`| ${key} | ${b?.etalon ?? '—'} | ${pranz.get(key) ?? 0} | ${harta(b)} | ${d.join('; ') || '—'} |`);
}
console.log(`# Scheletul ideal Drăxlmaier — ce s-a schimbat (F3, pasul E)\n\nLinii: ${mv.size} înainte, ${mn.size} după; cu diferențe: ${dif}; curse de prânz (steag): ${[...pranz.values()].reduce((a, x) => a + x, 0)} pe ${pranz.size} linii.\n\n| rută|linie | etalon GPS v2 (km) | curse de prânz | hartă: drum desenat față de etalon (±5 %) | ce s-a schimbat (km GPS, ture/zi, ore, capăt, sate) |\n|---|---|---|---|---|`);
for (const r of rand) console.log(r);
// dublurile: km GPS păstrați față de mediana km GPS a mașinii pe rută|linie|sens, din zilele fără dublură
const zileDubl = new Set(R.scoase.map((x) => `${x.m}|${x.zi}`));
const obsPe = new Map(); for (const o of O) if (!zileDubl.has(`${o.m}|${o.zi}`)) { const kk = `${o.m}|${o.ruta}|${o.linie}|${o.sens}`; (obsPe.get(kk) ?? obsPe.set(kk, []).get(kk)).push(o.km); }
console.log(`\n## Dublurile scoase (${R.scoase.length}) — km păstrați față de mediana mașinii (steag > 15 %)\n\n| mașina | zi | km păstrat | km scos | rută|linie|sens | mediana | abatere | steag |\n|---|---|---|---|---|---|---|---|`);
let steaguri = 0;
for (const x of R.scoase) {
  const o = O.find((q) => q.m === x.m && Math.abs(Date.parse(q.t0) - Date.parse(x.t0)) <= 60000);
  const m = o ? med(obsPe.get(`${o.m}|${o.ruta}|${o.linie}|${o.sens}`) ?? []) : null, ab = m ? (x.kmPastrat - m) / m : null, st = ab != null && Math.abs(ab) > 0.15;
  if (st) steaguri++;
  console.log(`| ${x.m} | ${x.zi} | ${x.kmPastrat} | ${x.kmScos} | ${o ? `${o.ruta}|${o.linie}|${o.sens}` : '— (fără rută)'} | ${m ?? '—'} | ${ab == null ? '—' : `${(100 * ab).toFixed(0)} %`} | ${st ? '⚑' : ''} |`);
}
console.log(`\nSteaguri > 15 %: ${steaguri}. Zile incoerente (perechi care aleg laturi diferite): ${R.zileIncoerente.join(', ') || '—'}.`);
console.log(`\n## Dubluri cu alt sens — listate, NU scoase (${R.altSens.length})\n`);
for (const x of R.altSens) console.log(`- ${x.m} ${x.zi}: t0 ${x.t0.join(' / ')}, km ${x.km.join(' / ')}, sens ${x.sens.join(' / ')}`);
