import { readFileSync } from 'node:fs';
const [fa, fb] = process.argv.slice(2); const A = JSON.parse(readFileSync(fa, 'utf8')), B = JSON.parse(readFileSync(fb, 'utf8'));
for (const b of B.masini) { const a = A.masini.find((x) => x.m === b.m); const ea = a?.economieSapt ?? 0, eb = b.economieSapt ?? 0;
  console.log(`${b.m.padEnd(8)} r2 ${String(ea).padStart(6)} → r3 ${String(eb).padStart(6)}  ${(b.locuri ?? []).map((l) => l.n).join(' + ') || b.motivFara}`);
  const ka = new Map((a?.legi ?? []).map((l) => [`${l.z} ${l.ora}`, l]));
  for (const l of b.legi ?? []) { const o = ka.get(`${l.z} ${l.ora}`); if (!o) console.log(`    nou  ${l.z} ${l.ora} real ${l.real} → ${l.km} (loc ${l.loc})`); else if (Math.abs((o.real - o.km) - (l.real - l.km)) > 2) console.log(`    dif  ${l.z} ${l.ora} ec ${r(o.real - o.km)} → ${r(l.real - l.km)} (loc ${l.loc})`); ka.delete(`${l.z} ${l.ora}`); }
  for (const [k, o] of ka) console.log(`    scos ${k} real ${o.real} ec ${r(o.real - o.km)}`); }
function r(x) { return Math.round(x * 10) / 10; }
