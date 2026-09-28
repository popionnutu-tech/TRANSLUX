// Ion 28.09: drum între porți = cursă între uzine. Regula: mașina e LA poarta A (staționează ≥ 1 min acolo SAU mișcarea începe acolo — cursa de
// dinainte s-a terminat la A), merge prin zona uzinei (≤ 3 km de porți / parc, ≤ 40 min), și e LA poarta B (staționează ≥ 1 min SAU mișcarea se
// termină acolo — cursa următoare pleacă din B). Trecerea pe lângă ambele porți fără oprire nu intră. Pe mișcare unică (interval).
import fs from 'fs';
const P='/root/lde-worker/drax/date/saptamanal/2026-09-14/';
const hav=(a,b)=>{const R=6371,r=Math.PI/180;const x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 2*R*Math.asin(Math.sqrt(x));};
const G={EST:{lat:47.78513,lon:27.94307,r:0.6},VEST:{lat:47.77408,lon:27.91593,r:0.5}}, PARC={lat:47.770,lon:27.9235};
const poarta=p=>Object.entries(G).find(([,g])=>hav(p,g)<=g.r+0.3)?.[0]??null;
const zona=p=>hav(p,PARC)<=3||Object.values(G).some(g=>hav(p,g)<=3);
const a=JSON.parse(fs.readFileSync(P+'analiza.json','utf8'));
const tot={}, pm={}, nr={}, ex=[];
for(const m of a.masini){ const cache={};
 for(const d of m.detalii){ const vazut=new Set(); for(const b of d.bucati){ if(b.cat==='cuOameni') continue; const kk=b.t0+'|'+b.t1; if(vazut.has(kk)) continue; vazut.add(kk);
  const zile=[d.z, new Date(Date.parse(d.z)+864e5).toISOString().slice(0,10)];
  const U=zile.flatMap(z=>{ try{ return (cache[z]??=JSON.parse(fs.readFileSync(`${P}economie-urme/${m.m}/${z}.json`,'utf8')).pts);}catch{return [];} }).filter(p=>p.t>=b.t0&&p.t<=b.t1).sort((x,y)=>x.t-y.t);
  if(U.length<2) continue;
  // vizite în porți (puncte consecutive în aceeași poartă)
  const viz=[]; let s=null; for(const p of U){ const g=poarta(p); if(g){ if(s&&s.g===g) { s.u=p; s.min=Math.max(s.min, 0); if(p.v<8){ s.st??=p; s.stU=p; } } else { if(s) viz.push(s); s={g,t:p,u:p,min:0,st:p.v<8?p:null,stU:p.v<8?p:null}; } } else { if(s) viz.push(s); s=null; } } if(s) viz.push(s);
  const eLa=(v,i)=> (v.st&&v.stU.t-v.st.t>=60e3) || (i===0&&v.t===U[0]) || (i===viz.length-1&&v.u===U.at(-1));
  for(let i=0;i+1<viz.length;i++){ const A=viz[i], B=viz[i+1]; if(A.g===B.g||!eLa(A,i)||!eLa(B,i+1)) continue; if(B.t.t-A.u.t>40*60e3) continue;
    const mid=U.filter(p=>p.t>A.u.t&&p.t<B.t.t); if(!mid.every(zona)) continue;
    let km=0; const pts=[A.u,...mid,B.t]; for(let q=1;q<pts.length;q++){const dd=hav(pts[q-1],pts[q]); if(dd<=5) km+=dd;}
    tot[b.cat]=(tot[b.cat]||0)+km; pm[m.m]=(pm[m.m]||0)+km; nr[m.m]=(nr[m.m]||0)+1;
    if(ex.length<14&&['925FTI','024XKY','146BRAZ','713IZX'].includes(m.m)) ex.push(`${m.m} ${d.z} ${b.ora} ${b.cat} ${A.g}→${B.g} ${km.toFixed(1)} km`); }
 }}}
console.log('km cursă între uzine, pe categoria de acum:', JSON.stringify(Object.fromEntries(Object.entries(tot).map(([k,v])=>[k,+v.toFixed(1)]))), 'total', Object.values(tot).reduce((s,v)=>s+v,0).toFixed(1), 'km/săpt.');
console.log('pe mașină (km · drumuri):', Object.entries(pm).sort((x,y)=>y[1]-x[1]).map(([k,v])=>`${k} ${v.toFixed(0)}·${nr[k]}`).join('  '));
console.log(ex.join('\n'));
