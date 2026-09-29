import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const a = "const sursaLeg = (L) => { const t = L.src.split('+').filter((x) => x !== '0'); return t.length && t.every((x) => x === t[0]) ? t[0] : 'mixt'; };\n";
const b = "const PL = new Map(); const devCtrl = [];";
if (s.split(a).length !== 2 || s.split(b).length !== 2) throw new Error('ancoră');
s = s.replace(a, '').replace(b, a + b);
fs.writeFileSync(F, s); console.log('ok');
