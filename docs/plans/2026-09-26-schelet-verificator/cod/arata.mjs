// Afișează constatările unei rulări: node arata.mjs <controale.json> [prefix-control ...]
import { readFileSync } from 'node:fs';
const C = JSON.parse(readFileSync(process.argv[2], 'utf8')).controale; const f = process.argv.slice(3);
for (const c of C) if (!f.length || f.some(p => c.control === p)) console.log(`[${c.nivel}] ${c.control} ${c.ruta ?? ''} ${c.linie ?? ''} ${c.masina ?? ''} · ${c.cifra ?? ''} · ${c.motiv ?? ''}`.slice(0, 400));
