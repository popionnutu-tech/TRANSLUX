import fs from 'fs';
const hav=(a,b)=>{const R=6371,r=Math.PI/180;const x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 2*R*Math.asin(Math.sqrt(x));};
const U = JSON.parse(fs.readFileSync('/root/lde-worker/drax/date/saptamanal/2026-09-14/economie-urme/830MUM/2026-09-14.json', 'utf8')).pts;
const SG={lat:47.636085,lon:28.1455434}, CASA={lat:47.6439,lon:28.1149}; const loc=(t)=>new Date(t+3*3600e3).toISOString().slice(11,19);
const P=U.filter(p=>p.t>=Date.parse('2026-09-14T13:14:00Z')&&p.t<=Date.parse('2026-09-14T13:50:00Z'));
for(let i=0;i<P.length;i++){ const p=P[i]; if(p.v>=8) continue; const nx=P[i+1]; console.log(loc(p.t),'v',p.v,'→ următorul', nx?`${((nx.t-p.t)/1000).toFixed(0)} s, ${(hav(p,nx)*1000).toFixed(0)} m, v ${nx.v}`:'-', '| oraș', hav(p,SG).toFixed(2),'km | casă', hav(p,CASA).toFixed(2),'km'); }
