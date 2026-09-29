import fs from 'fs';
const W = '/root/lde-worker/drax/date/saptamanal/2026-09-14';
const Z = JSON.parse(fs.readFileSync(W+'/economie-zile.json','utf8'));
const EC = JSON.parse(fs.readFileSync(W+'/economie.json','utf8'));
const casa = new Map(EC.masini.map(x=>[x.m, x.casa ? (Array.isArray(x.casa)?{lat:x.casa[0],lon:x.casa[1]}:x.casa):null]));
const h = (a, b) => { const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const V = []; for (const l of fs.readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) { if (!l.includes('"place"')) continue; try { const g = JSON.parse(l.replace(/^\x1e/, '')); if (!/village|town|city|hamlet|suburb/.test(g.properties.place)) continue; const [x, y] = g.geometry.coordinates; if (y > 47.0 && y < 48.5 && x > 27.0 && x < 29.0) V.push({ n: g.properties.name, lat: y, lon: x }); } catch {} }
const loc = (p) => { let b = null, d = 1e9; for (const v of V) { const k = h(p, v); if (k < d) { d = k; b = v.n; } } return `${b}${d > 1.5 ? `+${d.toFixed(1)}` : ''}`; };
const ora = (t) => new Date(t + 3 * 3600e3).toISOString().slice(11, 16);
const ALIAS = { '0357544371228442': '880RNK', '350KAJ#2284': '350KAJ' };
function track(m, t0, t1) {
  const devs = fs.readdirSync(W+'/economie-urme').filter(d => (ALIAS[d]??d)===m);
  const byF = new Map();
  for (const dev of devs) for (const f of fs.readdirSync(W+'/economie-urme/'+dev)) { const u = JSON.parse(fs.readFileSync(`${W}/economie-urme/${dev}/${f}`,'utf8')); const n=u.n??(u.pts??[]).length; const p=byF.get(f); if(!p||n>p.n) byF.set(f,{n,u}); }
  const pts=[]; for (const {u} of byF.values()) for (const p of u.pts??[]) { if (p.mut) continue; if (p.lat==null) continue; if (p.t==null && p.t0!=null){pts.push({lat:p.lat,lon:p.lon,t:p.t0,st:1}); if(p.t1>p.t0) pts.push({lat:p.lat,lon:p.lon,t:p.t1,st:1});} else if (p.t!=null) pts.push(p); }
  pts.sort((a,b)=>a.t-b.t); const Q=pts.filter((p,i)=>i===0||p.t!==pts[i-1].t);
  return Q.filter(p=>p.t>=t0&&p.t<=t1);
}
const args = process.argv.slice(2);
for (let k=0;k<args.length;k+=3) {
  const [m,z,o]=[args[k],args[k+1],args[k+2]];
  const d = Z.zile.find(x=>x.m===m&&x.z===z); const segs=d.seg.filter(s=>s.ora===o);
  const t0=segs[0].t0,t1=segs[0].t1; const Q=track(m,t0,t1); const cs=casa.get(m);
  const acasa=p=>cs&&h(p,cs)<=0.4;
  const km=(i,j)=>{let x=0;for(let q=i+1;q<=j;q++)x+=h(Q[q-1],Q[q]);return x;};
  const A=Q[0],B=Q.at(-1);
  let i=0; while(i+1<Q.length&&h(Q[i+1],A)<=5&&!acasa(Q[i+1]))i++;
  let j=Q.length-1; while(j-1>=0&&h(Q[j-1],B)<=5&&!acasa(Q[j-1]))j--;
  console.log(`== ${m} ${z} ${o} pts ${Q.length} trackKm ${km(0,Q.length-1).toFixed(1)} segKm ${segs.reduce((a,s)=>a+s.km,0).toFixed(1)} segs ${segs.map(s=>s.cat+(s.ocol?'*':'')+':'+s.km.toFixed(1)).join(',')}`);
  console.log(` A=${loc(A)} B=${loc(B)} AB=${h(A,B).toFixed(1)} casa=${cs?loc(cs):'-'} casa-A ${cs?h(cs,A).toFixed(1):'-'} casa-B ${cs?h(cs,B).toFixed(1):'-'}`);
  console.log(` fazaA ${ora(A.t)}–${ora(Q[i].t)} km ${km(0,i).toFixed(1)} exit ${loc(Q[i])} str ${h(A,Q[i]).toFixed(1)} next ${Q[i+1]?loc(Q[i+1])+' '+ora(Q[i+1].t)+(acasa(Q[i+1])?' ACASA':''):'-'}`);
  console.log(` fazaB ${ora(Q[j].t)}–${ora(B.t)} km ${km(j,Q.length-1).toFixed(1)} entry ${loc(Q[j])} str ${h(Q[j],B).toFixed(1)} prev ${Q[j-1]?loc(Q[j-1])+' '+ora(Q[j-1].t)+(acasa(Q[j-1])?' ACASA':''):'-'}  i>=j ${i>=j}`);
  // jitter: km accumulated between consecutive points with v==0 or stationary
  let jit=0; for(let q=1;q<Q.length;q++){ if((Q[q].v??0)<3 && (Q[q-1].v??0)<3) jit+=h(Q[q-1],Q[q]); } console.log(' km între puncte cu v<3:',jit.toFixed(1));
}
