// Ideal-v3.1 (ION-99) pasul 3 — actualizarea decizii-v3.json (doar METODE + valoarea AȘTEPTATĂ = ce iese din lanț, toleranța 0,1 km).
// R6 Mihăilenii Vechi: metoda comună pe zile-pereche bune, «orice poartă» ca în verdictul v3 (turul intră amestecat VEST/EST: în sept.
// 18 tururi pe VEST, 5 pe EST), acum cu picioarele 345KAJ de după 14.09 mutate pe R6 de regula satelor în ordine; steagul v3 («picioarele
// 345KAJ stau pe R3|Recea*») se scoate — cauza e corectată, iar C47 ≥ 60 %. Alte linii: doar dacă `--asteapta=RUTA|linie:km:ture:kmZi:steag`
// (valoarea ieșită din lanț, raportată). Scrie atomic; fișierul vechi rămâne în proba/v3/decizii-v3.json.
//   node decizii-v31.mjs R6=54.9:1:109.8 [--asteapta=R32|Trifanesti:40.2:2:160.8:1 …]
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
const F = '../../date/ideal-v3.1/decizii-v3.json';
const d = JSON.parse(readFileSync(F, 'utf8'));
const a6 = process.argv.find(x => x.startsWith('R6='));
if (!a6) { console.error('lipsește R6=km:ture:kmZi'); process.exit(2); }
const [km, tz, kz] = a6.slice(3).split(':').map(Number);
const r6 = d.linii.find(x => x.ruta === 'R6' && x.linie === 'Mihailenii Vechi');
Object.assign(r6, { metoda: 'orice-poarta', steag: null,
  motiv: 'metoda comună: mediana pe zile-pereche bune, pe orice poartă (turul intră amestecat VEST/EST); din v3.1 cu picioarele 345KAJ de după 14.09 mutate de pe R3|Recea* pe R6 de regula satelor în ordine (etalon.mjs v3.1)',
  provenienta: 'verdict-v3.md (metoda, unanim) + ION-99 (Ion 27.09: «fă cârpiri dacă sare GPS-ul»; reatribuirea 345KAJ); steagul v3 scos: cauza lui corectată, C47 ≥ 60 %',
  asteptat: { km, tureZi: tz, kmZi: kz, steag: false } });
for (const a of process.argv.filter(x => x.startsWith('--asteapta='))) { const [k, ...v] = a.slice(11).split(':'); const [ruta, linie] = k.split('|');
  const x = d.linii.find(y => y.ruta === ruta && y.linie === linie); if (!x) { console.error('decizie absentă: ' + k); process.exit(2); }
  x.asteptat = { km: +v[0], tureZi: +v[1], kmZi: +v[2], steag: v[3] === '1' }; x.provenienta += ' · valoarea așteptată refăcută în v3.1 (ION-99) = ce iese din lanțul v3.1'; }
d.versiune = 'decizii-v3 · 2026-09-27 · v3.1 (ION-99)';
const ADAOS = ' + ION-99 ideal-v3.1 (cârpirea golurilor GPS, regula satelor în ordine, R6 pe metoda comună; dezbaterea 27.09: punctele cârpite în afara atribuirii, picioarele > 30 % cârpite în afara etalonului, card-vechi = cardul sigilat din ideal-v3)';
d.sursa = d.sursa.split(' + ION-99 ideal-v3.1')[0] + ADAOS;   // idempotent
writeFileSync(F + '.tmp', JSON.stringify(d, null, 1) + '\n'); renameSync(F + '.tmp', F);
console.log(JSON.stringify(r6.asteptat), 'versiune', d.versiune);
