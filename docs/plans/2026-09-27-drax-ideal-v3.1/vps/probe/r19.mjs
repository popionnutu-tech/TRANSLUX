// ION-99 (dezbaterea 27.09 pct. 2, riscul Codex etalon.mjs:161): ture/zi pe R19 Copăceni din PERECHI COMPLETE (tur + retur, același schimb,
// aceeași mașină, aceeași zi), în septembrie, față de numărătoarea lanțului (mașina calificată cu ≥ 3 perechi; ziua numără și sensurile singure)
import { readFileSync } from 'node:fs';
const DIR = '/root/lde-worker/drax/date/ideal-v3.1';
const O = JSON.parse(readFileSync(`${DIR}/obs-ideal.json`, 'utf8')), E = JSON.parse(readFileSync(`${DIR}/etalon-ideal.json`, 'utf8'));
const [RUTA, LIN] = (process.argv[2] || 'R19|Copaceni').split('|');
const ob = O.curse.filter(c => c.ruta === RUTA && c.linie === LIN && c.schimb && c.zi >= '2026-09-01');
const per = new Map(); for (const c of ob) { const q = `${c.zi}|${c.schimb}|${c.m}`; const p = per.get(q) || {}; p[c.sens] = c; per.set(q, p); }
const zile = new Map(); for (const [q, p] of per) { const [z, s, m] = q.split('|'); const x = zile.get(z) || { comp: [], sing: [] }; (p.tur && p.retur ? x.comp : x.sing).push(`${s} ${m}${p.tur ? '' : ' (doar retur)'}${p.retur ? '' : ' (doar tur)'}`); zile.set(z, x); }
const med = a => { const q = [...a].sort((x, y) => x - y), n = q.length; return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : null; };
for (const [z, x] of [...zile].sort()) console.log(`${z}: complete ${x.comp.length} [${x.comp.join(', ')}]${x.sing.length ? ' · un sens: ' + x.sing.join(', ') : ''}`);
const e = E.find(x => x.ruta === RUTA && x.linie === LIN);
console.log(`\nmediana perechilor COMPLETE pe zi (zile cu ≥ 1 pereche completă): ${med([...zile.values()].filter(x => x.comp.length).map(x => x.comp.length))} · pe toate zilele cu observații (zi fără pereche = 0): ${med([...zile.values()].map(x => x.comp.length))} · lanțul (etalon-ideal tureZi): sept ${e.tureZi.sept} / toate ${e.tureZi.toate}`);
