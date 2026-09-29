import fs from 'fs';
const Cm = await import('/root/lde-worker/drax/cod/economie/comun.mjs');
const { PORTI, PARC } = Cm;
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
const dz = p => Math.min(h(p,PARC), ...PORTI.map(g=>h(p,g)));
const rowsC = new Map(CI.randuri.map(r=>[r.m+'|'+r.z,r]));
const S={pureA:0,pureB:0,homeA:0,homeB:0,rural:0,balti:0, n:0}; const ex=[];
for (const d of Z.zile) { const r=rowsC.get(d.m+'|'+d.z); if(!r||!r.esant) continue;
  for (const iv of r.intervale) { if (!(iv.plimbat>0)) continue;
    const s=d.seg.find(s=>s.ora===iv.ora); const Q=(TR.get(d.m)?.Q??[]).filter(p=>p.t>=s.t0&&p.t<=s.t1);
    const cs=casa.get(d.m); const acasa=p=>cs&&h(p,cs)<=0.4;
    const km=(i,j)=>{let x=0;for(let q=i+1;q<=j;q++)x+=h(Q[q-1],Q[q]);return x;};
    const A=Q[0],B=Q.at(-1);
    let i=0; while(i+1<Q.length&&h(Q[i+1],A)<=5&&!acasa(Q[i+1]))i++;
    let j=Q.length-1; while(j-1>=0&&h(Q[j-1],B)<=5&&!acasa(Q[j-1]))j--;
    if (i>=j) continue;
    const pure=(lo,hi,anc,fwd)=>{ // no stop>=3min, distance from anchor monotone within 0.5
      for(let k=lo+1;k<=hi;k++){ if(Q[k].t-Q[k-1].t>=180e3 && h(Q[k],Q[k-1])<0.2) return false; }
      let mx=0; const idx=fwd?[...Array(hi-lo+1).keys()].map(x=>lo+x):[...Array(hi-lo+1).keys()].map(x=>hi-x);
      for(const k of idx){ const dd=h(Q[k],anc); if(dd<mx-0.5) return false; mx=Math.max(mx,dd);} return true; };
    const a=Math.max(0,km(0,i)-1.3*h(A,Q[i])), b=Math.max(0,km(j,Q.length-1)-1.3*h(Q[j],B));
    const pa=pure(0,i,A,true), pb=pure(j,Q.length-1,B,false);
    const ha=Q[i+1]&&acasa(Q[i+1]), hb=Q[j-1]&&acasa(Q[j-1]);
    // scale to actual plimbat share (cap/oblK)
    const f = (a+b)>0 ? iv.plimbat/(a+b) : 0;
    if (pa) S.pureA+=a*f; if (pb) S.pureB+=b*f; if (ha) S.homeA+=a*f; if (hb) S.homeB+=b*f;
    S.rural += (dz(A)>8?a:0)*f + (dz(B)>8?b:0)*f; S.balti += (dz(A)<=8?a:0)*f + (dz(B)<=8?b:0)*f; S.n++;
    if ((pa&&a*f>2)||(pb&&b*f>2)) ex.push(`${d.m} ${d.z} ${iv.ora} ${pa?'A':''}${pb?'B':''} a${(a*f).toFixed(1)} b${(b*f).toFixed(1)} ratioA ${(km(0,i)/Math.max(.1,h(A,Q[i]))).toFixed(2)} ratioB ${(km(j,Q.length-1)/Math.max(.1,h(Q[j],B))).toFixed(2)}`);
  } }
for (const k in S) S[k]=+S[k].toFixed(1); console.log(JSON.stringify(S)); console.log(ex.slice(0,15).join('\n'), '\n n ex', ex.length);
