import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('ancoră: ' + a.slice(0, 70)); s = s.replace(a, b); };
rep("const calPentru = (L) => CAL_SRC[sursaLeg(L)] ?? CAL;",
`// Codex r3 C3, validarea încrucișată pe 14.09 (CAL dintr-o jumătate aplicat pe cealaltă, eroare absolută mediană): global 2,5–2,9 față de 2,1 fără
// calibrare (strică); GPS 1,1–1,7 față de 1,4 (nu ajută); Valhalla 2,5–3,1 față de 4,3 (ajută). → calibrare DOAR pe legăturile Valhalla × 1,05.
const calPentru = (L) => (sursaLeg(L) === 'valhalla' ? CAL_SRC.valhalla : 0);`);
fs.writeFileSync(F, s); console.log('ok');
