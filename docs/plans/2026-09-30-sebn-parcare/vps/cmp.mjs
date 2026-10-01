import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
console.log('flota', a.flota.economieSapt, b.flota.economieSapt);
for (const x of a.masini) { const y = b.masini.find((m) => m.m === x.m); if (JSON.stringify(x) !== JSON.stringify(y)) { console.log('dif', x.m, x.economieSapt, y?.economieSapt);
  (x.legi ?? []).forEach((l, i) => { const k = y.legi?.[i]; if (JSON.stringify(l) !== JSON.stringify(k)) console.log('  ', l.z, l.ora, l.real, l.km, '|', k?.real, k?.km); }); } }
