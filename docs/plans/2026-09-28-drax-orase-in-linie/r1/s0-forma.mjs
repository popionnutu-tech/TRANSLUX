// s0: forma fișierelor (chei, un exemplu scurt) — doar citire
import fs from 'fs';
const D='/root/lde-worker/drax/date/saptamanal/2026-09-14/';
const sh=(o,d=0)=>{ if(d>3) return typeof o; if(Array.isArray(o)) return o.length?['ARR'+o.length, sh(o[0],d+1)]:'[]'; if(o&&typeof o==='object'){const r={};for(const k of Object.keys(o).slice(0,25)) r[k]=sh(o[k],d+1); return r;} return typeof o==='string'?o.slice(0,60):o; };
for (const f of ['nomenclator.json','schelet-ideal.json','economie-zile.json','analiza.json','economie-urme/830MUM/2026-09-14.json','capete-gps.json']) {
  const j=JSON.parse(fs.readFileSync(D+f,'utf8'));
  console.log('=== '+f); console.log(JSON.stringify(sh(j)).slice(0,3000));
}
const o=JSON.parse(fs.readFileSync('/root/lde-worker/drax/date/ideal-v4.3/obs-ideal.json','utf8'));
console.log('=== obs-ideal'); console.log(JSON.stringify(sh(o)).slice(0,3000));
