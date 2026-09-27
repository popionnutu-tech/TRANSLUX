// Unește dispozitivele duble pe aceeași plăcuță («X#id» → «X»; la ION-45: 350KAJ#2284 → 350KAJ) în curse-ideal.json.
import { writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };   // F3 v5 (R3-1): fără rescriere pe loc
import { readFileSync, writeFileSync } from 'node:fs';
const OUT = '../../date/ideal-v3.1/curse-ideal.json';
const V = JSON.parse(readFileSync(OUT, 'utf8'));
const cu = [...new Set(V.curse.map(c => c.m).filter(m => m.includes('#')))];
for (const m of cu) { const b = m.split('#')[0]; let n = 0;
  for (const c of V.curse) if (c.m === m) { c.m = b; n++; }
  if (V.zilePoarta[m]) { const z = V.zilePoarta[m]; delete V.zilePoarta[m]; if (!V.zilePoarta[b]) V.zilePoarta[b] = z; else V.zilePoarta[b].zile = Math.max(V.zilePoarta[b].zile, z.zile); }
  console.log(`${m} → ${b}: ${n} curse`); }
scrieAtomic(OUT, JSON.stringify(V));
console.log(`plăci cu #: ${cu.length} unite · rămase cu #: ${new Set(V.curse.map(c => c.m).filter(m => m.includes('#'))).size}`);
