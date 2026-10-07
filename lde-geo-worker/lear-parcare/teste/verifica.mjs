// ION-268 K.8 — verifică ieșirea lui lear-parcare.mjs pe dump-urile fixe față de asteptat.json. Cod 0 = toate trec.
//   node verifica.mjs <dir-ieșiri>   (dir-ieșiri/<dump>-parcare.json, făcute de teste-fixe.sh)
import { readFileSync } from 'node:fs';
const AICI = new URL('.', import.meta.url).pathname, OUT = process.argv[2];
const A = JSON.parse(readFileSync(`${AICI}asteptat.json`, 'utf8'));
const cache = new Map(), PK = (d) => { if (!cache.has(d)) cache.set(d, JSON.parse(readFileSync(`${OUT}/${d.replace(/\.json$/, '')}-parcare.json`, 'utf8'))); return cache.get(d); };
const intre = (x, [a, b]) => x != null && x >= a && x <= b;
let picate = 0;
for (const t of A.teste) {
  const x = PK(t.dump).masini.find((q) => q.m === t.m), erori = [];
  if (!x) erori.push('mașina lipsește din ieșire');
  else {
    const zi = (x.plan?.zile ?? []).find((q) => q.z === t.z);
    for (const [sens, sc, ruta, statut] of t.curse ?? []) { const c = zi?.curse.find((q) => q.sens === sens && q.schimb === sc);
      if (!c || c.ruta !== ruta || c.statut !== statut) erori.push(`${sens} s${sc}: așteptat ${ruta} ${statut}, iese ${c ? `${c.ruta} ${c.statut}` : 'nimic'}`); }
    if (t.deTaiatZi) { const e = x.locuri?.length ? (x.zile ?? []).find((q) => q.z === t.z)?.economie ?? 0 : 0; if (!intre(e, t.deTaiatZi)) erori.push(`de tăiat în zi ${e}, așteptat ${t.deTaiatZi.join('–')}`); }
    if (t.faraPauzaAcasa && (x.pauze?.lista ?? []).some((p) => p.z === t.z)) erori.push('are pauză «acasă» în zi (trebuia la uzină)');
    if (t.drum) { const l = (x.legi ?? []).find((q) => q.z === t.z && q.ora.startsWith(t.drum.oraDe)) ?? (x.legi ?? []).find((q) => q.ora.startsWith(t.drum.oraDe) && q.t0 >= Date.parse(`${t.z}T00:00:00Z`) - 6 * 3600e3 && q.t0 <= Date.parse(`${t.z}T23:59:00Z`));
      if (!l) erori.push(`drumul de la ${t.drum.oraDe} lipsește`);
      else { const loc = x.laUzina || (l.loc > 0 && /poarta|uzin/.test(x.locuri?.[l.loc - 1]?.n ?? '')) ? 'uzina' : l.loc > 0 ? x.locuri?.[l.loc - 1]?.n : 'rămâne cum e';
        if (!intre(l.realGps ?? l.real, t.drum.kmAcum)) erori.push(`km acum ${l.realGps ?? l.real}, așteptat ${t.drum.kmAcum.join('–')}`);
        if (!intre(l.km, t.drum.kmPropus)) erori.push(`km propus ${l.km}, așteptat ${t.drum.kmPropus.join('–')}`);
        if (loc !== t.drum.loc) erori.push(`loc ${loc}, așteptat ${t.drum.loc}`); } } }
  console.log(`${erori.length ? '✗' : '✓'} ${t.id}${erori.length ? ' — ' + erori.join('; ') : ''}`);
  if (erori.length) picate++;
}
console.log(picate ? `${picate} teste fixe picate — schimbarea NU se livrează` : 'toate testele fixe trec');
process.exit(picate ? 1 : 0);
