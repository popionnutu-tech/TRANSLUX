import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('ancoră: ' + a.slice(0, 70)); s = s.replace(a, b); };
rep(`// sunt muncă: intră în ideal, nu în economie. Pe loc = km din urma GPS în rază minus 1,3 × distanța în linie dreaptă până la ieșirea din rază;
// o vizită acasă întrerupe raza (casa rămâne ocol, 5.2). Plimbatul nu depășește restul golului după ocolul pe acasă.
const PLIMB_R = 5, PLIMB_F = 1.3;
function plimbat(m, t0, t1) {`,
`// sunt muncă: intră în ideal, nu în economie. Pe loc = km din urma GPS în rază minus drumul pe șosea (Valhalla) de la capăt până la ieșirea
// din rază (runda 1, revizorul Claude: 1,3 × dreapta era sub ocolul real al drumurilor de ieșire, mediana 1,44 — se număra drum ca plimbat).
// Faza care se oprește la casă contează 0: drumul spre casă și de la casă rămâne economie (ocolul, 5.2). Plimbatul ≤ restul golului după ocol.
const PLIMB_R = 5;
async function plimbat(m, t0, t1) {`);
rep(`  if (i >= j) return { km: Math.max(0, km(0, Q.length - 1) - PLIMB_F * hav(A, B)), a: 0, b: 0, tot: true };
  const a = Math.max(0, km(0, i) - PLIMB_F * hav(A, Q[i])), b = Math.max(0, km(j, Q.length - 1) - PLIMB_F * hav(Q[j], B));
  return { km: a + b, a, b, tot: false };`,
`  const drum = async (p, q) => (hav(p, q) < 0.3 ? hav(p, q) : ((await kmDrum(p, q)) ?? hav(p, q) * 1.44));
  if (i >= j) { const t = Math.max(0, km(0, Q.length - 1) - (await drum(A, B))); return { km: t, a: 0, b: 0, tot: true }; }
  const laCasaA = i + 1 < Q.length && acasa(Q[i + 1]), laCasaB = j - 1 >= 0 && acasa(Q[j - 1]);
  const a = laCasaA ? 0 : Math.max(0, km(0, i) - (await drum(A, Q[i]))), b = laCasaB ? 0 : Math.max(0, km(j, Q.length - 1) - (await drum(Q[j], B)));
  return { km: a + b, a, b, tot: false };`);
rep("pl = plimbat(d.m, v.t0, v.t1);", "pl = await plimbat(d.m, v.t0, v.t1);");
fs.writeFileSync(F, s); console.log('ok');
