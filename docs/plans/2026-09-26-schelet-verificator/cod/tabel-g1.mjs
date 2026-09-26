// tabel-g1.mjs <controale.json> — tabelul card vs etalonul GPS completat (poarta sensului + raza porții), linie cu linie, sortat după diferență.
import { readFileSync } from 'node:fs';
const X = JSON.parse(readFileSync(process.argv[2], 'utf8')); const L = X.linii.slice().sort((a, b) => Math.abs(b.dif_pct ?? 0) - Math.abs(a.dif_pct ?? 0));
console.log('| rută | linie | porți tur/retur | card km | GPS brut | GPS completat | dif % | zile bune | C47 % | ture/zi | km/zi card → GPS | corecție |'); console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const l of L) console.log(`| ${l.ruta} | ${l.linie} | ${l.porti?.tur}/${l.porti?.retur} | ${l.km_card} | ${l.etalonGPS_brut ?? '—'} | ${l.etalonGPS ?? '—'} | ${l.dif_pct ?? '—'} | ${l.zileBuneGPS} | ${l.c47 ?? '—'} | ${l.tureZi_schelet}${l.tureZiGPS !== l.tureZi_schelet ? ' → ' + l.tureZiGPS : ''} | ${l.kmZi_schelet} → ${l.kmZiGPS ?? '—'} | ${l.corectie ?? '—'} |`);
const d = L.map(l => l.dif_pct).filter(x => x != null); const b = t => d.filter(x => Math.abs(x) > t).length;
console.log(`\nlinii ${L.length} · |dif| > 5 %: ${b(5)} · 2,5–5 %: ${b(2.5) - b(5)} · ≤ 2,5 %: ${d.length - b(2.5)} · card > GPS: ${d.filter(x => x > 0).length} · mediana dif ${[...d].sort((a, b) => a - b)[Math.floor(d.length / 2)]} % · ziua aleasă NU e zi bună GPS: ${L.filter(l => l.ziAleasaBunaGPS === false).length}`);
