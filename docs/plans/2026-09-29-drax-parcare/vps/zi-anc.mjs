import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const a = "    intervale, jumatati: jum, steaguri, tipar: d.tipar });";
if (s.split(a).length !== 2) throw new Error('ancoră');
s = s.replace(a, "    // ION-136 (Codex r3 C2): ancorele nopții — S = începutul primei deplasări obligatorii, E = sfârșitul ultimei (legNoapte = leg(E, S următor))\n    ancore: { S: x.S ? [x.S.lat, x.S.lon] : null, E: x.E ? [x.E.lat, x.E.lon] : null },\n" + a);
fs.writeFileSync(F, s); console.log('ok');
