// ION-123 r2 — rezumatul local al ziua-ideala-v2.json (node rezumat-v2.mjs)
import { readFileSync } from 'node:fs';
const J = JSON.parse(readFileSync(new URL('./ziua-ideala-v2.json', import.meta.url)));
const r1 = (x) => Math.round(x * 10) / 10;
const L = J.legaturi.filter((v) => v.src === 'gps');
const rat = L.map((v) => v.km / v.valhallaDiag).sort((a, b) => a - b);
console.log('GPS/Valhalla pe perechi: n', rat.length, 'p10', r1(rat[Math.floor(rat.length * .1)] * 100), 'med', r1(rat[Math.floor(rat.length / 2)] * 100), 'p90', r1(rat[Math.floor(rat.length * .9)] * 100), '%');
console.log('extreme', L.map((v) => ({ ...v, q: r1(v.km / v.valhallaDiag * 100) })).sort((a, b) => b.q - a.q).filter((_, i, a) => i < 5 || i >= a.length - 5).map((v) => `${v.a}|${v.b} gps ${r1(v.km)} val ${v.valhallaDiag} n ${v.n} (${v.q}%)`).join('\n'));
for (const m of ['710CWN', '925FTI']) { const R = J.exemple[m].filter((r) => r.esant);
  console.log('\n==', m, 'zile', R.length, 'econ/zi', r1(R.reduce((a, r) => a + r.economie, 0) / R.length));
  for (const r of J.exemple[m]) console.log(` ${r.z} dow${r.dow} ${r.esant ? '' : '[afara ' + r.motiv + ']'} gps ${r.gps} obl ${r.obligatorii} leg ${r.legaturi} noapteId ${r.noapteIdeala} ideal ${r.ideal} econ ${r.economie} sep ${JSON.stringify(r.separat)} c ${JSON.stringify(r.cauze)}`);
  const r = J.exemple[m][0]; for (const i of r.intervale) console.log('   ', JSON.stringify(i)); for (const h of r.jumatati) console.log('   ', JSON.stringify(h)); }
const M = J.masini.find((x) => x.m === '710CWN'), N = J.masini.find((x) => x.m === '925FTI'); console.log(JSON.stringify(M), '\n', JSON.stringify(N));
console.log('\nziSub-5', JSON.stringify(J.probe.ziSubMinus5.lista));
console.log('763LYY', JSON.stringify(J.proba763LYY));
console.log('peste prag', J.pestePrag.length, J.pestePrag.map((x) => `${x.m} ${x.kmSapt}`).join(', '));
console.log('sub prag', J.masini.filter((x) => !x.pestePrag).map((x) => `${x.m}${x.separat ? '(sep)' : ''} ${x.kmSapt12_2} [${x.zileMasurate}/${x.zileLV}]`).join(', '));
const S = J.masini.reduce((a, x) => a + (x.separat ? 0 : x.kmSapt12_2), 0); console.log('Σ kmSapt12_2 fără sep', r1(S));
// drumMaiScurt top
const neg = J.randuri.filter((r) => r.esant && !r.sep).flatMap((r) => r.intervale.filter((i) => i.economie - i.ocol < -0.05).map((i) => ({ m: r.m, z: r.z, ...i, d: r1(i.economie - i.ocol) }))).sort((a, b) => a.d - b.d);
console.log('drumMaiScurt intervale', neg.length, 'km', r1(neg.reduce((a, i) => a + i.d, 0)), 'din care GPS', r1(neg.filter((i) => !i.src.includes('valhalla')).reduce((a, i) => a + i.d, 0)));
for (const i of neg.slice(0, 8)) console.log(`  ${i.m} ${i.z} ${i.ora} ${i.cats} neobl ${i.neobl} ocol ${i.ocol} leg ${i.leg} ${i.src} iu ${i.intreUzine} d ${i.d}`);
const nn = J.randuri.filter((r) => r.esant && !r.sep).flatMap((r) => r.jumatati.filter((h) => h.cat === 'normal' && h.economie < -0.05).map((h) => ({ m: r.m, z: r.z, ...h })));
console.log('nopți negative', nn.length, r1(nn.reduce((a, h) => a + h.economie, 0)), nn.slice(0, 5).map((h) => `${h.m} ${h.noapte} ${h.part} real ${h.real} int ${h.legaturaInterna} part ${h.partNoapte} leg ${h.legNoapte} ${h.src}`).join(' | '));
// drumLung top
const pos = J.randuri.filter((r) => r.esant && !r.sep).flatMap((r) => r.intervale.map((i) => ({ m: r.m, z: r.z, ...i, d: r1(i.economie - i.ocol) }))).filter((i) => i.d > 0).sort((a, b) => b.d - a.d);
console.log('drumLung(+Acasa) top'); for (const i of pos.slice(0, 10)) console.log(`  ${i.m} ${i.z} ${i.ora} ${i.cats} neobl ${i.neobl} ocol ${i.ocol} leg ${i.leg} ${i.src} iu ${i.intreUzine} d ${i.d}`);
const src = {}; for (const r of J.randuri.filter((r) => r.esant && !r.sep)) for (const i of r.intervale) { if (i.src === '0') continue; const k = i.src.includes('valhalla') ? 'valhalla' : 'gps'; src[k] = (src[k] ?? 0) + i.leg; } console.log('km legături eșantion pe sursă', JSON.stringify(src));
console.log('nopti src', JSON.stringify(J.randuri.filter((r) => r.esant && !r.sep).flatMap((r) => r.jumatati).reduce((o, h) => { const k = h.src.includes('valhalla') ? 'valhalla' : h.src === '0' ? 'zero' : 'gps'; o[k] = (o[k] ?? 0) + 1; return o; }, {})));
console.log('R3 id', JSON.stringify(J.identitati.R3)); console.log('esantion', JSON.stringify(J.esantion));
console.log('balti pe masina', JSON.stringify(Object.entries(J.randuri.filter((r) => r.esant && !r.sep).reduce((o, r) => { if (r.separat.balti) o[r.m] = r1((o[r.m] ?? 0) + r.separat.balti); return o; }, {}))));
