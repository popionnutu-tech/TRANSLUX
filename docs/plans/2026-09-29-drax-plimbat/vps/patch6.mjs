import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('ancoră: ' + a.slice(0, 70)); s = s.replace(a, b); };
// C1 (Codex r2): urmă insuficientă → rezultat explicit, fără reclasificare, în afara calibrării, numărat
rep("  if (Q.length < 3) return { km: 0, a: 0, b: 0, tot: false };",
    "  if (Q.length < 3) return { km: 0, a: 0, b: 0, tot: false, insuf: true, mijloc: 0, iesiri: 0, mijlocUzina: 0 };   // C1 Codex r2");
// C2 (Codex r2): km-ii din zona uzinei (≤ raza porții + 1 km sau parcul) de pe drumul din mijloc se scad până la km-ii obligatorii ai intervalului
rep("  return { km: a + b, a, b, tot: false, mijloc: km(i, j), iesiri: dA + dB };",
`  let mU = 0; for (let k = i + 1; k <= j; k++) if (laUzina(Q[k - 1]) && laUzina(Q[k])) mU += hav(Q[k - 1], Q[k]);
  return { km: a + b, a, b, tot: false, mijloc: km(i, j), iesiri: dA + dB, mijlocUzina: mU };`);
rep("  if (i >= j) return { km: 0, a: 0, b: 0, tot: true, mijloc: 0, iesiri: 0 };", "  if (i >= j) return { km: 0, a: 0, b: 0, tot: true, mijloc: 0, iesiri: 0, mijlocUzina: 0 };");
// surplusul de pe drumul din mijloc, comun pentru calibrare și aplicare
rep("const PL = new Map(); const devCtrl = [];",
`// C2 Codex r2: surplusul din mijloc se compară pe partea neobligatorie — din mijloc se scad km-ii prin zona uzinei, până la km-ii obligatorii
const surplusMijloc = (v, L, pl) => pl.mijloc - Math.min(v.oblK, pl.mijlocUzina) - Math.max(0, L.km - pl.iesiri) - v.ocol;
const PL = new Map(); const devCtrl = []; const plStat = { insuficiente: 0, control: [] };`);
rep("  if (x.esant && Math.abs(rest0) <= 2 && !pl.tot) devCtrl.push(pl.mijloc - Math.max(0, L.km - pl.iesiri) - v.ocol);",
`  if (pl.insuf) { plStat.insuficiente++; continue; }
  if (x.esant && Math.abs(rest0) <= 2 && !pl.tot) { devCtrl.push(surplusMijloc(v, L, pl)); plStat.control.push({ m: x.d.m, z: x.d.z, dev: surplusMijloc(v, L, pl), src: L.src }); }`);
rep("      if (rest0 > 0) { const pastrat = pl.tot ? 0 : Math.min(rest0, Math.max(0, pl.mijloc - Math.max(0, L.km - pl.iesiri) - v.ocol - CAL)); plimb = rest0 - pastrat; }",
    "      if (rest0 > 0 && !pl.insuf) { const pastrat = pl.tot ? 0 : Math.min(rest0, Math.max(0, surplusMijloc(v, L, pl) - CAL)); plimb = rest0 - pastrat; }\n      if (!Number.isFinite(plimb)) throw new Error(`plimbat nefinit ${d.m} ${d.z} ${v.ora}`);");
// C3 Codex r2: validare pe jumătatea nefolosită — CAL din zilele pare, verificat pe cele impare (și invers), pe sursa legăturii
rep("  plimbatCalibrare: { CAL: r1(CAL), goluriControl: devCtrl.length },",
`  plimbatCalibrare: (() => {
    const med = (a) => { const q = [...a].sort((x, y) => x - y); return q.length ? r1(q[Math.floor((q.length - 1) / 2)]) : null; };
    const par = plStat.control.filter((c) => +c.z.slice(-2) % 2 === 0), imp = plStat.control.filter((c) => +c.z.slice(-2) % 2 === 1);
    return { CAL: r1(CAL), goluriControl: devCtrl.length, urmeInsuficiente: plStat.insuficiente,
      validare: { calPare: med(par.map((c) => c.dev)), calImpare: med(imp.map((c) => c.dev)), nPare: par.length, nImpare: imp.length,
        peSursa: Object.fromEntries(['gps', 'valhalla'].map((k) => { const x = plStat.control.filter((c) => c.src.split('+').every((t) => t === k)); return [k, { n: x.length, mediana: med(x.map((c) => c.dev)) }]; })) } };
  })(),`);
fs.writeFileSync(F, s); console.log('ok');
