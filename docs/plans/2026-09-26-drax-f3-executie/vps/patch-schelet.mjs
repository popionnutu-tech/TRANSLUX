import { readFileSync, writeFileSync } from 'node:fs';
const D = process.argv[2];
const ed = (f, pasi) => { let s = readFileSync(`${D}/${f}`, 'utf8'); for (const [a, b] of pasi) { if (!s.includes(a)) throw new Error(`${f}: ${a.slice(0, 50)}`); s = s.replace(a, b); } writeFileSync(`${D}/${f}`, s); console.log(f, 'ok'); };
ed('page.tsx', [
  ["import ScheletBriceniClient, { type ScheletBriceni } from './ScheletBriceniClient';\n",
   "import ScheletBriceniClient, { type ScheletBriceni } from './ScheletBriceniClient';\nimport ScheletDraxClient, { type ScheletDrax } from './ScheletDraxClient';\n"],
  ['mejgorodLaToate, briceniLaToate,', 'mejgorodLaToate, briceniLaToate, draxLaToate,'],
  ["    fila: (d) => <ScheletBriceniClient schelet={d} />, laToate: briceniLaToate }),\n",
   "    fila: (d) => <ScheletBriceniClient schelet={d} />, laToate: briceniLaToate }),\n  // ION-94 (F3 din ION-86): scheletul ideal v2 Drăxlmaier, km = etalonul GPS completat, verificat de ION-95 (verificarea 2, 27.09);\n  // liniile cu «diagnostic cerut» păstrează km-ul vechi. Fișierul îl scrie drax/cod/ideal/export-lde.mjs, doar prin poarta verificatorului.\n  rand<ScheletDrax>({ id: 'drax', nume: 'Drăxlmaier Bălți', fisier: 'schelet-drax.json', href: '/lde/schelet?uz=drax',\n    fila: (d) => <ScheletDraxClient schelet={d} />, laToate: draxLaToate }),\n"],
]);
ed('toate.ts', [
  ["import type { ScheletBriceni } from './ScheletBriceniClient';\n", "import type { ScheletBriceni } from './ScheletBriceniClient';\nimport type { ScheletDrax } from './ScheletDraxClient';\n"],
  ["  briceni: { h: 96, culoare: '#557A2E' },\n", "  briceni: { h: 96, culoare: '#557A2E' },\n  drax: { h: 322, culoare: '#8A3A78' },\n"],
]);
let t = readFileSync(`${D}/toate.ts`, 'utf8');
t += `
// Drăxlmaier Bălți (ION-94): rută × linie, tur = retur, ture/zi măsurate; km/zi = 2 × km × ture/zi pe liniile cu ideal (fără cele informative),
// exact ca în fila ei. Două porți ale aceleiași uzini, EST și VEST.
export const draxLaToate = (drax: ScheletDrax): Retea[] => [
  retea('drax', 'Drăxlmaier Bălți', 'uzină · 2 porți, 2 schimburi', drax.porti,
    drax.rute.flatMap((r) => r.linii.filter((l) => l.km != null && !l.informativ).map((l) => ({
      id: \`\${r.id} \${l.nr}\`, nume: \`\${r.id} · \${l.nr}\`, km: l.kmZi, linie: l.tur.plin,
    })))),
];
`;
writeFileSync(`${D}/toate.ts`, t); console.log('toate.ts draxLaToate ok');
