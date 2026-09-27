import {readFileSync} from 'node:fs';
const X=JSON.parse(readFileSync('/Users/ionpop/Desktop/TRANSLUX/.claude/worktrees/ion-112-translux-draxlmaier-dezbatere/docs/plans/2026-09-28-drax-6-linii/export-r3.json','utf8'));
const med=a=>{const q=a.filter(x=>x!=null).sort((x,y)=>x-y);if(!q.length)return null;const n=q.length;return n%2?q[(n-1)/2]:+((q[n/2-1]+q[n/2])/2).toFixed(2)};
console.log('n',X.length);
for(const L of ['Nihoreni','Zarojeni','Prajila']){
 console.log('=== ',L);
 const q=X.filter(x=>x.linie===L);
 // per machine per group
 const by={};for(const x of q){const k=`${x.sept?'S':'W'} ${x.grupa} ${x.sens} ${x.m}`;(by[k]??=[]).push(x)}
 for(const k of Object.keys(by).sort()){const a=by[k];const c=a.filter(x=>x.opriri>0);console.log(k.padEnd(28),'n',a.length,'opr',c.length,'kmOpr med',med(c.map(x=>x.kmDeLaOprire)),'plin med',med(a.map(x=>x.plinLant)), 'kmOpr all', c.map(x=>x.kmDeLaOprire).join(','))}
 // all sept with stop, both groups, both senses
 const s=q.filter(x=>x.sept&&x.opriri>0);console.log('SEPT all w/stop: n',s.length,'med',med(s.map(x=>x.kmDeLaOprire)),'tur',med(s.filter(x=>x.sens==='tur').map(x=>x.kmDeLaOprire)));
 const w=q.filter(x=>x.opriri>0);console.log('WIN all w/stop: n',w.length,'med',med(w.map(x=>x.kmDeLaOprire)));
 console.log('SEPT plin all med', med(q.filter(x=>x.sept).map(x=>x.plinLant)));
 // day table sept
 const d={};for(const x of q.filter(x=>x.sept)){(d[x.zi]??={});const k=x.m+'/'+x.schimb;(d[x.zi][k]??=new Set()).add(x.sens)}
 for(const z of Object.keys(d).sort()){console.log(' ',z, Object.entries(d[z]).map(([k,v])=>k+':'+[...v].map(s=>s[0]).join('')).join('  '))}
}
