// ION-124 r1 · s10: rutele din act care conțin Sîngerei / Bilicenii (verificare R33). node /tmp/ion124-s10.mjs
import fs from 'fs';
const N = JSON.parse(fs.readFileSync('/root/lde-worker/drax/date/saptamanal/2026-09-14/nomenclator.json', 'utf8'));
for (const r of N.rute) if (/singerei|bilicen|iezar/i.test(r.nume + r.sate.join(' '))) console.log(r.id, r.nume, JSON.stringify(r.ang), JSON.stringify(r.masini), JSON.stringify(r.linii.map((l) => l.start)));
