import { readFileSync } from 'node:fs';
const [F, ...M] = process.argv.slice(2);
const X = JSON.parse(readFileSync(F, 'utf8'));
for (const m of X.masini) { if (M.length && !M.includes(m.m)) continue;
  console.log(`\n== ${m.m} casa ${m.casa} · rute ${m.rute.join(' | ')} · eco ${m.economieSapt} · ${m.locuri.map(l => `P${l.nr} ${l.n}`).join(' + ') || m.motivFara}`);
  for (const l of m.legi ?? []) console.log(`  ${l.z} ${l.ora} ${String(l.ore).padStart(4)}h ${l.aN} → [acum ${l.acum?.n ?? '—'} ${l.acum?.min ?? ''}m] → ${l.bN} · real ${l.real} → loc ${l.loc} ${l.km} · după ${l.dupa} · înainte ${l.inainte}`);
}
