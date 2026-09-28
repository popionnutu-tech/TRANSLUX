import fs from 'fs';
const L=fs.readFileSync(process.argv[2],'utf8').split('\n');
for(const l of L){ if(!l.startsWith('SCH ')) continue; const x=JSON.parse(l.slice(4)); if(x.faraIdeal){console.log(x.ruta,x.linie,'FARA',x.motiv);continue;}
 console.log(x.ruta,'|',x.linie,'| capat',x.capat,x.capatC.map(v=>v.toFixed(4)).join(','),'| km',x.km,'etalon',x.etalon,'tureZi',x.tureZi,'poarta',x.poarta,'| masini',x.masini.map(m=>m.m+':'+m.zile).join(' '),'| sateDrum',(x.sateDrum||[]).map(s=>s.n+(s.km!=null?'@'+s.km:'')).join(' > '));
 console.log('   keys',Object.keys(x).join(','));}
