import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('ancoră: ' + a.slice(0, 70)); s = s.replace(a, b); };
rep("const CAL = devCtrl.length >= 20 ? Math.min(0, [...devCtrl].sort((a, b) => a - b)[Math.floor((devCtrl.length - 1) / 2)]) : 0;",
`const medCal = (a) => (a.length >= 20 ? Math.min(0, [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)]) : null);
const CAL = medCal(devCtrl) ?? 0;
// C3 Codex r2: validarea pe jumătăți a arătat abaterea pe sursa legăturii (GPS ≈ 0, Valhalla × 1,05 ≈ −3,7) → CAL pe sursă, cu ≥ 20 goluri; altfel global
const sursaLeg = (L) => { const t = L.src.split('+').filter((x) => x !== '0'); return t.length && t.every((x) => x === t[0]) ? t[0] : 'mixt'; };
const CAL_SRC = Object.fromEntries(['gps', 'valhalla'].map((k) => [k, medCal(plStat.control.filter((c) => c.src === k).map((c) => c.dev)) ?? CAL]));
const calPentru = (L) => CAL_SRC[sursaLeg(L)] ?? CAL;`);
rep("plStat.control.push({ m: x.d.m, z: x.d.z, dev: surplusMijloc(v, L, pl), src: L.src }); }",
    "plStat.control.push({ m: x.d.m, z: x.d.z, dev: surplusMijloc(v, L, pl), src: sursaLeg(L) }); }");
rep("Math.max(0, surplusMijloc(v, L, pl) - CAL)", "Math.max(0, surplusMijloc(v, L, pl) - calPentru(L))");
rep("    return { CAL: r1(CAL), goluriControl: devCtrl.length,", "    return { CAL: r1(CAL), CAL_SRC: Object.fromEntries(Object.entries(CAL_SRC).map(([k, v]) => [k, r1(v)])), goluriControl: devCtrl.length,");
rep("const x = plStat.control.filter((c) => c.src.split('+').every((t) => t === k));", "const x = plStat.control.filter((c) => c.src === k);");
fs.writeFileSync(F, s); console.log('ok');
