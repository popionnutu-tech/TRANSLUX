import fs from 'fs'; const [,, f] = process.argv; const PK = JSON.parse(fs.readFileSync(f, 'utf8'));
const x = PK.masini.find((m) => m.locuri.length && m.legi.some((l) => l.parte === 'noapte' && !l.separat)); const l = x.legi.find((q) => q.parte === 'noapte' && !q.separat); l.ancore = false;
fs.writeFileSync(f, JSON.stringify(PK)); console.log('noapte fără ancore injectată la', x.m, l.z);
