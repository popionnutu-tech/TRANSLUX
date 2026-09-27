import { readFileSync } from 'node:fs';
const X = JSON.parse(readFileSync('/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-112-translux-draxlmaier-dezbatere/docs/plans/2026-09-28-drax-6-linii/export-r3.json','utf8'));
const med=a=>{const q=a.filter(x=>x!=null).sort((x,y)=>x-y);if(!q.length)return null;const n=q.length;return n%2?q[(n-1)/2]:+((q[n/2-1]+q[n/2])/2).toFixed(2)};
const avg=a=>+(a.reduce((s,x)=>s+x,0)/a.length).toFixed(2);
function perechi(lin, f=()=>true){ const pe={}; for(const x of X.filter(x=>x.linie===lin&&x.sept&&f(x))){const k=`${x.zi}|${x.m}|${x.schimb}`;(pe[k]??={g:x.grupa,m:x.m});pe[k][x.sens]=x.plinLant;}
  return Object.values(pe).filter(p=>p.tur!=null&&p.retur!=null).map(p=>({...p,dif:100*Math.abs(p.tur-p.retur)/Math.max(p.tur,p.retur),km:(p.tur+p.retur)/2}));}
for (const [lin,f,et] of [['Nihoreni',()=>true,'toate'],['Nihoreni',x=>x.grupa==='D','D'],['Nihoreni',x=>x.grupa==='EZ','EZ'],['Prajila',()=>true,'toate'],['Prajila',x=>x.m!=='763LYY','fara763'],['Prajila',x=>x.m==='763LYY','763'],['Zarojeni',x=>x.grupa==='EZ','EZ']]) {
  const P=perechi(lin,f); const bune=P.filter(p=>p.dif<=18);
  console.log(lin,et,'perechi',P.length,'bune≤18%',bune.length,'medKm(bune)',med(bune.map(p=>p.km)),'medTur',med(bune.map(p=>p.tur)),'medRet',med(bune.map(p=>p.retur)),'mediaKm',bune.length?avg(bune.map(p=>p.km)):null, 'km bune:',bune.map(p=>p.km.toFixed(1)).join(','));
}
// Nihoreni: km/zi = suma pe zi a perechilor bune
