// Regimul ideal al schimburilor pe fiecare linie (Ion, 25.09: «identifică ideal schimburile»). Din obs-ideal.json:
// pe fiecare săptămână ISO (luni–duminică), în câte zile linia a avut pereche tur+retur pe s1 și pe s2 →
// tipul săptămânii (s1 / s2 / ambele / lipsă) → regimul: «rotație săptămânală» (s1 și s2 alternează), «ambele schimburi
// zilnic», «doar s1» / «doar s2»; plus FAZA (în ce fază a alternanței săptămânale e s1) și orele mediane la poartă pe schimb.
// v3 (ION-97): faza = alternanță de la săptămâna-ancoră 21.09.2026 (timp.mjs), nu paritatea ISO (2026 are săptămâna 53). Cheile
// «impare»/«pare» devin «A»/«B» (A = ancora ± 2k săptămâni; pe 2026 A ≡ ISO impare). `iso` rămâne doar ca etichetă.
import { writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };   // F3 v5 (R3-1): fără rescriere pe loc
import { readFileSync, writeFileSync } from 'node:fs';
import { fazaSapt, luniSapt, ANCORA } from './timp.mjs';
const O = JSON.parse(readFileSync('../../date/ideal-v3/obs-ideal.json', 'utf8'));
const E = JSON.parse(readFileSync('../../date/ideal-v3/etalon-ideal.json', 'utf8'));
const OUT = '../../date/ideal-v3/schimburi-ideal.json';
const med = a => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : null; };
const modul = a => { const c = new Map(); for (const x of a) if (x) c.set(x, (c.get(x) || 0) + 1); return [...c].sort((p, q) => q[1] - p[1])[0]?.[0] || null; };
const isoSapt = z => { const d = new Date(z + 'T00:00:00Z'); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const y = d.getUTCFullYear(); const j4 = new Date(Date.UTC(y, 0, 4)); return { y, w: 1 + Math.round(((d - j4) / 86400000 - 3 + ((j4.getUTCDay() + 6) % 7)) / 7) }; };
const dz = z => `${z.slice(8, 10)}.${z.slice(5, 7)}`;
// perechi: (linie, zi, schimb, mașină) cu tur ȘI retur
const per = new Map();
for (const c of O.curse) { if (!c.schimb) continue; const k = `${c.ruta}|${c.linie}|${c.zi}|${c.schimb}|${c.m}`; if (!per.has(k)) per.set(k, {}); per.get(k)[c.sens] = c; }
const linii = new Map();
for (const [k, p] of per) { if (!p.tur || !p.retur) continue; const [ruta, linie, zi, s] = k.split('|'); const g = ruta + '|' + linie;
  if (!linii.has(g)) linii.set(g, { ruta, linie, zile: new Map(), ore: { s1: { tur: [], retur: [] }, s2: { tur: [], retur: [] } }, porti: { s1: [], s2: [] } });
  const L = linii.get(g); if (!L.zile.has(zi)) L.zile.set(zi, { s1: 0, s2: 0 }); L.zile.get(zi)[s]++;
  L.ore[s].tur.push(p.tur.ora); L.ore[s].retur.push(p.retur.ora); L.porti[s].push(p.tur.poarta, p.retur.poarta); }
