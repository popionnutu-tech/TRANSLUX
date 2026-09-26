// Pasul E.1 (F3 v5): lanțul ideal ION-71 → idealul v2, FĂRĂ să atingă idealul vechi (triaj r4, legătura cu ION-95).
//   node ideal-v2-transforma.mjs <drax/cod/ideal> <drax/cod/ideal-v2>
// Face o COPIE a codului în <dst> și, în copie:
//   (1) căile '../../date/X' → '../../date/ideal-v2/X', jurnalele '../../X-ideal.log' și pagina '../../schelet-ideal.html' → tot în
//       '../../date/ideal-v2/' (idealul vechi din drax/date/ rămâne neatins; instantaneele săptămânilor, în _ref/, nu depind de el);
//   (2) orice writeFileSync(f, x) → scrieAtomic(f, x) = scriere în f.tmp + rename (R3-1: niciun fișier nu se mai rescrie pe loc);
//   (3) lant.sh: cd în ideal-v2, «1c dubluri-placa» după «1b fix-dubluri»;
//   (4) etalon.mjs: steagul `pranz` pe cursele fără schimb cu ora 08–15 (definiția F2 categorii.mjs:185-187) și `curseDePranz` pe linie;
//       schimbul și ferestrele NU se schimbă.
// Nu rulează nimic; verificarea: `node --check` pe toate fișierele și `grep -c "writeFileSync("` = 1 (doar în helper) pe fiecare.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
const [SRC, DST] = process.argv.slice(2);
mkdirSync(DST, { recursive: true });
const HELPER = `import { writeFileSync as __wfs, renameSync as __rn } from 'node:fs';\nconst scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };   // F3 v5 (R3-1): fără rescriere pe loc\n`;
const rap = [];
for (const f of readdirSync(SRC)) {
  if (!/\.(mjs|sh)$/.test(f) || /^(diag|f1-masura)/.test(f)) continue;
  let s = readFileSync(`${SRC}/${f}`, 'utf8'); const n0 = s.length;
  s = s.replaceAll('../../date/', '../../date/ideal-v2/').replace(/\.\.\/\.\.\/([a-z-]+-ideal\.log)/g, '../../date/ideal-v2/$1')
    .replaceAll('../../schelet-ideal.html', '../../date/ideal-v2/schelet-ideal.html');
  if (f.endsWith('.mjs')) {
    const n = (s.match(/\bwriteFileSync\(/g) ?? []).length;
    if (n) { s = s.replace(/\bwriteFileSync\(/g, 'scrieAtomic('); const i = s.search(/^import /m); s = s.slice(0, i) + HELPER + s.slice(i); }
    rap.push(`${f}: ${n} scrieri → atomice`);
  }
  if (f === 'lant.sh') {
    // execuție F3: înlocuirea ne-globală lovea întâi COMENTARIUL (rândul 2) și lăsa `cd …/ideal` (idealul VECHI, scris pe loc) — acum
    // toate aparițiile, cu ancoră de sfârșit de cuvânt; verificarea de mai jos refuză orice `cd` rămas spre idealul vechi.
    s = s.replace(/\/root\/lde-worker\/drax\/cod\/ideal(?![-\w])/g, '/root/lde-worker/drax/cod/ideal-v2')
      .replace('echo "== 1b fix-dubluri"; node fix-dubluri.mjs', 'echo "== 1b fix-dubluri"; node fix-dubluri.mjs\necho "== 1c dubluri-placa"; node dubluri-placa.mjs');
    if (!s.includes('dubluri-placa')) throw new Error('lant.sh: rândul fix-dubluri nu s-a găsit');
    if (!/^cd \/root\/lde-worker\/drax\/cod\/ideal-v2$/m.test(s) || /\/drax\/cod\/ideal(?![-\w])/.test(s)) throw new Error('lant.sh: cd nu duce în ideal-v2');
  }
  if (f === 'etalon.mjs') {
    const a = "acop: +b.acop.toFixed(2), afara: !s, opr: c.opr };";
    if (!s.includes(a)) throw new Error('etalon.mjs: rec nu s-a găsit');
    s = s.replace(a, "acop: +b.acop.toFixed(2), afara: !s, opr: c.opr,\n      pranz: !s && h >= 8 && h < 15 };   // F3 v5: cursă de prânz (F2 categorii.mjs:185-187) — steag, fără schimb");
  }
  // gard: nicio cale relativă spre drax/date/ în afara ideal-v2 și nicio cale absolută spre drax/date sau drax/cod/ideal (vechi)
  const rest = s.replace(/\.\.\/\.\.\/date\/ideal-v2\//g, '');
  if (/\.\.\/\.\.\/(date\/|[a-z-]+\.(log|html|json))/.test(rest) || /\/root\/lde-worker\/drax\/(date|cod\/ideal(?![-\w]))/.test(s))
    throw new Error(`${f}: a rămas o cale spre idealul vechi`);
  writeFileSync(`${DST}/${f}`, s); rap.push(`${f}: ${n0} → ${s.length} car.`);
}
console.log(rap.join('\n'));
