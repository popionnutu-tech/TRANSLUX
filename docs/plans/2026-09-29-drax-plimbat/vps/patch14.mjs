import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('ancoră: ' + a.slice(0, 70)); s = s.replace(a, b); };
rep("  if (Q.every(inZonaProd) && tot <= 11) { for (let k = 1; k < Q.length; k++) obIU[k] = 1; return { obIU, obP }; }\n", "");
rep("    if (ok) for (let k = ia + 1; k <= ib; k++) obIU[k] = 1; }",
`    if (ok) { perechi++; for (let k = ia + 1; k <= ib; k++) obIU[k] = 1; } }
  // categorii.mjs:431–436: întâi trebuie un drum poartă → poartă; abia atunci mișcarea toată în zonă și ≤ 11 km e toată cursă între uzine
  if (perechi && Q.every(inZonaProd) && tot <= 11) for (let k = 1; k < Q.length; k++) obIU[k] = 1;`);
rep("  const viz = [];\n  for (let k = 0; k < Q.length; k++) { const g = poarta(Q[k], 0.3)", "  const viz = []; let perechi = 0;\n  for (let k = 0; k < Q.length; k++) { const g = poarta(Q[k], 0.3)");
rep("  const ob = new Uint8Array(Q.length);   // ob[k] = 1 → muchia (k−1, k) e obligatorie\n", "");
fs.writeFileSync(F, s); console.log('ok');
