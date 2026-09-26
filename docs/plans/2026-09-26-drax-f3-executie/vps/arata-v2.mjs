// Raportul E.1b: cele 8 linii cerute de sesiune + prezența câmpului dispozitiv (curse și observații). Doar citire.
import { readFileSync } from 'node:fs';
const D = process.argv[2]; const J = (f) => JSON.parse(readFileSync(`${D}/${f}`, 'utf8'));
const S = J('schelet-ideal.json'), C = J('curse-ideal.json').curse, O = J('obs-ideal.json').curse;
const cur = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
for (const n of ['usurei', 'bocancea', 'zarojeni', 'catranic', 'sturzovca', 'trifanesti', 'nihoreni', 'mihaileni'])
  for (const l of S.filter((x) => cur(x.linie).includes(n)))
    console.log(`${l.ruta}|${l.linie}: card ${l.km} · km/zi ${l.kmZi} · ture/zi ${l.tureZi} · ${l.diagnostic ?? '—'}${l.diagnosticMotiv ? ` (${l.diagnosticMotiv})` : ''} · etalon GPS ${l.card?.etalonGPS ?? '—'} / orice poartă ${l.card?.etalonOricePoarta ?? '—'} · C47 ${l.card?.c47 ?? '—'} %`);
console.log(`steag diagnostic pe: ${S.filter((l) => l.diagnostic).map((l) => `${l.ruta}|${l.linie}`).join(', ')}`);
const cu = C.filter((c) => c.dev != null).length, co = O.filter((c) => c.dispozitiv != null).length;
const lipsa = {}; for (const c of C) if (c.dev == null) lipsa[c.m] = (lipsa[c.m] ?? 0) + 1;
console.log(`dispozitiv: curse ${cu}/${C.length} (fără: ${JSON.stringify(lipsa)}) · observații ${co}/${O.length}`);
for (const m of ['350KAJ', '880RNK', '034BRAT']) { const x = {}; for (const c of C.filter((q) => q.m === m)) x[c.dev] = (x[c.dev] ?? 0) + 1; console.log(`  ${m}: ${JSON.stringify(x)}`); }
