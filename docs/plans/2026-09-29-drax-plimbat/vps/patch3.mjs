import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('ancoră: ' + a.slice(0, 70)); s = s.replace(a, b); };
// funcția întoarce acum și km-ii drumului din mijloc (între ieșirea din raza A și intrarea în raza B) și drumul pe șosea al ieșirilor
rep(`  if (i >= j) { const t = Math.max(0, km(0, Q.length - 1) - (await drum(A, B))); return { km: t, a: 0, b: 0, tot: true }; }
  const laCasaA = i + 1 < Q.length && acasa(Q[i + 1]), laCasaB = j - 1 >= 0 && acasa(Q[j - 1]);
  const a = laCasaA ? 0 : Math.max(0, km(0, i) - (await drum(A, Q[i]))), b = laCasaB ? 0 : Math.max(0, km(j, Q.length - 1) - (await drum(Q[j], B)));
  return { km: a + b, a, b, tot: false };`,
`  if (i >= j) return { km: 0, a: 0, b: 0, tot: true, mijloc: 0, iesiri: 0 };
  const dA = await drum(A, Q[i]), dB = await drum(Q[j], B);
  const a = Math.max(0, km(0, i) - dA), b = Math.max(0, km(j, Q.length - 1) - dB);
  return { km: a + b, a, b, tot: false, mijloc: km(i, j), iesiri: dA + dB };`);
rep(`    if (!v.plin && !v.langa && v.neobl > 0) { pl = await plimbat(d.m, v.t0, v.t1); plimb = Math.min(Math.max(0, v.neobl - L.km - v.ocol), Math.max(0, pl.km - v.oblK)); }`,
`    // runda 2 (proba de control: legătura GPS conține deja manevrele obișnuite de la porți, deci plimbatul măsurat separat se număra de două ori):
    // economie rămâne ocolul pe acasă + km în plus pe DRUMUL din mijloc (între ieșirea din raza de plecare și intrarea în raza de sosire) față de
    // legătura fără ieșiri; restul (ce se face în cele două raze) e muncă. Golul întreg într-o rază → tot restul e muncă. Mașina care merge
    // cât idealul (rest ≈ 0) nu se schimbă.
    if (!v.plin && !v.langa && v.neobl > 0) {
      pl = await plimbat(d.m, v.t0, v.t1); const rest0 = v.neobl - L.km - v.ocol;
      if (rest0 > 0) { const pastrat = pl.tot ? 0 : Math.min(rest0, Math.max(0, pl.mijloc - Math.max(0, L.km - pl.iesiri) - v.ocol)); plimb = rest0 - pastrat; }
    }`);
fs.writeFileSync(F, s); console.log('ok');
