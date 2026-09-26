// REGRESIA SCRIPTULUI (nu proba oarbă): constatările din controale.json față de câmpul `constatare` al fișierului-etalon. O rulează SESIUNEA (nu agentul), local, pe controale.json adus de pe VPS.
//   node noteaza.mjs <controale.json> [~/.claude/projects/-Users-ionpop-Desktop-TRANSLUX/verif-etalon/etalon-cunoscut-drax.json]
// Notează CLASA (nivel + treaptă), nu doar prezența; cazurile `tip: copiat` (câmpuri ale lanțului) se arată, dar nu intră în scor.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const C = JSON.parse(readFileSync(process.argv[2], 'utf8')).controale;
const E = JSON.parse(readFileSync(process.argv[3] || `${homedir()}/.claude/projects/-Users-ionpop-Desktop-TRANSLUX/verif-etalon/etalon-cunoscut-drax.json`, 'utf8'));
const txt = c => [c.control, c.ruta, c.linie, c.masina, c.treapta, c.cifra, c.motiv].filter(Boolean).join(' ');
let corect = 0, total = 0, tdCorect = 0, td = 0; const rez = [];
for (const e of E.cazuri) {
  const hit = C.filter(c => e.control.some(k => c.control.startsWith(k)) && (!e.ruta || c.ruta === e.ruta) && (!e.linie || c.linie === e.linie)
    && (!e.masina || c.masina === e.masina) && (!e.cauta || new RegExp(e.cauta, 'i').test(txt(c))));
  const bun = hit.find(c => (!e.astept?.nivel || c.nivel === e.astept.nivel) && (!e.astept?.treapta || c.treapta === e.astept.treapta));
  const stare = bun ? 'CORECT' : hit.length ? 'CLASĂ GREȘITĂ' : 'RATAT';
  if (e.tip === 'calculat') { total++; if (bun) corect++; if (e.tinut_deoparte) { td++; if (bun) tdCorect++; } }
  rez.push(`${stare.padEnd(13)} ${e.id.padEnd(4)} ${e.tip}${e.tinut_deoparte ? ' · ținut deoparte' : ''} — ${(bun || hit[0]) ? txt(bun || hit[0]).slice(0, 150) : e.descriere}${!bun && hit.length ? ` (aștept ${JSON.stringify(e.astept)}, găsit ${hit[0].nivel}${hit[0].treapta ? '/' + hit[0].treapta : ''})` : ''}`);
}
console.log(rez.join('\n'));
console.log(`\nscor (doar «calculat»): ${corect}/${total} clasificate corect · ținute deoparte ${tdCorect}/${td} · copiate (nenotate) ${E.cazuri.filter(e => e.tip === 'copiat').length}`);
