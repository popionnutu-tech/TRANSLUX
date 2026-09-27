import fs from 'fs';
import { kmDrum, hav } from '/root/lde-worker/drax/cod/economie/comun.mjs';
const P='/root/lde-worker/drax/date/saptamanal/2026-09-14/';
const a=JSON.parse(fs.readFileSync(P+'analiza.json','utf8'));
const urme={}; const U=(m,z)=>{const k=m+z; if(!(k in urme)){try{urme[k]=JSON.parse(fs.readFileSync(`${P}economie-urme/${m}/${z}.json`,'utf8')).pts}catch{urme[k]=null}} return urme[k];};
const out=[]; let tv=0,tn=0;
for(const m of a.masini) for(const d of m.detalii){ if(!d.economie||d.exclus) continue;
  for(const b of d.bucati.filter(b=>b.cat==='livrare'&&b.ocol)){
    if(d.scosDeLamurit?.R1b) continue;
    let pts=[...(U(m.m,d.z)||[]), ...(U(m.m, new Date(Date.parse(d.z)+86400e3).toISOString().slice(0,10))||[])].filter(p=>p.t>=b.t0&&p.t<=b.t1).sort((x,y)=>x.t-y.t);
    if(pts.length<2){out.push([m.m,d.z,b.ora,b.km,'fara urma']);continue;}
    // cea mai lungă staționare (puncte la ≤150 m, ≥20 min)
    let best=null; for(let i=0;i<pts.length;i++){let j=i; while(j+1<pts.length&&hav(pts[i],pts[j+1])<=0.15) j++; const dur=pts[j].t-pts[i].t; if(dur>=20*60e3&&(!best||dur>best.dur)) best={p:pts[i],dur}; i=j;}
    const f=pts[0], l=pts.at(-1);
    if(!best){out.push([m.m,d.z,b.ora,b.km,'fara stationare']);continue;}
    const c=best.p; const k1=await kmDrum(f,c), k2=await kmDrum(c,l), k0=await kmDrum(f,l);
    const nou = (k1==null||k2==null||k0==null)?null: Math.max(0, +(k1+k2-k0).toFixed(1));
    tv+=b.km; tn+=nou??b.km;
    out.push([m.m,d.z,b.ora,b.km,nou, +hav(f,c).toFixed(1), +hav(c,l).toFixed(1), k0,k1,k2, Math.round(best.dur/60e3)]);
  }}
const pm={}; for(const r of out){pm[r[0]]??=[0,0];pm[r[0]][0]+=r[3];pm[r[0]][1]+=(typeof r[4]==='number'?r[4]:r[3]);}
console.log('masina | R1b vechi | R1b nou (ocol pe șosea: f→casa→l − f→l)');
for(const [k,v] of Object.entries(pm).sort((x,y)=>y[1][0]-x[1][0])) console.log(k, v[0].toFixed(1), v[1].toFixed(1));
console.log('TOTAL', tv.toFixed(1), tn.toFixed(1), 'bucati', out.length);
fs.writeFileSync('/tmp/p880-ocol.json', JSON.stringify(out));
for(const r of out.filter(r=>r[0]==='880RNK'||r[0]==='925FTI')) console.log(JSON.stringify(r));
