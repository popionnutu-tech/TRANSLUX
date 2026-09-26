// duble.mjs <flota> → tipărește plăcile (bază) cu ≥ 2 dispozitive, separate prin virgulă (forma --doar= a lui curse.mjs)
// duble.mjs <flota> <curse extrase> <ieșire> → scrie dispozitive-sursa.json { flota: [{id, placa}], curse: [{m, t0, km, dev}] }
import { readFileSync, writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const [fF, fC, fO] = process.argv.slice(2);
const F = JSON.parse(readFileSync(fF, 'utf8'));
const DUBL = { '0357544371228442': '880RNK' };   // fix-dubluri (dubluri-ideal.json): IMEI-ul e al doilea dispozitiv al lui 880RNK
const baza = (p) => { const b = String(p).split('#')[0]; return DUBL[b] ?? b; };
const n = new Map(); for (const d of F) n.set(baza(d.placa), [...(n.get(baza(d.placa)) ?? []), d]);
const duble = [...n].filter(([, xs]) => xs.length > 1).flatMap(([, xs]) => xs.map((d) => d.placa.split('#')[0]));
if (!fC) { console.log([...new Set(duble)].join(',')); process.exit(0); }
const C = JSON.parse(readFileSync(fC, 'utf8')).curse;
if (C.some((c) => c.dev == null)) { console.error('extracția are curse fără dev'); process.exit(1); }
const out = { rulat: new Date().toISOString(), sursa: 'tracker devices + track (curse.mjs ideal-v2, aceeași fereastră), doar citire',
  flota: F.map((d) => ({ id: d.id, placa: d.placa })), curse: C.map((c) => ({ m: c.m, t0: c.t0, km: c.km, dev: c.dev })) };
__wfs(fO + '.tmp', JSON.stringify(out)); __rn(fO + '.tmp', fO);
const pe = {}; for (const c of C) pe[`${c.m}#${c.dev}`] = (pe[`${c.m}#${c.dev}`] ?? 0) + 1;
console.log(`dispozitive-sursa.json: flota ${out.flota.length} · curse extrase ${C.length} ${JSON.stringify(pe)}`);
