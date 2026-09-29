import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('ancoră: ' + a.slice(0, 70)); s = s.replace(a, b); };
// staționările păstrează marcajul (st = 1 la început, cu t1; st = 2 la sfârșit), ca parcul să se judece ca la producător
rep("      if (p.t == null && p.t0 != null) { pts.push({ lat: p.lat, lon: p.lon, t: p.t0, v: 0 }); if (p.t1 > p.t0) pts.push({ lat: p.lat, lon: p.lon, t: p.t1, v: 0 }); }",
    "      if (p.t == null && p.t0 != null) { pts.push({ lat: p.lat, lon: p.lon, t: p.t0, v: 0, st: 1, t1: p.t1 }); if (p.t1 > p.t0) pts.push({ lat: p.lat, lon: p.lon, t: p.t1, v: 0, st: 2 }); }");
// parcul exact ca producătorul (categorii.mjs:298, :360–368): doar dacă producătorul a dat «parc» intervalului (v.parc > 0 ⇒ linii diferite și
// staționare la parc), staționări efective ≥ 5 min la ≤ raza parcului și NU în raza unei porți; bucățile între capete și staționări, toate în zonă
rep("function muchiiObligatorii(Q) {", "function muchiiObligatorii(Q, cuParc) {\n  const obIU = new Uint8Array(Q.length), obP = new Uint8Array(Q.length);");
rep("  if (Q.every(inZonaProd) && tot <= 11) { for (let k = 1; k < Q.length; k++) ob[k] = 1; return ob; }",
    "  if (Q.every(inZonaProd) && tot <= 11) { for (let k = 1; k < Q.length; k++) obIU[k] = 1; return { obIU, obP }; }");
rep("    if (ok) for (let k = ia + 1; k <= ib; k++) ob[k] = 1; }", "    if (ok) for (let k = ia + 1; k <= ib; k++) obIU[k] = 1; }");
rep(`  // parcul: staționări ≥ 5 min la ≤ raza parcului
  const tai = [0]; let k = 0;
  while (k < Q.length) { let e = k; while (e + 1 < Q.length && hav(Q[e + 1], PARC) <= PARC.r && hav(Q[k], PARC) <= PARC.r) e++;
    if (hav(Q[k], PARC) <= PARC.r && Q[e].t - Q[k].t >= 5 * 60e3) tai.push(k, e); k = e + 1; }
  tai.push(Q.length - 1);
  if (tai.length > 2) for (let n = 0; n + 1 < tai.length; n += 2) { const a = tai[n], b = tai[n + 1]; let ok = b > a;
    for (let q = a; q <= b && ok; q++) if (!inZonaProd(Q[q])) ok = false;
    if (ok) for (let q = a + 1; q <= b; q++) ob[q] = 1; }
  for (let q = 1; q < Q.length; q++) if (dd(q) > 5) ob[q] = 0;
  return ob;`,
`  if (cuParc) {
    const parcSt = Q.filter((x) => x.st === 1 && hav(x, PARC) <= PARC.r && !poarta(x) && (x.t1 - x.t) >= 5 * 60e3);
    if (parcSt.length) { const tai = [Q[0].t, ...parcSt.flatMap((x) => [x.t, x.t1]), Q.at(-1).t];
      for (let n = 0; n + 1 < tai.length; n += 2) { const idx = []; for (let q = 0; q < Q.length; q++) if (Q[q].t >= tai[n] && Q[q].t <= tai[n + 1]) idx.push(q);
        if (idx.length < 2 || !idx.every((q) => inZonaProd(Q[q]))) continue;
        for (let r = 1; r < idx.length; r++) if (idx[r] === idx[r - 1] + 1) obP[idx[r]] = 1; } }
  }
  for (let q = 1; q < Q.length; q++) if (dd(q) > 5) { obIU[q] = 0; obP[q] = 0; }
  return { obIU, obP };`);
rep("async function plimbat(m, t0, t1) {", "async function plimbat(m, t0, t1, cuParc = false) {");
rep("  const ob = muchiiObligatorii(Q); let mU = 0; for (let k = i + 1; k <= j; k++) if (ob[k]) mU += hav(Q[k - 1], Q[k]);   // obligatoriu ∩ mijloc",
    "  const { obIU, obP } = muchiiObligatorii(Q, cuParc); let mIU = 0, mP = 0;\n  for (let k = i + 1; k <= j; k++) { if (obIU[k]) mIU += hav(Q[k - 1], Q[k]); else if (obP[k]) mP += hav(Q[k - 1], Q[k]); }   // obligatoriu ∩ mijloc, pe categorii");
rep("  return { km: a + b, a, b, tot: false, mijloc: km(i, j), iesiri: dA + dB, mijlocUzina: mU };",
    "  return { km: a + b, a, b, tot: false, mijloc: km(i, j), iesiri: dA + dB, mijlocUzina: mIU + mP, mijlocIU: mIU, mijlocParc: mP };");
rep("const surplusMijloc = (v, L, pl) => pl.mijloc - Math.min(v.oblK, pl.mijlocUzina) - Math.max(0, L.km - pl.iesiri) - v.ocol;",
    "// Codex r5: fiecare categorie obligatorie se scade până la km-ii ei de la producător (între uzine ≤ v.munca, parc ≤ v.parc)\nconst surplusMijloc = (v, L, pl) => pl.mijloc - Math.min(v.munca, pl.mijlocIU ?? 0) - Math.min(v.parc, pl.mijlocParc ?? 0) - Math.max(0, L.km - pl.iesiri) - v.ocol;");
// apelurile cu contextul parcului de la producător
s = s.split("await plimbat(x.d.m, v.t0, v.t1)").join("await plimbat(x.d.m, v.t0, v.t1, v.parc > 0)");
s = s.split("await plimbat(d.m, v.t0, v.t1)").join("await plimbat(d.m, v.t0, v.t1, v.parc > 0)");
fs.writeFileSync(F, s); console.log('ok');
