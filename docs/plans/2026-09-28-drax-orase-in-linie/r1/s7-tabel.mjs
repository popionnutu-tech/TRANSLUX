// ION-124 r1 · s7: tabel pe linie din ieșirea s6 (local). node s7-tabel.mjs s6-sept.json
import fs from 'fs';
const J = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
console.log('luni', J.luni.join(','), 'curse', J.curse);
for (const [k, r] of Object.entries(J.rez).sort()) {
  const d = r.dincolo;
  console.log(`${k.padEnd(22)} cap ${r.capat.padEnd(16)} km ${String(r.kmSchelet).padStart(5)} n ${r.n.tur}/${r.n.retur} | peDrum ${r.peDrum.tur}/${r.peDrum.retur} | dincolo≥2 tur ${d.tur.curse} (${d.tur.pct}%) km ${d.tur.kmMed} opr ${d.tur.opririMed} @${d.tur.punctMed} · retur ${d.retur.curse} (${d.retur.pct}%) km ${d.retur.kmMed} opr ${d.retur.opririMed} | doarCasa ${r.doarCasa.tur}/${r.doarCasa.retur} astept ${r.asteptareDincolo.tur}/${r.asteptareDincolo.retur}`);
}
const pe = {}; for (const e of J.exemple) { const k = `${e.k} ${e.sens} ${e.m}`; pe[k] = (pe[k] ?? 0) + 1; }
console.log(Object.entries(pe).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${k}:${v}`).join(' · '));
