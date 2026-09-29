import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('ancoră: ' + a.slice(0, 70)); s = s.replace(a, b); };
rep("const { kmDrum, hav, PORTI, PARC, salveazaCache, NULE } = C;", "const { kmDrum, hav, PORTI, PARC, salveazaCache, NULE, poarta } = C;");
// muchiile obligatorii exact ca producătorul (categorii.mjs:158–179 drumuriIntrePorti, :359–371 parcul), pe indicii urmei
rep("const ZONA_PROD_KM = 3;", `const ZONA_PROD_KM = 3;
// Codex r4 C2: km-ii obligatorii se delimitează pe MUCHIILE urmei, cu regulile producătorului, apoi se intersectează cu drumul din mijloc.
// Între uzine (§5.11): perechile poartă A → poartă B ≠ A, «la poartă» = staționare ≥ 1 min în raza porții + 0,3 km sau capătul mișcării,
// ≤ 40 min, toate punctele în zona de 3 km → muchiile ia..ib; mișcarea toată în zonă și ≤ 11 km → toate muchiile. Parcul: bucățile dintre
// capetele mișcării și staționările ≥ 5 min la parc, toate în zonă. Muchiile > 5 km (salturi) nu se numără, ca la producător.
function muchiiObligatorii(Q) {
  const ob = new Uint8Array(Q.length);   // ob[k] = 1 → muchia (k−1, k) e obligatorie
  const dd = (k) => hav(Q[k - 1], Q[k]);
  let tot = 0; for (let k = 1; k < Q.length; k++) if (dd(k) <= 5) tot += dd(k);
  if (Q.every(inZonaProd) && tot <= 11) { for (let k = 1; k < Q.length; k++) ob[k] = 1; return ob; }
  const viz = [];
  for (let k = 0; k < Q.length; k++) { const g = poarta(Q[k], 0.3), u = viz.at(-1);
    if (g && u && u.g === g && u.deschis) u.idx.push(k); else { if (u) u.deschis = false; if (g) viz.push({ g, idx: [k], deschis: true }); } }
  const statMs = (v) => { let ms = 0; for (let n = 1; n < v.idx.length; n++) { const p = Q[v.idx[n - 1]], q = Q[v.idx[n]], dt = q.t - p.t;
    if (dt > 0 && hav(p, q) / (dt / 3.6e6) < 8) ms += dt; } return ms; };
  const la = (v, n) => statMs(v) >= 60e3 || (n === 0 && v.idx[0] === 0) || (n === viz.length - 1 && v.idx.at(-1) === Q.length - 1);
  for (let n = 0; n + 1 < viz.length; n++) { const A = viz[n], B = viz[n + 1], ia = A.idx.at(-1), ib = B.idx[0];
    if (A.g === B.g || !la(A, n) || !la(B, n + 1) || Q[ib].t - Q[ia].t > 40 * 60e3) continue;
    let ok = true; for (let k = ia; k <= ib; k++) if (!inZonaProd(Q[k])) { ok = false; break; }
    if (ok) for (let k = ia + 1; k <= ib; k++) ob[k] = 1; }
  // parcul: staționări ≥ 5 min la ≤ raza parcului
  const tai = [0]; let k = 0;
  while (k < Q.length) { let e = k; while (e + 1 < Q.length && hav(Q[e + 1], PARC) <= PARC.r && hav(Q[k], PARC) <= PARC.r) e++;
    if (hav(Q[k], PARC) <= PARC.r && Q[e].t - Q[k].t >= 5 * 60e3) tai.push(k, e); k = e + 1; }
  tai.push(Q.length - 1);
  if (tai.length > 2) for (let n = 0; n + 1 < tai.length; n += 2) { const a = tai[n], b = tai[n + 1]; let ok = b > a;
    for (let q = a; q <= b && ok; q++) if (!inZonaProd(Q[q])) ok = false;
    if (ok) for (let q = a + 1; q <= b; q++) ob[q] = 1; }
  for (let q = 1; q < Q.length; q++) if (dd(q) > 5) ob[q] = 0;
  return ob;
}`);
rep("  let mU = 0; for (let k = i + 1; k <= j; k++) if (inZonaProd(Q[k - 1]) && inZonaProd(Q[k])) mU += hav(Q[k - 1], Q[k]);",
    "  const ob = muchiiObligatorii(Q); let mU = 0; for (let k = i + 1; k <= j; k++) if (ob[k]) mU += hav(Q[k - 1], Q[k]);   // obligatoriu ∩ mijloc");
fs.writeFileSync(F, s); console.log('ok');
