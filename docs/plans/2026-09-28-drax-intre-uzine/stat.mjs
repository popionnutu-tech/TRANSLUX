import fs from 'fs';
const a=JSON.parse(fs.readFileSync('/tmp/p119-sim/2026-09-14/analiza.json','utf8'));
const L=[]; for(const m of a.masini) for(const d of m.detalii) for(const b of d.bucati) if(b.cat==='intreUzine') L.push({m:m.m,z:d.z,ora:b.ora,km:b.km,p:b.porti,prev:b.prev,next:b.next});
const h={}; for(const x of L){const k=x.km<4?'<4':x.km<6?'4–6':x.km<8?'6–8':x.km<11?'8–11':'≥11'; h[k]=(h[k]||0)+1;}
console.log('drumuri',L.length,'km',L.reduce((s,x)=>s+x.km,0).toFixed(0),'histo',JSON.stringify(h));
const hop={}; for(const x of L){hop[x.p]=(hop[x.p]||0)+1;} console.log('porți', JSON.stringify(Object.entries(hop).sort((a,b)=>b[1]-a[1]).slice(0,6)));
const ctx={}; for(const x of L){const k=`${(x.prev||'—').split(' ')[1]??'—'}→${(x.next||'—').split(' ')[1]??'—'}`; ctx[k]=(ctx[k]||0)+1;} console.log('între', JSON.stringify(ctx));
for(const x of L.filter(x=>['925FTI','146BRAZ','713IZX'].includes(x.m)).slice(0,12)) console.log(x.m,x.z,x.ora,x.km,x.p,'|',x.prev,'→',x.next);
