// completări: coliziunile cheii m|t0 (alege v2), zilele Limbenii Noi vs bucla 727CWN, 457BRAX pe linii în sept, 518MHD și R16 Florești în sept
import { readFileSync } from 'node:fs';
const DIR = process.argv[2]; const O = JSON.parse(readFileSync(`${DIR}/obs-ideal.json`, 'utf8')), S = JSON.parse(readFileSync(`${DIR}/schelet-ideal.json`, 'utf8')), SC = JSON.parse(readFileSync(`${DIR}/schelet-cand.json`, 'utf8'));
const k2 = new Map(); for (const c of O.curse) if (c.schimb) { const k = `${c.m}|${c.t0}`; k2.set(k, (k2.get(k) || 0) + 1); }
const col = [...k2].filter(([, n]) => n > 1); const rtK = new Set(col.map(([k]) => k));
let candAtinse = 0; for (const c of Object.values(SC.cand)) for (const s of ['tur', 'retur']) if (rtK.has(`${c.m}|${c[s].t0}`)) candAtinse++;
console.log(`coliziuni m|t0 (observații cu schimb): ${col.length} chei (${col.reduce((s, [, n]) => s + n, 0)} observații) · picioare de candidate desenate atinse: ${candAtinse}`);
const zile = f => [...new Set(O.curse.filter(f).map(c => c.zi))].sort();
const sep = c => c.schimb && c.zi >= '2026-09-01';
console.log('Limbenii Noi (R11) sept, pe mașină:', JSON.stringify(Object.fromEntries(['457BRAX', '351KAJ'].map(m => [m, zile(c => sep(c) && c.ruta === 'R11' && c.linie === 'Limbenii Noi' && c.m === m).map(z => z.slice(5)).join(' ')]))));
console.log('bucla 727CWN pe Sturzovca (tur VEST / retur EST, grupa EZ) sept:', zile(c => sep(c) && c.m === '727CWN' && c.ruta === 'R27' && c.plin > 40).map(z => z.slice(5)).join(' '));
const pe = m => { const o = {}; for (const c of O.curse.filter(c => sep(c) && c.m === m)) { const k = `${c.ruta}|${c.linie}`; (o[k] ??= new Set()).add(c.zi.slice(5)); } return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v].sort().join(' ')])); };
for (const m of ['457BRAX', '345KAJ', '186OMM', '518MHD', '146BRAZ', '144BRAZ', '727CWN', '348KAJ', '917FTI', '224BZP']) console.log(`${m} sept: ${JSON.stringify(pe(m))}`);
console.log('R16 Floresti / Varvareuca sept, mașini:', JSON.stringify(['Floresti', 'Varvareuca'].map(l => [l, [...new Set(O.curse.filter(c => sep(c) && c.ruta === 'R16' && c.linie === l).map(c => c.m))]])));
for (const k of ['R16|Floresti', 'R16|Varvareuca', 'R11|Limbenii Noi', 'R11|Funduri Vechi', 'R3|Nihoreni']) { const l = S.find(x => `${x.ruta}|${x.linie}` === k); console.log(`${k}: card ${l.km} ture ${l.tureZi} kmZi ${l.kmZi} sursa ${l.sursa} act ${JSON.stringify(l.autobuze)}`); }
