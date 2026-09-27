import { readFileSync } from 'node:fs';
const X = JSON.parse(readFileSync('/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-112-translux-draxlmaier-dezbatere/docs/plans/2026-09-28-drax-6-linii/export-r3.json','utf8'));
for (const lin of ['Prajila','Nihoreni','Zarojeni']) {
  const pe={}; for (const x of X.filter(x=>x.linie===lin&&x.sept)) { const k=`${x.zi}|${x.m}|${x.schimb}`; (pe[k]??={s:new Set(),o:[] ,g:x.grupa}); pe[k].s.add(x.sens); pe[k].o.push(`${x.sens[0]}${x.plinLant}${x.opriri?'*':''}`);}
  const zile={}; const leg={};
  for (const [k,v] of Object.entries(pe)) { const [zi,m,sch]=k.split('|'); (leg[zi]??=[]).push(`${m}/${sch}/${v.g}:${v.o.join(',')}${v.s.size===2?'':'(!)'}`); if(v.s.size===2) zile[zi]=(zile[zi]||0)+1; }
  const zs=Object.keys(leg).sort(); const cnt=zs.map(z=>zile[z]||0);
  const srt=[...cnt].sort((a,b)=>a-b);
  console.log('==',lin,'zile',zs.length,'perechi/zi',cnt.join(' '),'mediana',srt.length%2?srt[(srt.length-1)/2]:(srt[srt.length/2-1]+srt[srt.length/2])/2);
  for (const z of zs) console.log(' ',z, zile[z]||0, leg[z].join(' | '));
}
