import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('ancoră: ' + a.slice(0, 70)); s = s.replace(a, b); };
// 1) legătura intervalului într-o funcție, folosită și de pasul de calibrare
rep(`    let L = { km: 0, src: '0' }, calc = null;
    if (!v.plin && !v.langa) {
      if (v.iu) calc = sumLeg(await leg(v.de, v.iu.from), await leg(v.iu.to, v.pana));
      else if (v.parc > 0) { let best = null; for (const g of ZONE_PTS) { const s = sumLeg(await leg(v.de, g), await leg(g, v.pana)); if (!best || s.km < best.km) best = s; } calc = best; }
      else calc = await leg(v.de, v.pana);
      if (v.neobl > 0) L = calc; else if (calc.km > 0) cnt.ancoreNepotrivite++;
    }`,
`    const { L, calc } = await legInterval(v);
    if (!v.plin && !v.langa && !(v.neobl > 0) && calc && calc.km > 0) cnt.ancoreNepotrivite++;`);
rep("const ROWS = [];\nfor (const x of D) {",
`async function legInterval(v) {
  let L = { km: 0, src: '0' }, calc = null;
  if (!v.plin && !v.langa) {
    if (v.iu) calc = sumLeg(await leg(v.de, v.iu.from), await leg(v.iu.to, v.pana));
    else if (v.parc > 0) { let best = null; for (const g of ZONE_PTS) { const s = sumLeg(await leg(v.de, g), await leg(g, v.pana)); if (!best || s.km < best.km) best = s; } calc = best; }
    else calc = await leg(v.de, v.pana);
    if (v.neobl > 0) L = calc;
  }
  return { L, calc };
}
// ION-133 runda 2: calibrarea săptămânii — pe golurile de control (mașina a mers cât idealul, |rest| ≤ 2 km) drumul din mijloc iese mai scurt decât
// legătura fără ieșiri cu CAL km (legătura GPS conține deja manevrele obișnuite din raze); CAL se adaugă înapoi la drumul din mijloc.
const PL = new Map(); const devCtrl = [];
for (const x of D) for (const v of x.iv.filter((q) => q.tip === 'intre' && !q.plin && !q.langa && q.neobl > 0)) {
  const { L } = await legInterval(v); const pl = await plimbat(x.d.m, v.t0, v.t1); PL.set(\`\${x.d.m}|\${v.t0}\`, pl);
  const rest0 = v.neobl - L.km - v.ocol;
  if (x.esant && Math.abs(rest0) <= 2 && !pl.tot) devCtrl.push(pl.mijloc - Math.max(0, L.km - pl.iesiri) - v.ocol);
}
const CAL = devCtrl.length >= 20 ? Math.min(0, [...devCtrl].sort((a, b) => a - b)[Math.floor((devCtrl.length - 1) / 2)]) : 0;
const ROWS = [];
for (const x of D) {`);
rep(`      pl = await plimbat(d.m, v.t0, v.t1); const rest0 = v.neobl - L.km - v.ocol;
      if (rest0 > 0) { const pastrat = pl.tot ? 0 : Math.min(rest0, Math.max(0, pl.mijloc - Math.max(0, L.km - pl.iesiri) - v.ocol)); plimb = rest0 - pastrat; }`,
`      pl = PL.get(\`\${d.m}|\${v.t0}\`) ?? await plimbat(d.m, v.t0, v.t1); const rest0 = v.neobl - L.km - v.ocol;
      if (rest0 > 0) { const pastrat = pl.tot ? 0 : Math.min(rest0, Math.max(0, pl.mijloc - Math.max(0, L.km - pl.iesiri) - v.ocol - CAL)); plimb = rest0 - pastrat; }`);
rep("  observatii: {", "  plimbatCalibrare: { CAL: r1(CAL), goluriControl: devCtrl.length },\n  observatii: {");
fs.writeFileSync(F, s); console.log('ok');
