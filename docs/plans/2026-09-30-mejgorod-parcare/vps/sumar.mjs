// ION-149 cercetare: sumarul golurilor din masoara.json (clase, km, unde stă acum) + regula lui Ion 25.09 (optim2) pe aceeași săptămână
import { readFileSync, existsSync } from 'node:fs';
const B = '/root/lde-worker/mejgorod-parcare/cercetare/date/';
const O = JSON.parse(readFileSync(B + 'masoara.json', 'utf8'));
const r1 = (v) => Math.round(v * 10) / 10;
const cls = {}; const add = (k, g) => { const c = (cls[k] ??= { n: 0, real: 0, direct: 0, propus: 0 }); c.n++; c.real += g.real; c.direct += g.direct ?? 0; c.propus += g.propus ?? 0; };
let goluriUrma = [], sta = { capat: 0, gara: 0, altundeva: 0 }, staAlt = {}, statCap = { A: 0, B: 0 };
const castigA = [], castigB = [], capA = [], capB = [], excursii = [];
for (const r of O) for (const g of r.goluri) if (!g.motiv && !g.noapte && g.departe > 5) excursii.push(`${r.m} ${g.de} → ${g.pana.slice(6)} real ${g.real} departe ${g.departe} km (${g.E.n})`);
for (const r of O) for (const g of r.goluri) {
  add(`${g.noapte ? 'noapte' : 'zi'} · ${g.motiv ?? 'intră'}`, g);
  if (g.motiv) continue;
  if (g.direct != null && g.real < 0.8 * g.direct && g.direct > 5) goluriUrma.push(`${r.m} ${g.de} real ${g.real} direct ${g.direct}`);
  if (g.noapte) {
    const laCap = g.Ecapat != null && g.Ecapat <= 3; statCap[laCap ? 'A' : 'B']++;
    (laCap ? castigA : castigB).push(Math.max(0, g.real - g.propus));
    if (g.prinCapat != null) (laCap ? capA : capB).push(Math.max(0, g.real - g.prinCapat));
    add(`noapte intră · ${laCap ? 'A: returul a ajuns la capăt' : 'B: returul s-a oprit înainte de capăt'}`, g);
    const s = g.sta; if (!s) continue;
    const langaCap = (s.n.startsWith('gara') || s.n === g.capE || s.n === g.capS || s.n === g.E.n || s.n === g.S.n);
    if (s.n.startsWith('gara')) sta.gara++; else if (langaCap) sta.capat++; else { sta.altundeva++; staAlt[s.n] = (staAlt[s.n] || 0) + 1; }
  }
}
console.log('clasa                                                    n     real   direct   propus');
for (const [k, c] of Object.entries(cls).sort()) console.log(`${k.padEnd(55)} ${String(c.n).padStart(4)} ${r1(c.real).toString().padStart(8)} ${r1(c.direct).toString().padStart(8)} ${r1(c.propus).toString().padStart(8)}`);
const s = (a) => r1(a.reduce((x, y) => x + y, 0));
console.log(`\nnopți care intră: A (returul la capăt) ${statCap.A}, de tăiat ${s(castigA)} km · B (returul oprit înainte) ${statCap.B}, de tăiat ${s(castigB)} km`);
console.log(`varianta «doarme la capătul de nord al rutei» (fără alegere): A ${s(capA)} km · B ${s(capB)} km`);
console.log(`pauzele de zi cu ieșire > 5 km de E/S: ${excursii.length}`); for (const x of excursii) console.log('  ' + x);
console.log(`unde stă noaptea (cea mai lungă staționare): gară ${sta.gara} · capătul / E / S ${sta.capat} · altundeva ${sta.altundeva}`);
console.log('  altundeva:', Object.entries(staAlt).sort((a, b) => b[1] - a[1]).map(([n, k]) => `${n} ${k}`).join(', '));
console.log(`\ngoluri cu urma mai scurtă decât drumul direct (tracker tăcut în mers, real < 0,8 × direct): ${goluriUrma.length}`); for (const x of goluriUrma) console.log('  ' + x);
const f = (m) => O.filter((r) => m(r)).map((r) => `${r.m} (${r.motiv ?? r.motivP ?? (r.taiat ?? 0) + ' km'})`).join(', ');
console.log('\nmașini fără propunere:', f((r) => !r.P || !r.taiat));
if (existsSync(B + 'optim2-c.json')) {
  const P = JSON.parse(readFileSync(B + 'optim2-c.json', 'utf8'));
  let tot = 0, zile = 0, laCap = 0, cazB = 0; const pe = {};
  for (const x of P) for (const d of x.detalii) { if (d.z < '2026-09-21' || d.z > '2026-09-27') continue; zile++; tot += d.optim; if (d.laCapat) laCap++; if (d.cazB) cazB++; pe[d.m] = (pe[d.m] || 0) + d.optim; }
  console.log(`\nregula Ion 25.09 (optim2, schelet): zile ${zile}, seara la capăt ${laCap}, caz B ${cazB}, optimizabil ${r1(tot)} km/săpt.`);
  console.log('  pe mașină:', Object.entries(pe).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([m, v]) => `${m} ${r1(v)}`).join(', '));
}
