// ION-123 r3 — rezumatul local al ziua-ideala-v3.json și comparația cu r2 fără ciornă (node rezumat-v3.mjs)
import { readFileSync } from 'node:fs';
const L = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url)));
const J = L('./ziua-ideala-v3.json'), V2 = L('../r2/ziua-ideala-v2-fara-ciorna.json');
const r1 = (x) => Math.round(x * 10) / 10;
console.log('v2 fără ciornă: flota', JSON.stringify({ e: V2.flota.economie, x: V2.flota.extrapolat, c: V2.flota.cauze, perechiGps: V2.observatii.perechiGps, med: V2.observatii.obsMedianPerPerecheGps, sep: V2.flota.separat }));
console.log('v3: flota', JSON.stringify({ e: J.flota.economie, x: J.flota.extrapolat, c: J.flota.cauze, comp: J.flota.componenteAcasa, suma: J.flota.sumaCauze, bil: J.flota.bilantGps, perechiGps: J.observatii.perechiGps, med: J.observatii.obsMedianPerPerecheGps, sep: J.flota.separat }));
for (const m of ['710CWN', '925FTI', '880RNK', '350KAJ']) {
  const a = J.masini.find((x) => x.m === m), b = V2.masini.find((x) => x.m === m);
  console.log(`\n== ${m} v3: ${a.zileMasurate}/${a.zileLV} zile, ${a.peZi}/zi, ${a.kmSapt12_2}/săpt, cauze ${JSON.stringify(a.cauze)} sep ${JSON.stringify(a.separatKm)} | v2: ${b.peZi}/zi ${b.kmSapt12_2}/săpt ${JSON.stringify(b.cauze)}`);
  const R = J.randuri.filter((r) => r.m === m); console.log('  zile:', R.map((r) => `${r.z.slice(5)}${r.esant ? '' : '[' + r.motiv + ']'} ${r.economie}`).join(' · '));
}
// perechile din care au intrat observații ale lui 350KAJ#2284: schimbarea legăturilor v2 → v3
const k2 = new Map(V2.legaturi.map((v) => [`${v.a}|${v.b}`, v]));
const dif = J.legaturi.map((v) => ({ v, w: k2.get(`${v.a}|${v.b}`) })).filter(({ v, w }) => w && (v.src !== w.src || Math.abs(v.km - w.km) > 0.5));
console.log('\nlegături schimbate v2→v3:', dif.length, dif.slice(0, 12).map(({ v, w }) => `${v.a}|${v.b} ${w.src} ${r1(w.km)} n${w.n} → ${v.src} ${r1(v.km)} n${v.n}`).join('\n  '));
console.log('\nziSub-5', JSON.stringify(J.probe.ziSubMinus5.lista.map((x) => `${x.m} ${x.z} ${x.e}`)));
console.log('peste prag', J.pestePrag.length, J.pestePrag.map((x) => `${x.m} ${x.kmSapt}`).join(' · '));
console.log('Σ §12.2 fără sep', r1(J.masini.reduce((a, x) => a + (x.separat ? 0 : x.kmSapt12_2), 0)));
const p2 = new Set(V2.pestePrag.map((x) => x.m)), p3 = new Set(J.pestePrag.map((x) => x.m));
console.log('intrate', [...p3].filter((m) => !p2.has(m)), 'ieșite', [...p2].filter((m) => !p3.has(m)));
