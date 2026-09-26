// poarta.mjs <export|write> <sursa rezolvată> — vezi poarta.sh. POARTA_VERDICT=<cale sub rulari/> testează un verdict anume (probe).
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const [mod, SRC] = process.argv.slice(2); const DRAX = '/root/lde-worker/drax', BAZA = '/home/verif/verificator', RUL = BAZA + '/rulari';
const INTRARI = ['schelet-ideal', 'obs-ideal', 'etalon-ideal', 'curse-ideal', 'regulate-ideal', 'schimburi-ideal', 'care-schimb-ideal', 'dubluri-ideal', 'nomenclator'];
if (!['export', 'write'].includes(mod) || !SRC) { console.error('folosire: poarta.mjs <export|write> <sursa>'); process.exit(2); }
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const eDrax = SRC === realpathSync(join(DRAX, 'date'));
const fisier = f => { const p = join(SRC, f + '.json'); if (existsSync(p)) return realpathSync(p); if (f === 'nomenclator' && !eDrax) return realpathSync(join(DRAX, 'date', f + '.json')); return null; };
const SCRIPTURI = ['drax.mjs', 'etalon-gps.mjs', 'filtru-rupte.mjs', 'c4.mjs', 'poarta.sh', 'poarta.mjs']; const shaScript = Object.fromEntries(SCRIPTURI.map(f => [f, sha(join(BAZA, 'cod', f))]));
let candidati;
if (process.env.POARTA_VERDICT) { let p; try { p = realpathSync(process.env.POARTA_VERDICT); } catch { console.error('POARTA_VERDICT inexistent'); process.exit(2); }
  if (!p.startsWith(realpathSync(RUL) + '/')) { console.error(`POARTA_VERDICT în afara ${RUL} — refuz`); process.exit(2); } candidati = [p]; }
else candidati = readdirSync(RUL).filter(d => d.startsWith('drax-')).map(d => join(RUL, d, 'out', 'verdict.json')).filter(existsSync);
const valid = [], respinse = [];
for (const p of candidati) { try {   // un candidat corupt se sare (L6), nu închide toate sursele
  const d = join(p, '..'), R = join(d, '..'); const sig = readFileSync(join(d, 'SIGILIU'), 'utf8'), inch = existsSync(join(R, 'INCHIS')) ? readFileSync(join(R, 'INCHIS'), 'utf8') : '';
  const V = JSON.parse(readFileSync(p, 'utf8')); const src = existsSync(V.verif_src || '') ? realpathSync(V.verif_src) : null;
  if (src !== SRC) continue;
  const mot = []; if (!sig.includes(`verdict ${sha(p)}`)) mot.push('sigiliu invalid'); if (!inch.startsWith('ok')) mot.push('rulare neînchisă'); if (V.proba) mot.push('verdict de probă');
  const alt = SCRIPTURI.filter(f => !sig.includes(`${f} ${shaScript[f]}`)); if (alt.length) mot.push(`alt cod decât cel instalat: ${alt.join(', ')} (L8, Codex r2 C2)`);
  if (mot.length) respinse.push(`${p}: ${mot.join(', ')}`); else valid.push(V);
} catch (e) { respinse.push(`${p}: ilizibil (${e.message.slice(0, 60)})`); } }
valid.sort((a, b) => b.rulat_la.localeCompare(a.rulat_la)); const V = valid[0];
if (!V) { console.error(`POARTA ÎNCHISĂ: niciun verdict sigilat, închis, cu scriptul de acum, pentru ${SRC}` + (respinse.length ? '\n  ' + respinse.slice(0, 5).join('\n  ') : '')); process.exit(3); }
const err = [], lista = []; if (!V.valid_pentru_export) err.push(`verdictul ${V.rulat_la} are ${V.blocante.length} blocante (${[...new Set(V.blocante.map(b => b.id))].join(', ')})`);
if (!eDrax && !existsSync(join(SRC, 'GATA'))) err.push('candidatul n-are marcajul GATA al producătorului');
for (const f of INTRARI) { const p = fisier(f), i = V.intrari[f + '.json']; if (!p) { err.push(`${f}: lipsește din sursă`); continue; } if (!i) { err.push(`${f}: lipsește din verdict`); continue; }
  const h = sha(p); if (i.sursa !== p) err.push(`${f}: sursa ${p} ≠ verificată ${i.sursa}`); if (h !== i.sha256) err.push(`${f}: sha256 diferit de cel verificat`); lista.push(`${h}  ${p}`); }
if (err.length) { console.error('POARTA ÎNCHISĂ:\n  ' + err.join('\n  ')); process.exit(3); }
console.log(lista.join('\n')); console.error(`POARTA DESCHISĂ (${mod}, ${SRC}): verdictul ${V.rulat_la} · ${V.versiune} · ${INTRARI.length} intrări cu sha256 egal`);
