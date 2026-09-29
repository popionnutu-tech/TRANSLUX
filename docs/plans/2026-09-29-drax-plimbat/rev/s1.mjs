import fs from 'fs';
const C = JSON.parse(fs.readFileSync('/tmp/p132-ideala.json','utf8'));
const W = '/root/lde-worker/drax/date/saptamanal/2026-09-14';
const A = JSON.parse(fs.readFileSync(W+'/ziua-ideala.json','utf8'));
console.log(Object.keys(C));
console.log(JSON.stringify(C.flota));
console.log(JSON.stringify(A.flota));
const r = C.randuri ?? C.zile ?? C.rows; console.log('rows', r.length, Object.keys(r[0]));
console.log(JSON.stringify(r[0].intervale[0]));
const L=[]; for (const x of r) for (const i of x.intervale) L.push({m:x.m,z:x.z,esant:x.esant,...i});
L.sort((a,b)=>b.plimbat-a.plimbat);
for (const i of L.slice(0,25)) console.log(i.m,i.z,i.esant?'E':'-',i.ora,'km',i.km,'neobl',i.neobl,'obl',i.obl,'ocol',i.ocol,'leg',i.leg,i.src,'pl',i.plimbat,'A',i.plimbatA,'B',i.plimbatB,'ec',i.economie,i.cats,i.intreUzine||'',i.parc);
// balance
let bad=0; for (const x of r){ const s=Object.values(x.cauze).reduce((a,b)=>a+b,0); const sep=Object.values(x.separat).reduce((a,b)=>a+b,0); if (Math.abs(x.gps-x.ideal-s-sep)>0.35){bad++; if(bad<5)console.log('bil',x.m,x.z,x.gps,x.ideal,s,sep);} }
console.log('bilant bad rows',bad, 'probe', JSON.stringify(Object.fromEntries(Object.entries(C.probe??{}).map(([k,v])=>[k,Array.isArray(v)?v.length:v]))));
