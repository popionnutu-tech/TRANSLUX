// cercetare ION-147: economia pe feluri de gol (noapte / dimineață / după-amiază; din poartă), excluderile pe flotă
import { readFileSync } from 'node:fs';
const X = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const fel = (l) => { const h = +l.ora.slice(0, 2); const g = l.aN?.startsWith('poarta') ? ' din poartă' : ''; return (h >= 22 || h < 3 ? 'noaptea (după s2)' : h < 11 ? 'dimineața (după s3/s1)' : 'după-amiaza (după s1)') + g; };
const agg = new Map(); let nL = 0, n0 = 0;
for (const m of X.masini) { if (!m.locuri.length) continue; for (const l of m.legi) { const k = fel(l); const a = agg.get(k) ?? agg.set(k, { n: 0, real: 0, prop: 0, loc0: 0 }).get(k); a.n++; a.real += l.real; a.prop += l.km; if (l.loc === 0) a.loc0++; nL++; if (l.loc === 0) n0++; } }
for (const [k, a] of [...agg].sort()) console.log(`${k.padEnd(34)} ${String(a.n).padStart(4)} drumuri · real ${a.real.toFixed(1)} → ${a.prop.toFixed(1)} · tăiat ${(a.real - a.prop).toFixed(1)} · «rămâne cum e» ${a.loc0}`);
console.log(`drumuri ${nL}, din ele «rămâne cum e» ${n0}`);
const S = {}; for (const m of X.masini) for (const [k, v] of Object.entries(m.stat ?? {})) if (typeof v === 'number') S[k] = +((S[k] ?? 0) + v).toFixed(1);
console.log('excluderi pe flotă', JSON.stringify(S));
console.log('cu loc', X.masini.filter((m) => m.locuri.length).length, 'fără', X.masini.filter((m) => !m.locuri.length).length, 'peste 100 km/săpt', X.masini.filter((m) => m.economieSapt >= 100).map((m) => m.m).join(','));
const loc = new Map(); for (const m of X.masini) for (const l of m.locuri) loc.set(l.fel, (loc.get(l.fel) ?? 0) + 1); console.log('fel loc', JSON.stringify([...loc]));
