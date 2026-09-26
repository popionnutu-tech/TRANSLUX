// E.1b (execuție ION-94): leagă în ideal-v2 identitatea dispozitivului (1d) și generatorul de card (5c). Idempotent.
//   node patch-v2.mjs /root/lde-worker/drax/cod/ideal-v2
import { readFileSync, writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };
const C = process.argv[2]; if (!C?.endsWith('/ideal-v2')) { console.error('patch-v2.mjs <…/drax/cod/ideal-v2>'); process.exit(2); }
const ed = (f, a, b, gata) => { let s = readFileSync(`${C}/${f}`, 'utf8'); if (s.includes(gata)) return console.log(`${f}: deja`);
  if (!s.includes(a)) throw new Error(`${f}: ancora lipsește «${a.slice(0, 60)}»`); s = s.replace(a, b); scrieAtomic(`${C}/${f}`, s); console.log(`${f}: pus`); };
// extracția viitoare păstrează id-ul dispozitivului (fix-350 doar redenumește plăcuța, obiectul cursei rămâne cu `dev`)
ed('curse.mjs', 'curse.push({ m: d.placa, t0: a.t', 'curse.push({ m: d.placa, dev: d.id, dispozitiv: d.id, t0: a.t', 'dev: d.id');
// observațiile poartă dispozitivul cursei
ed('etalon.mjs', 'pranz: !s && h >= 8 && h < 15 };', 'pranz: !s && h >= 8 && h < 15, dev: c.dev ?? null, dispozitiv: c.dev ?? null };', 'dispozitiv: c.dev');
ed('lant.sh', 'echo "== 1c dubluri-placa"; node dubluri-placa.mjs',
  'echo "== 1c dubluri-placa"; node dubluri-placa.mjs\necho "== 1d dispozitiv"; node dispozitiv.mjs', '1d dispozitiv');
ed('lant.sh', 'echo "== 6 control";',
  'echo "== 5c card GPS"; node card-gps.mjs ../../date/ideal-v2\necho "== 6 control";', '5c card GPS');
