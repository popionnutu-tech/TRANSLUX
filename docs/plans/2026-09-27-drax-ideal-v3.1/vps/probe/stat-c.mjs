// ION-99: statistica cârpirii pe flotă (doar citire): pe mașini, pe observațiile cu rută, capăt atins doar pe drum cârpit, steaguri
import { readFileSync } from 'node:fs';
const DIR = '/root/lde-worker/drax/date/ideal-v3.1';
const R = JSON.parse(readFileSync(`${DIR}/carpire-raport.json`, 'utf8')), O = JSON.parse(readFileSync(`${DIR}/obs-ideal.json`, 'utf8')), D = JSON.parse(readFileSync(`${DIR}/curse-ideal.json`, 'utf8'));
console.log('statistica', JSON.stringify({ ...R.statistica, nepotrivite: R.statistica.nepotrivite.length }));
console.log('| mașină | curse cârpite | goluri | km cârpiți | km cursă înainte → după | curse > 30 % |\n|---|---:|---:|---:|---|---:|');
for (const [m, x] of Object.entries(R.peMasina).sort((a, b) => b[1].kmCarpit - a[1].kmCarpit)) console.log(`| ${m} | ${x.curse} | ${x.goluri} | ${x.kmCarpit} | ${x.kmInainte} → ${x.kmDupa} | ${x.steag} |`);
const cu = O.curse.filter(c => c.carpit), cuS = cu.filter(c => c.schimb);
const kmC = cu.reduce((s, c) => s + c.plinCarpit, 0), kmCS = cuS.reduce((s, c) => s + c.plinCarpit, 0);
console.log(`\nobservații cu rută pe curse cârpite: ${cu.length} (cu schimb ${cuS.length}); km cârpiți pe partea cu oameni: ${kmC.toFixed(1)} (cu schimb ${kmCS.toFixed(1)}); cu km cârpiți > 0 pe partea cu oameni: ${cu.filter(c => c.plinCarpit > 0).length}`);
console.log(`picioare cu steag (> 30 % din cursă cârpit): ${cu.filter(c => c.steagCarpit).length} (cu schimb ${cuS.filter(c => c.steagCarpit).length}) · capătul atins doar pe drum cârpit: ${cu.filter(c => c.capatCarpit).length} (cu schimb ${cuS.filter(c => c.capatCarpit).length})`);
const pl = {}; for (const c of cuS) { const k = `${c.ruta}|${c.linie}`; const x = pl[k] ??= { n: 0, km: 0, steag: 0, cap: 0 }; x.n++; x.km += c.plinCarpit; if (c.steagCarpit) x.steag++; if (c.capatCarpit) x.cap++; }
console.log('\n| linie | picioare cu schimb pe curse cârpite | km cârpiți pe partea cu oameni | cu steag > 30 % | capăt doar pe cârpit |\n|---|---:|---:|---:|---:|');
for (const [k, x] of Object.entries(pl).sort((a, b) => b[1].km - a[1].km).slice(0, 15)) console.log(`| ${k} | ${x.n} | ${x.km.toFixed(1)} | ${x.steag} | ${x.cap} |`);
const ocol = D.curse.flatMap(c => (c.goluri || []).filter(g => !g.carpit).map(g => `${c.m} ${new Date(c.t0).toISOString().slice(0, 16)} dreapta ${g.dDrept} km, drum ${g.kmDrum} km`));
console.log('\ngoluri necârpite (ocol suspect): ' + ocol.join(' · '));
