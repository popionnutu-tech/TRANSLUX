import { readFileSync, writeFileSync } from 'node:fs';
const f = process.argv[2]; let s = readFileSync(f, 'utf8');
const a = s.indexOf('const scoase = [], altSens = [], zile = new Map();'), b = s.indexOf('V.curse = V.curse.filter');
if (a < 0 || b < 0) throw new Error('ancore');
const nou = `const scoase = [], altSens = [], zile = new Map();
// Execuție F3 (triaj r4, R3-3): DISPOZITIVUL se alege PE ZI, nu pe pereche. Plăcuța a pierdut id-ul dispozitivului la fix-350, dar
// dispozitivul care pierde puncte dă sistematic cursa mai scurtă ȘI mai săracă; deci pentru ziua (mașină, zi) se alege o latură
// (lungă / scurtă) după Σ bogăției pe fiecare latură (la egalitate: cea lungă) și se aplică tuturor perechilor zilei. Ziua e
// «incoerentă» dacă regula pe pereche (bogăția, apoi km) ar fi ales altfel la cel puțin o pereche — listată în raport.
for (const [k, L] of grupe) {
  L.sort((a, b) => new Date(a.t0) - new Date(b.t0));
  const perechi = [], folosit = new Set();
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j]; if (folosit.has(a) || folosit.has(b)) continue;
    if (Math.abs(new Date(a.t0) - new Date(b.t0)) > 180000) break;
    if (sens(a) !== sens(b)) { altSens.push({ m: a.m, zi: zi(a.t0), t0: [a.t0, b.t0], km: [a.km, b.km], sens: [sens(a), sens(b)] }); continue; }
    const lung = a.km >= b.km ? a : b, scurt = lung === a ? b : a;
    perechi.push({ lung, scurt }); folosit.add(a); folosit.add(b);
  }
  if (!perechi.length) continue;
  const sL = perechi.reduce((x, p) => x + bogatie(p.lung), 0), sS = perechi.reduce((x, p) => x + bogatie(p.scurt), 0);
  const latura = sS > sL ? 'scurtă' : 'lungă';
  for (const p of perechi) {
    const pastrat = latura === 'lungă' ? p.lung : p.scurt, scos = pastrat === p.lung ? p.scurt : p.lung;
    const pePereche = bogatie(p.lung) !== bogatie(p.scurt) ? (bogatie(p.lung) > bogatie(p.scurt) ? p.lung : p.scurt) : p.lung;
    scos._sterge = true;
    const z = zi(pastrat.t0);
    (zile.get(\`\${pastrat.m}|\${z}\`) ?? zile.set(\`\${pastrat.m}|\${z}\`, new Set()).get(\`\${pastrat.m}|\${z}\`)).add(pePereche === pastrat ? 'da' : 'nu');
    scoase.push({ m: pastrat.m, zi: z, t0: pastrat.t0, kmPastrat: pastrat.km, kmScos: scos.km, bogatie: [bogatie(pastrat), bogatie(scos)], latura, laturaZilei: { lunga: sL, scurta: sS } });
  }
}
`;
s = s.slice(0, a) + nou + s.slice(b);
s = s.replace("const incoerente = [...zile].filter(([, s]) => s.size > 1).map(([k]) => k);", "const incoerente = [...zile].filter(([, s]) => s.has('nu')).map(([k]) => k);");
if (!s.includes("s.has('nu')")) throw new Error('incoerente');
writeFileSync(f, s);
