import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('ancoră: ' + a.slice(0, 70)); s = s.replace(a, b); };
rep("const calPentru = (L) => (sursaLeg(L) === 'valhalla' ? CAL_SRC.valhalla : 0);",
`// Codex r4: după delimitarea exactă a obligatoriilor (C2), validarea încrucișată nu mai arată câștig din calibrare nicăieri (14.09: global 2,2 / 2,9
// față de 2,3 fără; GPS 0,9 / 2,1 față de 1,5; Valhalla 2,9 / 2,1 față de 2,8) → fără calibrare. Validarea rămâne în rezultat, ca să se vadă
// săptămânal dacă o sursă începe să aibă abatere.
const calPentru = () => 0;`);
fs.writeFileSync(F, s); console.log('ok');
