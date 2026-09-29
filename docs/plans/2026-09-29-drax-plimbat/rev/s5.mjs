import fs from 'fs';
const CI = JSON.parse(fs.readFileSync('/tmp/p132-ideala.json','utf8'));
const AC = JSON.parse(fs.readFileSync('/root/lde-worker/drax/date/saptamanal/2026-09-14/ziua-ideala.json','utf8'));
const L=[]; for (const r of CI.randuri) for (const i of r.intervale) if (i.neobl>0 && !i.plin && !(i.langaUzina>0)) L.push({m:r.m,z:r.z,es:r.esant,...i, raw:i.plimbatA+i.plimbatB, rest:+(i.neobl-i.leg-i.ocol).toFixed(1), rawNet: Math.max(0,i.plimbatA+i.plimbatB-(i.obl))});
const q=(a,p)=>{a=[...a].sort((x,y)=>x-y);return a.length?a[Math.floor(p*(a.length-1))].toFixed(1):'-';};
const E=L.filter(x=>x.es);
console.log('intervals elig', E.length, 'rest>0', E.filter(x=>x.rest>0).length, 'binding', E.filter(x=>x.rest>0&&x.plimbat>0&&Math.abs(x.plimbat-x.rest)<0.15).length, 'pl>0', E.filter(x=>x.plimbat>0).length);
const bind=E.filter(x=>x.rest>0&&x.plimbat>0&&Math.abs(x.plimbat-x.rest)<0.15);
console.log('overshoot (rawNet-rest) on binding: sum', bind.reduce((a,x)=>a+x.rawNet-x.rest,0).toFixed(1), 'median', q(bind.map(x=>x.rawNet-x.rest),.5));
const near=E.filter(x=>Math.abs(x.rest)<=2);
console.log('rest in [-2,2] n',near.length,'rawNet p25/med/p75', q(near.map(x=>x.rawNet),.25), q(near.map(x=>x.rawNet),.5), q(near.map(x=>x.rawNet),.75));
const neg=E.filter(x=>x.rest< -2); console.log('rest<-2 (drum mai scurt) n',neg.length,'rawNet med',q(neg.map(x=>x.rawNet),.5), 'examples', neg.sort((a,b)=>b.rawNet-a.rawNet).slice(0,5).map(x=>`${x.m} ${x.z} ${x.ora} rest${x.rest} raw${x.rawNet.toFixed(1)} leg${x.leg} ${x.src}`).join(' | '));
// src of leg for binding vs not
const bySrc={}; for (const x of E.filter(x=>x.plimbat>0)) { bySrc[x.src]=(bySrc[x.src]??0)+x.plimbat; } console.log('plimbat by leg src', JSON.stringify(bySrc));
// per cause changes: acasaDrumLung per interval: intervals with ocol>0 and plimbat>0
const wo=E.filter(x=>x.ocol>0.05&&x.plimbat>0); console.log('plimbat in intervals with ocol>0: n',wo.length,'sum',wo.reduce((a,x)=>a+x.plimbat,0).toFixed(1));
const wo2=E.filter(x=>x.ocol>5&&x.plimbat>0).sort((a,b)=>b.plimbat-a.plimbat).slice(0,8); for (const x of wo2) console.log(' ocol>5:',x.m,x.z,x.ora,'ocol',x.ocol,'leg',x.leg,x.src,'rest',x.rest,'pl',x.plimbat,'A',x.plimbatA,'B',x.plimbatB);
// probe ziSubMinus5 active vs candidate
console.log('active ziSub', JSON.stringify(AC.probe?.ziSubMinus5?.lista?.map(x=>x.m+' '+x.z+' '+x.e)), AC.probe? '':Object.keys(AC));
// per-machine top change
const am=new Map(AC.masini.map(x=>[x.m,x])); console.log(CI.masini.filter(x=>x.zileMasurate).map(x=>[x.m, am.get(x.m)?.kmSapt12_2, x.kmSapt12_2]).sort((a,b)=>(b[1]-b[2])-(a[1]-a[2])).slice(0,12).map(x=>x.join(':')).join('  '));
