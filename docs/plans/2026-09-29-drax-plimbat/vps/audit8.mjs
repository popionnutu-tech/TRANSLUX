import fs from 'fs';
const B = JSON.parse(fs.readFileSync('/tmp/p132-ideala.json', 'utf8'));
const L = [['206BZP', '2026-09-15', '06:08'], ['710CWN', '2026-09-14', '06:09'], ['186OMM', '2026-09-15', null], ['446ASB', '2026-09-14', '17:05'], ['912RNK', '2026-09-18', '16:28'], ['146BRAZ', '2026-09-14', null], ['713IZX', '2026-09-17', null], ['715IZX', '2026-09-14', null]];
for (const [m, z, o] of L) { const r = B.randuri.find((x) => x.m === m && x.z === z); if (!r) { console.log(m, z, 'lipsă'); continue; }
  for (const v of r.intervale.filter((v) => v.neobl > 0 && (!o || v.ora.startsWith(o)))) { const rest0 = v.neobl - v.leg - v.ocol;
    console.log(`${m} ${z} ${v.ora} · gol ${v.neobl} · legătura ${v.leg} (${v.src}) · ocol ${v.ocol} · rest ${rest0.toFixed(1)} → muncă ${v.plimbat} · păstrat ${(Math.max(0, rest0) - v.plimbat).toFixed(1)} · faze ${v.plimbatA}+${v.plimbatB} · mijloc ${v.plimbatMijloc} ieșiri ${v.plimbatIesiri}`); } }
