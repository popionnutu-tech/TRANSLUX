// Comparația schelet vechi ↔ nou pe km GPS, linie cu linie (Ion 26.09: «km reali din GPS»), din două controale.json produse de drax.mjs v4.
// Compară și CARDUL: pe schelet nou, km-ul cardului trebuie să fie etalonul GPS completat (±0,1 km) — triaj r3 M3.
//   node compara.mjs <vechi/controale.json> <nou/controale.json>
import { readFileSync } from 'node:fs';
const A = JSON.parse(readFileSync(process.argv[2], 'utf8')), B = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const k = x => `${x.ruta}|${x.linie}`; const MA = new Map(A.linii.map(x => [k(x), x])), MB = new Map(B.linii.map(x => [k(x), x]));
console.log(`vechi: ${A.verif_src} (${A.intrari['schelet-ideal.json'].sha256.slice(0, 12)}) · nou: ${B.verif_src} (${B.intrari['schelet-ideal.json'].sha256.slice(0, 12)})`);
console.log('rută|linie · card vechi → nou · etalon GPS vechi → nou · card nou − etalon nou · ture/zi · km/zi card · km/zi GPS · zile bune · ziua aleasă bună GPS');
const s = { cardA: 0, cardB: 0, gpsA: 0, gpsB: 0 }; let cardNepotrivit = 0, disparute = 0;
for (const key of [...new Set([...MA.keys(), ...MB.keys()])].sort()) { const a = MA.get(key), b = MB.get(key);
  if (!a || !b) { if (!b) disparute++; console.log(`${key} · ${a ? 'DISPĂRUTĂ în nou' : 'NOUĂ'}`); continue; }
  s.cardA += a.kmZi_schelet || 0; s.cardB += b.kmZi_schelet || 0; s.gpsA += a.kmZiGPS || 0; s.gpsB += b.kmZiGPS || 0;
  const dCard = b.etalonGPS != null ? +(b.km_card - b.etalonGPS).toFixed(2) : null; const nepotr = dCard == null || Math.abs(dCard) > 0.1; if (nepotr) cardNepotrivit++;
  if (a.km_card !== b.km_card || a.etalonGPS !== b.etalonGPS || a.tureZiGPS !== b.tureZiGPS || a.ziAleasa !== b.ziAleasa || nepotr)
    console.log(`${key} · ${a.km_card} → ${b.km_card} · ${a.etalonGPS} → ${b.etalonGPS} · ${dCard ?? '—'}${nepotr ? ' ⚠' : ''} · ${a.tureZiGPS} → ${b.tureZiGPS} · ${a.kmZi_schelet} → ${b.kmZi_schelet} · ${a.kmZiGPS} → ${b.kmZiGPS} · ${a.zileBuneGPS} → ${b.zileBuneGPS} · ${a.ziAleasaBunaGPS} → ${b.ziAleasaBunaGPS}${b.corectie ? ' · ' + b.corectie : ''}`); }
console.log(`total km/zi card: ${s.cardA.toFixed(0)} → ${s.cardB.toFixed(0)} · km/zi GPS completat: ${s.gpsA.toFixed(0)} → ${s.gpsB.toFixed(0)} · linii cu card ≠ etalon (±0,1 km) în nou: ${cardNepotrivit} · dispărute: ${disparute}`);
process.exit(disparute ? 1 : 0);
