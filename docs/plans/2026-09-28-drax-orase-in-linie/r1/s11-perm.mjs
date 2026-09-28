// ION-124 r1 · s11: pe mașină, pe liniile cu orașul dincolo de capăt (local). node s11-perm.mjs s6-fereastra.json
import fs from 'fs';
const J = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const k of ['R19|Bilicenii Vechi', 'R3|Nihoreni', 'R16|Floresti', 'R1|Donduseni', 'R19|Copaceni', 'R9|Cobani']) {
  const pm = J.rez[k]?.perM ?? {};
  console.log(k, Object.entries(pm).filter(([, v]) => v.tur + v.retur >= 4).sort((a, b) => (b[1].tur + b[1].retur) - (a[1].tur + a[1].retur))
    .map(([m, v]) => `${m} ${v.dTur}/${v.tur}t ${v.dRetur}/${v.retur}r`).join(' · '));
}
