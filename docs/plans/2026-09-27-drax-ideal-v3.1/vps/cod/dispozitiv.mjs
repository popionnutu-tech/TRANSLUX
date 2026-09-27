// Idealul v2, pasul 1d (execuție ION-94, cererea sesiunii după verificarea 1 ION-95): identitatea DISPOZITIVULUI pe fiecare cursă.
// curse.mjs (ION-71) nu scria id-ul; fix-350 / fix-dubluri unesc plăcile «X#id» și IMEI-urile într-o singură plăcuță, deci în
// curse-ideal.json nu se mai poate spune ce dispozitiv a făcut cursa (cele două dispozitive ale aceluiași autobuz au aceleași poziții).
// Sursa: dispozitive-sursa.json (în același dosar), scris O DATĂ de extrage-dispozitive.sh din tracker, doar citire:
//   flota   = [{ id, placa }] din flota-ideal.json (plăcile cu un singur dispozitiv → id-ul lui);
//   curse   = [{ m, t0, km, dev }] = aceeași extracție (curse.mjs, aceeași fereastră) cu `dev`, DOAR pentru plăcile cu 2 dispozitive.
// Potrivire: cursa v2 ↔ cursa extrasă după (t0, km) exact; plăcuța după unire (alias din dubluri-ideal.json și «#id»).
// Scrie `dev` (câmpul citit de c4.mjs) și `dispozitiv` (același id) pe fiecare cursă. Idempotent.
//   cd /root/lde-worker/drax/cod/ideal-v3.1 && node dispozitiv.mjs
import { readFileSync, existsSync, writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };
const DIR = '../../date/ideal-v3.1', OUT = `${DIR}/curse-ideal.json`, SRC = `${DIR}/dispozitive-sursa.json`;
if (!existsSync(SRC)) { console.error(`${SRC} lipsește — rulează întâi extrage-dispozitive.sh (tracker, doar citire)`); process.exit(2); }
const V = JSON.parse(readFileSync(OUT, 'utf8')), S = JSON.parse(readFileSync(SRC, 'utf8'));
const DUBL = existsSync(`${DIR}/dubluri-ideal.json`) ? JSON.parse(readFileSync(`${DIR}/dubluri-ideal.json`, 'utf8')) : {};
const alias = new Map(); for (const [b, xs] of Object.entries(DUBL)) for (const x of xs) alias.set(x, b);
const baza = (p) => { const b = String(p).split('#')[0]; return alias.get(b) ?? alias.get(p) ?? b; };
const devPe = new Map(); for (const f of S.flota) { const b = baza(f.placa); (devPe.get(b) ?? devPe.set(b, new Set()).get(b)).add(f.id); }
const ext = new Map(); for (const c of S.curse) ext.set(`${baza(c.m)}|${new Date(c.t0).toISOString()}|${c.km}`, c.dev);
let unic = 0, potrivite = 0, lipsa = 0; const lipsaPe = {};
for (const c of V.curse) {
  const b = baza(c.m), ds = devPe.get(b); let d = null;
  if (ds?.size === 1) { d = [...ds][0]; unic++; }
  else if (ds?.size > 1) { d = ext.get(`${b}|${new Date(c.t0).toISOString()}|${c.km}`) ?? null; if (d != null) potrivite++; }
  if (d == null) { lipsa++; lipsaPe[b] = (lipsaPe[b] ?? 0) + 1; }
  c.dev = d; c.dispozitiv = d;
}
scrieAtomic(OUT, JSON.stringify(V));
console.log(`dispozitiv: ${V.curse.length} curse · un singur dispozitiv ${unic} · plăci duble potrivite (t0, km) ${potrivite} · fără id ${lipsa} ${JSON.stringify(lipsaPe)}`);
