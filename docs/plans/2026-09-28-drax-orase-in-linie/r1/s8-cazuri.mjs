// ION-124 r1 · s8: cazurile din s3b pe mașină (local). node s8-cazuri.mjs s3b-saptamana.json
import fs from 'fs';
const J = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const [m, R] of Object.entries(J.masini)) {
  if (!R.cazuri.length && !Object.keys(R.peDrum).length) continue;
  console.log(`${m} casa ${R.casa} zile ${R.zile} mutat ${R.mutatTotal} ${JSON.stringify(R.mutat)} peDrum ${JSON.stringify(R.peDrum)}`);
  for (const c of R.cazuri) console.log(`   ${c.zi} ${c.lin} ${c.sens} ${c.oras} ${c.urcari ?? c.coborari} opriri ${c.de}–${c.pana} ${c.km} km ${JSON.stringify(c.parti)} ${c.dupa ?? ''}`);
}
