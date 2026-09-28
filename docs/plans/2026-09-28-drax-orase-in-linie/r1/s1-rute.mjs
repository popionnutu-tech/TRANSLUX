// s1: rutele cu oraș în act — nomenclator, schelet, linii din economie-zile, exemple seg/opr
import fs from 'fs';
const D='/root/lde-worker/drax/date/saptamanal/2026-09-14/';
const R=['R19','R9','R3','R16','R23','R21','R15','R31','R8','R17','R1'];
const nom=JSON.parse(fs.readFileSync(D+'nomenclator.json','utf8'));
for(const r of nom.rute.filter(r=>R.includes(r.id))){ const c={...r}; console.log(JSON.stringify(c)); }
const sch=JSON.parse(fs.readFileSync(D+'schelet-ideal.json','utf8'));
for(const l of sch.filter(l=>R.includes(l.ruta))) { const {schimburi,...x}=l; console.log('SCH',JSON.stringify(x)); console.log('  schimb',JSON.stringify(schimburi)); }
const ez=JSON.parse(fs.readFileSync(D+'economie-zile.json','utf8'));
for(const [k,v] of Object.entries(ez.linii)) if(R.includes(k.split('|')[0])) console.log('EZL',k,JSON.stringify(v));
const z=ez.zile.find(z=>z.m==='830MUM'&&z.z==='2026-09-14'); console.log('ZI830',JSON.stringify(z));
console.log('CAT',ez.CAT);
const o=JSON.parse(fs.readFileSync('/root/lde-worker/drax/date/ideal-v4.3/obs-ideal.json','utf8'));
const c=o.curse.find(c=>c.ruta==='R19'); console.log('OBS',JSON.stringify(c));
