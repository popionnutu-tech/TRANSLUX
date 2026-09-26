// Notarea PROBEI OARBE — o rulează SESIUNEA (nu agentul), local. Notează DOAR judecata agentului (judecata.json), nu ieșirea scriptului.
//   node noteaza.mjs <judecata.json> [--transcript <transcriptul subagentului .jsonl>] [--etalon <fișier>]
// Proba e ANULATĂ (cod 4) dacă transcriptul arată citiri din sursele cu cazuri (memoria drax-*, planurile 2026-09-2x, scratchpad/sv, verif-etalon).
// Pe caz: unde (linie / mașină / flotă), mecanismul așteptat (oricare din listă), eventual verdictul și treapta. Cazurile `copiat` nu intră în scor.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const J = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const E = JSON.parse(readFileSync(arg('--etalon', `${homedir()}/.claude/projects/-Users-ionpop-Desktop-TRANSLUX/verif-etalon/etalon-cunoscut-drax.json`), 'utf8'));
const tr = arg('--transcript', null);
if (tr) { const t = readFileSync(tr, 'utf8'); const INTERZIS = [/memory\/drax-/, /docs\/plans\/2026-09-2/, /scratchpad\/sv\//, /verif-etalon/];
  const g = INTERZIS.filter(r => r.test(t)); if (g.length) { console.log(`PROBĂ ANULATĂ: transcriptul atinge ${g.map(String).join(', ')}`); process.exit(4); } }
const mec = x => (x.mecanisme || []).map(String);
let corect = 0, total = 0, tdC = 0, td = 0; const rez = [];
for (const c of E.cazuri) { const a = c.judecata; if (!a) continue;
  const lista = a.unde === 'linie' ? (J.linii || []).filter(x => x.ruta === a.ruta && x.linie === a.linie) : a.unde === 'masina' ? (J.masini || []).filter(x => x.masina === a.masina) : (J.flota || []);
  const potriv = lista.filter(x => a.mecanism.some(m => mec(x).includes(m) || x.clasa === m));
  const bun = potriv.find(x => (!a.verdict || x.verdict === a.verdict) && (!a.treapta || x.treapta === a.treapta));
  const stare = bun ? 'CORECT' : potriv.length ? 'CLASĂ GREȘITĂ' : lista.length ? 'MECANISM RATAT' : 'RATAT';
  if (c.tip === 'calculat') { total++; if (bun) corect++; if (c.tinut_deoparte) { td++; if (bun) tdC++; } }
  rez.push(`${stare.padEnd(15)} ${c.id.padEnd(4)} ${c.tip}${c.tinut_deoparte ? ' · ținut deoparte' : ''} — ${c.descriere}${!bun && lista[0] ? ` (aștept ${JSON.stringify(a)}, găsit ${JSON.stringify({ verdict: lista[0].verdict, mecanisme: mec(lista[0]), treapta: lista[0].treapta })})` : ''}`); }
console.log(rez.join('\n'));
console.log(`\nscor judecată (doar «calculat»): ${corect}/${total} · ținute deoparte ${tdC}/${td} · copiate (nenotate) ${E.cazuri.filter(e => e.tip === 'copiat').length}`);
