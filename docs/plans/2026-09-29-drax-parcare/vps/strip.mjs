import fs from 'fs'; const [,, src, dst, cine] = process.argv; const Z = JSON.parse(fs.readFileSync(src, 'utf8'));
for (const r of Z.randuri) if (cine === 'toate' || r.m === cine) delete r.ancore; fs.writeFileSync(dst, JSON.stringify(Z)); console.log('fără ancore:', cine);