const out = {}; const rap = [];
for (const e of E) { const L = linii.get(e.ruta + '|' + e.linie); if (!L) continue;
  const sapt = new Map();
  for (const [zi, v] of L.zile) { const lu = luniSapt(zi); if (!sapt.has(lu)) sapt.set(lu, { lu, s1: 0, s2: 0, ambele: 0, zile: 0 }); const w = sapt.get(lu); w.zile++; if (v.s1 && v.s2) w.ambele++; else if (v.s1) w.s1++; else w.s2++; }
  const S = [...sapt.values()].sort((a, b) => a.lu.localeCompare(b.lu)).map(w => ({ ...w, iso: isoSapt(w.lu).w, faza: fazaSapt(w.lu),
    tip: w.zile < 2 ? 'putin' : w.ambele >= Math.max(2, 0.5 * w.zile) ? 'ambele' : w.s1 >= 0.7 * w.zile ? 's1' : w.s2 >= 0.7 * w.zile ? 's2' : 'amestec' }));
  const n = t => S.filter(w => w.tip === t).length; const cnt = { s1: n('s1'), s2: n('s2'), ambele: n('ambele'), amestec: n('amestec'), putin: n('putin') };
  const full = S.filter(w => w.tip !== 'putin');
  let regim, faza = null;
  if (cnt.ambele >= 0.6 * full.length) regim = 'ambele';
  else if (cnt.s1 + cnt.s2 >= 0.6 * full.length && cnt.s1 && cnt.s2) {
    // rotație: s1 în faza A sau în faza B a alternanței de la ancoră? (v2: paritatea ISO; aceeași regulă de majoritate, B ≡ «pare»)
    const fS1 = S.filter(w => w.tip === 's1').map(w => w.faza), fS2 = S.filter(w => w.tip === 's2').map(w => w.faza);
    const pB = fS1.filter(x => x === 'B').length + fS2.filter(x => x === 'A').length, pA = fS1.filter(x => x === 'A').length + fS2.filter(x => x === 'B').length;
    const tot = pB + pA; faza = pB >= pA ? 'B' : 'A'; const consist = Math.max(pB, pA) / Math.max(1, tot);
    regim = consist >= 0.8 ? 'rotatie' : 'rotatie-neregulata';
  } else if (cnt.s1 && !cnt.s2) regim = 'doar s1'; else if (cnt.s2 && !cnt.s1) regim = 'doar s2'; else regim = 'neclar';
  const ore = {}; for (const s of ['s1', 's2']) if (L.ore[s].tur.length) ore[s] = { tur: +med(L.ore[s].tur).toFixed(2), retur: +med(L.ore[s].retur).toFixed(2), zile: L.ore[s].tur.length, poarta: modul(L.porti[s]) };
  const grupa = e.autobuze ? (e.autobuze.EZ && e.autobuze.D ? "EZ+D" : e.autobuze.EZ ? "EZ" : e.autobuze.D ? "D" : null) : null;
  const ideal = grupa === "EZ+D" ? { tip: "ambele" } : grupa === "D" ? { tip: "rotatie", A: "s1", B: "s2" } : grupa === "EZ" ? { tip: "rotatie", A: "s2", B: "s1" } : null;
  const gps = regim === "ambele" ? { tip: "ambele" } : regim === "rotatie" ? { tip: "rotatie", A: faza === "A" ? "s1" : "s2", B: faza === "A" ? "s2" : "s1" } : { tip: regim };
  const dupaAct = ideal && ideal.tip === gps.tip && (ideal.tip !== "rotatie" || ideal.A === gps.A);
  out[e.ruta + "|" + e.linie] = { regim, faza, ancora: ANCORA, grupa, ideal, gps, dupaAct, sapt: S, cnt, ore };
  rap.push(`${e.ruta.padEnd(4)} ${e.linie.padEnd(18)} ${regim.padEnd(18)} ${faza ? ('s1 în faza ' + faza).padEnd(18) : ''.padEnd(18)} săpt: ${S.map(w => `${w.iso}${w.faza}${w.tip === 's1' ? '₁' : w.tip === 's2' ? '₂' : w.tip === 'ambele' ? '⁼' : w.tip === 'amestec' ? '~' : '·'}`).join(' ')}`);
}
scrieAtomic(OUT, JSON.stringify(out));
console.log(`ancora ${ANCORA} (faza A)`);
console.log('rută linie              regim              faza               săptămâni ISO (₁ = s1, ₂ = s2, ⁼ = ambele, ~ amestec, · sub 2 zile)');
console.log(rap.join('\n'));
const R = Object.values(out); const c = t => R.filter(x => x.regim === t).length;
console.log(`\nlinii: ${R.length} · rotație ${c('rotatie')} (+ neregulată ${c('rotatie-neregulata')}) · ambele zilnic ${c('ambele')} · doar s1 ${c('doar s1')} · doar s2 ${c('doar s2')} · neclar ${c('neclar')}`);
console.log(`rotație cu s1 în faza B: ${R.filter(x => x.regim.startsWith('rotatie') && x.faza === 'B').length} · în faza A: ${R.filter(x => x.regim.startsWith('rotatie') && x.faza === 'A').length}`);
