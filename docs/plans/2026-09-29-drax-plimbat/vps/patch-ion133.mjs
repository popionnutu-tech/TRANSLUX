import fs from 'fs';
const [,, SRC, DST, OUT] = process.argv;
let s = fs.readFileSync(SRC, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('ancoră: ' + a.slice(0, 70)); s = s.replace(a, b); };
rep("const RUNS = []; const obsStat", "const TRACK = new Map(), CASA_W = new Map();   // ION-132: urma săptămânii pe mașină (pentru plimbatul pe loc) și casa\nconst RUNS = []; const obsStat");
rep("    const cs = casa.get(m);\n", "    const cs = casa.get(m);\n    if (dos === W) { TRACK.set(m, Q); CASA_W.set(m, cs); }\n");
rep("const CAUZE = ['noapte', 'acasa', 'drumLung', 'drumMaiScurt'];",
`// ION-132 (Ion, 29.09.2026: «tot ce este plimbat prin Bălți și Florești în mare parte este lucrul»): km plimbați PE LOC la cele două
// capete ale golului dintre curse (în raza de 5 km de locul de unde pleacă și de locul unde ajunge — porți, autogară, capătul liniei)
// sunt muncă: intră în ideal, nu în economie. Pe loc = km din urma GPS în rază minus 1,3 × distanța în linie dreaptă până la ieșirea din rază;
// o vizită acasă întrerupe raza (casa rămâne ocol, 5.2). Plimbatul nu depășește restul golului după ocolul pe acasă.
const PLIMB_R = 5, PLIMB_F = 1.3;
function plimbat(m, t0, t1) {
  const Q = (TRACK.get(m) ?? []).filter((p) => p.t >= t0 && p.t <= t1);
  if (Q.length < 3) return { km: 0, a: 0, b: 0, tot: false };
  const cs = CASA_W.get(m), acasa = (p) => !!cs && hav(p, cs) <= CASA_R;
  const km = (i, j) => { let x = 0; for (let k = i + 1; k <= j; k++) x += hav(Q[k - 1], Q[k]); return x; };
  const A = Q[0], B = Q[Q.length - 1];
  let i = 0; while (i + 1 < Q.length && hav(Q[i + 1], A) <= PLIMB_R && !acasa(Q[i + 1])) i++;
  let j = Q.length - 1; while (j - 1 >= 0 && hav(Q[j - 1], B) <= PLIMB_R && !acasa(Q[j - 1])) j--;
  if (i >= j) return { km: Math.max(0, km(0, Q.length - 1) - PLIMB_F * hav(A, B)), a: 0, b: 0, tot: true };
  const a = Math.max(0, km(0, i) - PLIMB_F * hav(A, Q[i])), b = Math.max(0, km(j, Q.length - 1) - PLIMB_F * hav(Q[j], B));
  return { km: a + b, a, b, tot: false };
}
const CAUZE = ['noapte', 'acasa', 'drumLung', 'drumMaiScurt'];`);
rep("  let gps = 0, obl = 0, links = 0, noapteIdeal = 0, golElig = 0; const intervale = [], steaguri = [];",
    "  let gps = 0, obl = 0, links = 0, noapteIdeal = 0, golElig = 0, plimbatZi = 0; const intervale = [], steaguri = [];");
rep("    links += L.km; golElig += v.neobl;\n    const e = v.neobl - L.km, rest = e - v.ocol;",
`    // ION-132: plimbatul pe loc la capetele golului e muncă — intră în ideal (fără km-ii deja obligatorii ai intervalului: între uzine, parc)
    let plimb = 0, pl = null;
    if (!v.plin && !v.langa && v.neobl > 0) { pl = plimbat(d.m, v.t0, v.t1); plimb = Math.min(Math.max(0, v.neobl - L.km - v.ocol), Math.max(0, pl.km - v.oblK)); }
    plimbatZi += plimb;
    links += L.km + plimb; golElig += v.neobl;
    const e = v.neobl - L.km - plimb, rest = e - v.ocol;`);
rep("      leg: r1(L.km), src: L.src, legR1: null, economie: r1(e) });",
    "      leg: r1(L.km), src: L.src, legR1: null, plimbat: r1(plimb), plimbatA: pl ? r1(pl.a) : 0, plimbatB: pl ? r1(pl.b) : 0, economie: r1(e) });");
rep("    economieTotala: r1(econTot), economie: r1(econElig),", "    economieTotala: r1(econTot), economie: r1(econElig), plimbat: r1(plimbatZi), _plimbat: plimbatZi,");
rep("    sumaCauze: r1(sum(rows, (r) => sum(CAUZE, (k) => r._c[k]))),", "    sumaCauze: r1(sum(rows, (r) => sum(CAUZE, (k) => r._c[k]))), plimbat: r1(sum(rows, (r) => r._plimbat)),");
if (OUT) rep('const OUT = `${W}/ziua-ideala.json`;', `const OUT = '${OUT}';`);
fs.writeFileSync(DST, s); console.log('ok', DST);
