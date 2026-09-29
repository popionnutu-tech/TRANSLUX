import fs from 'fs'; const [,, f, fel] = process.argv; const PK = JSON.parse(fs.readFileSync(f, 'utf8'));
const x = PK.masini.find((m) => m.locuri.length && m.legi.some((l) => l.parte === 'noapte' && !l.separat)); const l = x.legi.find((q) => q.parte === 'noapte' && !q.separat);
if (fel === 'lipsa') delete l.ancore; else l.ancore = false;
fs.writeFileSync(f, JSON.stringify(PK)); console.log(`noapte ${fel === 'lipsa' ? 'fără câmpul ancore' : 'cu ancore:false'} la`, x.m, l.z);
