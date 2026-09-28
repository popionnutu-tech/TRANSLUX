// ION-124 r1 · s9: ziua ideală + cele 3 reguli (patru-reguli.json) + analiza pe mașinile atinse (doar citire).
// node /tmp/ion124-s9.mjs 830MUM,186OMM,725CWN,518MHD
import fs from 'fs';
const D = '/root/lde-worker/drax/date/saptamanal/2026-09-14/';
const M = process.argv[2].split(',');
const Z = JSON.parse(fs.readFileSync(D + 'ziua-ideala.json', 'utf8'));
const sh = (o) => JSON.stringify(o, (k, v) => (k === 'seg' || k === 'drum' || k === 'pts' ? undefined : v));
console.log('ZI keys', Object.keys(Z).join(','));
const lista = Z.masini ?? Z.lista ?? [];
for (const m of M) {
  const x = lista.find((q) => q.m === m); console.log('ZI', m, sh(x).slice(0, 2500));
}
const R4 = JSON.parse(fs.readFileSync(D + 'patru-reguli.json', 'utf8'));
console.log('R4 keys', Object.keys(R4).join(','));
const l4 = R4.masini ?? R4.lista ?? [];
for (const m of M) { const x = Array.isArray(l4) ? l4.find((q) => q.m === m) : l4[m]; console.log('R4', m, sh(x).slice(0, 1500)); }
const A = JSON.parse(fs.readFileSync(D + 'analiza.json', 'utf8'));
for (const m of M) { const x = A.masini.find((q) => q.m === m); console.log('AN', m, sh({ km: x?.km, economie: x?.economie, zile: x?.zile, rute: x?.rute, casa: x?.casa })); }
