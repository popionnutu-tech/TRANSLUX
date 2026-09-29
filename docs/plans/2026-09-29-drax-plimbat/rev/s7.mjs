import fs from 'fs';
const W = '/root/lde-worker/drax/date/saptamanal/2026-09-14';
const Z = JSON.parse(fs.readFileSync(W+'/economie-zile.json','utf8'));
const EC = JSON.parse(fs.readFileSync(W+'/economie.json','utf8'));
const CI = JSON.parse(fs.readFileSync('/tmp/p132-ideala.json','utf8'));
const casa = new Map(EC.masini.map(x=>[x.m, x.casa ? (Array.isArray(x.casa)?{lat:x.casa[0],lon:x.casa[1]}:x.casa):null]));
const h = (a, b) => { const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const ALIAS = { '0357544371228442': '880RNK', '350KAJ#2284': '350KAJ' };
const TR = new Map();
for (const dev of fs.readdirSync(W+'/economie-urme')) { const m=ALIAS[dev]??dev; const byF = TR.get(m)?.byF ?? new Map();
  for (const f of fs.readdirSync(W+'/economie-urme/'+dev)) { const u = JSON.parse(fs.readFileSync(`${W}/economie-urme/${dev}/${f}`,'utf8')); const n=u.n??(u.pts??[]).length; const p=byF.get(f); if(!p||n>p.n) byF.set(f,{n,u}); }
  TR.set(m,{byF}); }
for (const [m,o] of TR) { const pts=[]; for (const {u} of o.byF.values()) for (const p of u.pts??[]) { if (p.mut||p.lat==null) continue; if (p.t==null && p.t0!=null){pts.push({lat:p.lat,lon:p.lon,t:p.t0}); if(p.t1>p.t0) pts.push({lat:p.lat,lon:p.lon,t:p.t1});} else if (p.t!=null) pts.push(p); }
  pts.sort((a,b)=>a.t-b.t); o.Q=pts.filter((p,i)=>i===0||p.t!==pts[i-1].t); }
const rowsC = new Map(CI.randuri.map(r=>[r.m+'|'+r.z,r]));
let tot=0; const ex=[];
for (const d of Z.zile) { const r=rowsC.get(d.m+'|'+d.z); if(!r||!r.esant) continue;
  const tr = d.seg.filter(s=>s.cat==='cuOameni').sort((a,b)=>a.t0-b.t0); if(!tr.length) continue;
  const cs=casa.get(d.m); const acasa=p=>cs&&h(p,cs)<=0.4;
  const Qall=TR.get(d.m)?.Q??[];
  for (const [part, lo, hi, fwd] of [['dim', tr[0].t0-6*3600e3, tr[0].t0, false], ['seara', tr.at(-1).t1, tr.at(-1).t1+6*3600e3, true]]) {
    const jm=r.jumatati.find(x=>x.part===part); if(!jm||jm.economie<=0||jm.cat==='balti'||jm.cat==='pauza') continue;
    const Q=Qall.filter(p=>p.t>=lo&&p.t<=hi); if(Q.length<3) continue;
    let km=0, i;
    if (fwd) { const A=Q[0]; i=0; while(i+1<Q.length&&h(Q[i+1],A)<=5&&!acasa(Q[i+1]))i++; for(let k=1;k<=i;k++)km+=h(Q[k-1],Q[k]); km=Math.max(0,km-1.3*h(A,Q[i])); }
    else { const B=Q.at(-1); i=Q.length-1; while(i-1>=0&&h(Q[i-1],B)<=5&&!acasa(Q[i-1]))i--; for(let k=i+1;k<Q.length;k++)km+=h(Q[k-1],Q[k]); km=Math.max(0,km-1.3*h(Q[i],B)); }
    const v=Math.min(km, jm.economie); tot+=v; if(v>6) ex.push(`${d.m} ${d.z} ${part} econ ${jm.economie} plimbat-la-capatul-cursei ${v.toFixed(1)}`);
  } }
console.log('plimbat în jumătățile de noapte (capătul dinspre cursă), zile eșantion:', tot.toFixed(1)); console.log(ex.sort().slice(0,20).join('\n'), '\n n', ex.length);
