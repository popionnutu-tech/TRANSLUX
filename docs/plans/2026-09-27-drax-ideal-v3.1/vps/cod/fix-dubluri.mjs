// Un autobuz cu DOUĂ dispozitive care transmit în paralel apare ca două mașini (la ION-45: «0357544371228442» avea
// aceleași zile, km și ore ca 880RNK pe R12). Două plăci cu ≥80 % din curse care coincid (aceeași zi, |Δt0| ≤ 3 min,
// |Δkm| ≤ 1) se unesc sub placa reală (plăcuță, nu IMEI; la două plăcuțe, cea cu mai multe curse); cursele dublate se scot.
import { writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };   // F3 v5 (R3-1): fără rescriere pe loc
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const OUT = '../../date/ideal-v3.1/curse-ideal.json';
const V = JSON.parse(readFileSync(OUT, 'utf8'));
const ePlaca = p => /^\d{3}[A-Z]{2,4}$/.test(p) || /^[A-Z]{1,3}\d{3,4}$/.test(p);
import { ziLocala } from './timp.mjs';
const zi = t => ziLocala(t);   // data locală (v3: Intl; v2: UTC + 3 fix)
const byM = new Map(); for (const c of V.curse) { if (!byM.has(c.m)) byM.set(c.m, []); byM.get(c.m).push(c); }
const M = [...byM.keys()];
const coincid = (A, B) => { let n = 0; const ix = new Map();
  for (const c of B) { const k = zi(c.t0); if (!ix.has(k)) ix.set(k, []); ix.get(k).push(c); }
  for (const a of A) { const l = ix.get(zi(a.t0)) || []; if (l.some(b => Math.abs(new Date(a.t0) - new Date(b.t0)) <= 180000 && Math.abs(a.km - b.km) <= 1)) n++; }
  return n; };
const unite = [];
for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) {
  const A = byM.get(M[i]), B = byM.get(M[j]); const n = coincid(A, B), mn = Math.min(A.length, B.length);
  if (mn >= 5 && n / mn >= 0.8) unite.push({ a: M[i], b: M[j], n, na: A.length, nb: B.length });
}
for (const u of unite) {
  const [ra, rb] = [ePlaca(u.a), ePlaca(u.b)];
  const real = ra && !rb ? u.a : rb && !ra ? u.b : (u.na >= u.nb ? u.a : u.b), dubl = real === u.a ? u.b : u.a;
  const R = byM.get(real), D = byM.get(dubl); const ix = new Map();
  for (const c of R) { const k = zi(c.t0); if (!ix.has(k)) ix.set(k, []); ix.get(k).push(c); }
  let scoase = 0, mutate = 0;
  for (const c of D) { const l = ix.get(zi(c.t0)) || [];
    if (l.some(b => Math.abs(new Date(c.t0) - new Date(b.t0)) <= 180000 && Math.abs(c.km - b.km) <= 1)) { c._sterge = true; scoase++; } else { c.m = real; mutate++; } }
  if (V.zilePoarta[dubl]) { const z = V.zilePoarta[dubl]; delete V.zilePoarta[dubl]; if (V.zilePoarta[real]) V.zilePoarta[real].zile = Math.max(V.zilePoarta[real].zile, z.zile); else V.zilePoarta[real] = z; }
  console.log(`DUBLURĂ: ${dubl} = ${real} (${u.n} curse coincid din ${Math.min(u.na, u.nb)}) · scoase ${scoase} · mutate ${mutate}`);
}
V.curse = V.curse.filter(c => !c._sterge);
const DUBL = existsSync("../../date/ideal-v3.1/dubluri-ideal.json") ? JSON.parse(readFileSync("../../date/ideal-v3.1/dubluri-ideal.json", "utf8")) : {};
for (const u of unite) { const [ra, rb] = [ePlaca(u.a), ePlaca(u.b)]; const real = ra && !rb ? u.a : rb && !ra ? u.b : (u.na >= u.nb ? u.a : u.b), dubl = real === u.a ? u.b : u.a; (DUBL[real] ??= []).includes(dubl) || DUBL[real].push(dubl); }
scrieAtomic("../../date/ideal-v3.1/dubluri-ideal.json", JSON.stringify(DUBL));
scrieAtomic(OUT, JSON.stringify(V));
const imei = [...new Set(V.curse.map(c => c.m))].filter(m => !ePlaca(m.split('#')[0]));
console.log(`dubluri unite: ${unite.length} · mașini rămase: ${new Set(V.curse.map(c => c.m)).size} · plăci care nu-s plăcuțe: ${imei.join(', ') || '—'}`);
