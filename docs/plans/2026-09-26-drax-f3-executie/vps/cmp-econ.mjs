// Proba (a) / (b) din planul F3, pasul A.1–A.2: economie*.json dintr-o copie de dinainte față de cele de acum.
//   node cmp-econ.mjs <dosar vechi> <dosar nou> [--fara-chei]
// (a) fără --fara-chei: egalitate după scoaterea lui `rulat` (oriunde); pagina drax/economie.html fără ștampila «rulat … UTC».
// (b) cu --fara-chei: egalitate după scoaterea lui `rulat`, `nelamuritLista`, `curseDePranz`; plus Σ nelamuritLista (zile neexcluse)
//     = nelamurit, pe fiecare mașină din economie.json.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [A, B, fl] = process.argv.slice(2);
const scoate = new Set(['rulat', ...(fl === '--fara-chei' ? ['nelamuritLista', 'curseDePranz'] : [])]);
const curat = (x) => Array.isArray(x) ? x.map(curat) : x && typeof x === 'object'
  ? Object.fromEntries(Object.entries(x).filter(([k]) => !scoate.has(k)).map(([k, v]) => [k, curat(v)])) : x;
const md5 = (s) => createHash('md5').update(s).digest('hex');
let rau = 0;
for (const f of readdirSync(A).filter((f) => /^economie.*\.json$/.test(f)).sort()) {
  if (!existsSync(`${B}/${f}`)) { console.log(`${f}: LIPSEȘTE în nou`); rau++; continue; }
  const a = md5(JSON.stringify(curat(JSON.parse(readFileSync(`${A}/${f}`, 'utf8')))));
  const b = md5(JSON.stringify(curat(JSON.parse(readFileSync(`${B}/${f}`, 'utf8')))));
  console.log(`${f}: ${a === b ? 'IDENTIC' : 'DIFERĂ'} ${b}`); if (a !== b) rau++;
}
const h = (f) => md5(readFileSync(f, 'utf8').replace(/rulat [0-9-]+ [0-9:]+ UTC/g, 'rulat X UTC'));
if (existsSync(`${A}/economie.html`)) { const x = h(`${A}/economie.html`), y = h(`${B}/../economie.html`); console.log(`economie.html: ${x === y ? 'IDENTIC' : 'DIFERĂ'}`); if (x !== y) rau++; }
if (fl === '--fara-chei') {
  const E = JSON.parse(readFileSync(`${B}/economie.json`, 'utf8'));
  let ok = 0, n = 0;
  for (const m of E.masini) {
    if (!Array.isArray(m.nelamuritLista)) { console.log(`${m.m}: fără nelamuritLista`); rau++; continue; }
    n++; const s = m.nelamuritLista.filter((q) => !q.exclus).reduce((a, q) => a + q.km, 0);
    if (Math.abs(s - (m.nelamurit ?? 0)) <= 0.3) ok++; else { console.log(`${m.m}: Σ listă ${s.toFixed(1)} ≠ nelamurit ${m.nelamurit}`); rau++; }
  }
  console.log(`Σ nelamuritLista = nelamurit: ${ok}/${n} mașini`);
}
console.log(rau ? `PROBA PICĂ (${rau})` : 'PROBA TRECE');
process.exit(rau ? 1 : 0);
