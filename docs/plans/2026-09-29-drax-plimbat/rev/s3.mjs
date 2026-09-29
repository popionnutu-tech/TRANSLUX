import fs from 'fs';
const Cm = await import('/root/lde-worker/drax/cod/economie/comun.mjs');
const { PORTI, PARC } = Cm;
const W = '/root/lde-worker/drax/date/saptamanal/2026-09-14';
const Z = JSON.parse(fs.readFileSync(W+'/economie-zile.json','utf8'));
const EC = JSON.parse(fs.readFileSync(W+'/economie.json','utf8'));
const CI = JSON.parse(fs.readFileSync('/tmp/p132-ideala.json','utf8'));
const casa = new Map(EC.masini.map(x=>[x.m, x.casa ? (Array.isArray(x.casa)?{lat:x.casa[0],lon:x.casa[1]}:x.casa):null]));
const h = (a, b) => { const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const ora = (t) => new Date(t + 3 * 3600e3).toISOString().slice(11, 16);
const ALIAS = { '0357544371228442': '880RNK', '350KAJ#2284': '350KAJ' };
const TR = new Map();
for (const dev of fs.readdirSync(W+'/economie-urme')) { const m=ALIAS[dev]??dev; const byF = TR.get(m)?.byF ?? new Map();
  for (const f of fs.readdirSync(W+'/economie-urme/'+dev)) { const u = JSON.parse(fs.readFileSync(`${W}/economie-urme/${dev}/${f}`,'utf8')); const n=u.n??(u.pts??[]).length; const p=byF.get(f); if(!p||n>p.n) byF.set(f,{n,u}); }
  TR.set(m,{byF}); }
for (const [m,o] of TR) { const pts=[]; for (const {u} of o.byF.values()) for (const p of u.pts??[]) { if (p.mut||p.lat==null) continue; if (p.t==null && p.t0!=null){pts.push({lat:p.lat,lon:p.lon,t:p.t0,st:1}); if(p.t1>p.t0) pts.push({lat:p.lat,lon:p.lon,t:p.t1,st:1});} else if (p.t!=null) pts.push(p); }
  pts.sort((a,b)=>a.t-b.t); o.Q=pts.filter((p,i)=>i===0||p.t!==pts[i-1].t); }
console.log('PORTI', PORTI.map(g=>g.n+' r'+g.r).join(' '), 'VEST-EST', h(PORTI[0],PORTI[1]).toFixed(1), 'PARC-porti', PORTI.map(g=>h(g,PARC).toFixed(1)).join(','));
const rowsC = new Map(CI.randuri.map(r=>[r.m+'|'+r.z,r]));
const out=[]; let exA=0, exAdep=0, nA=0; const ratios=[];
for (const d of Z.zile) { const r=rowsC.get(d.m+'|'+d.z); if(!r) continue;
  for (const iv of r.intervale) { if (!(iv.neobl>0) || iv.plin || iv.langaUzina>0) continue;
    const s=d.seg.find(s=>s.ora===iv.ora); if(!s) continue; const Q=(TR.get(d.m)?.Q??[]).filter(p=>p.t>=s.t0&&p.t<=s.t1); if(Q.length<3) continue;
    const cs=casa.get(d.m); const acasa=p=>cs&&h(p,cs)<=0.4;
    const km=(i,j)=>{let x=0;for(let q=i+1;q<=j;q++)x+=h(Q[q-1],Q[q]);return x;};
    const A=Q[0],B=Q.at(-1);
    let i=0; while(i+1<Q.length&&h(Q[i+1],A)<=5&&!acasa(Q[i+1]))i++;
    let j=Q.length-1; while(j-1>=0&&h(Q[j-1],B)<=5&&!acasa(Q[j-1]))j--;
    // stop detection: last stop (dt>=180s, dist<0.1) before exit in phase A
    let k0=0; for(let k=i;k>0;k--){ if(h(Q[k-1],Q[k])<0.1 && Q[k].t-Q[k-1].t>=180e3){k0=k;break;} }
    const exitReal = i<j ? km(k0,i) : 0, exitBaseA = 1.3*h(A,Q[i]), exitBaseDep=1.3*h(Q[k0],Q[i]);
    if (i<j && h(A,Q[i])>4) { nA++; exA += Math.max(0,exitReal-exitBaseA); exAdep += Math.max(0, exitReal-exitBaseDep); if (h(Q[k0],Q[i])>3) ratios.push(exitReal/h(Q[k0],Q[i])); }
    // parking near home (0.4-1.5) inside phases
    let nearHome=0; if (cs) for (let k=1;k<Q.length;k++){ const inPh = k<=i || k>=j; if(!inPh) continue; const dh=h(Q[k],cs); if(dh>0.4&&dh<=1.5&&h(Q[k-1],Q[k])<0.1) nearHome+= (Q[k].t-Q[k-1].t)/60e3; }
    const rest = iv.neobl-iv.leg-iv.ocol;
    out.push({m:d.m,z:d.z,ora:iv.ora,es:r.esant,pl:iv.plimbat,a:iv.plimbatA,b:iv.plimbatB,rest:+rest.toFixed(1),ocol:iv.ocol,exitReal:+exitReal.toFixed(1),exitBaseA:+exitBaseA.toFixed(1),exitBaseDep:+exitBaseDep.toFixed(1),nearHomeMin:Math.round(nearHome), casaA: cs?+h(cs,A).toFixed(1):null, casaB: cs?+h(cs,B).toFixed(1):null, AB:+h(A,B).toFixed(1), tot:i>=j, oblK: +(iv.obl).toFixed(1)});
  } }
console.log('phaseA exits n',nA,'excess vs A',exA.toFixed(1),'excess vs departure point',exAdep.toFixed(1));
ratios.sort((a,b)=>a-b); console.log('circuity exit drive (dep->exit) n',ratios.length,'p25',ratios[Math.floor(ratios.length*.25)]?.toFixed(2),'med',ratios[Math.floor(ratios.length/2)]?.toFixed(2),'p75',ratios[Math.floor(ratios.length*.75)]?.toFixed(2));
console.log('-- near-home parking in phases (min>=20)'); for (const o of out.filter(o=>o.nearHomeMin>=20&&o.pl>0).sort((a,b)=>b.pl-a.pl).slice(0,12)) console.log(JSON.stringify(o));
console.log('-- plimbat 0 but rest>8'); for (const o of out.filter(o=>o.pl<0.5&&o.rest>8).sort((a,b)=>b.rest-a.rest).slice(0,15)) console.log(JSON.stringify(o));
console.log('-- tot cases'); for (const o of out.filter(o=>o.tot)) console.log(JSON.stringify(o));
console.log('-- home within 5 km of A or B, pl>0'); for (const o of out.filter(o=>o.pl>0&&((o.casaA!=null&&o.casaA<=5)||(o.casaB!=null&&o.casaB<=5))).sort((a,b)=>b.pl-a.pl).slice(0,15)) console.log(JSON.stringify(o));
console.log('-- cap binding (pl == rest)'); const cb=out.filter(o=>o.pl>0&&Math.abs(o.pl-o.rest)<0.15); console.log(cb.length, cb.slice(0,10).map(o=>o.m+' '+o.z+' '+o.ora+' pl'+o.pl+' a'+o.a+' b'+o.b).join(' | '));
