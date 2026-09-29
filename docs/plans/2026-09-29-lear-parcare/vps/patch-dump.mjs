import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
const F = '/root/lde-worker/lear-analiza.mjs';
let s = readFileSync(F, 'utf8');
if (s.includes('ION-144 dump')) { console.log('deja'); process.exit(0); }
if (!existsSync(F + '.bak-ion144')) copyFileSync(F, F + '.bak-ion144');
const a = "const WRITE = process.argv.includes('--write');\n";
if (!s.includes(a)) throw new Error('ancora WRITE');
s = s.replace(a, a + "// ION-144 dump: --dump <fișier> scrie urmele săptămânii și rutele fiecărei mașini a uzinei, pentru lear-parcare.mjs (parcarea propusă). Nu schimbă nimic altceva.\nconst DUMP = arg('--dump'); const DUMP_M = [];\n");
const b = "\n  masini.push(rec);\n}\n";
if (s.split(b).length !== 2) throw new Error('ancora push');
s = s.replace(b, "\n  if (DUMP) DUMP_M.push({ m: v.masina, casa, casaC, rute: alese.map(r => ({ id: r.id, tura: r.tura, capat: r.capat, capatC: r.capatC, tinta: r.tinta, capat_atins: r.capat_atins, curse: r.curse })),\n    comasate: comasate.map(c => ({ id: c.id, capat: c.capat, capatC: c.capatC })), zile: zile.filter(z => (v.kmZi.get(z) || 0) > 20).sort(),\n    pts: v.pts.map(p => [+p.t, +p.lat.toFixed(5), +p.lon.toFixed(5), p.v]) });\n  masini.push(rec);\n}\n");
const c = "const CALE_JSON = arg('--json');\n";
if (!s.includes(c)) throw new Error('ancora json');
s = s.replace(c, c + "if (DUMP) { writeFileSync(DUMP, JSON.stringify({ uzina: UZINA_ID, nume: UZINA_NUME, saptamina: sapt.luni, pana_la: sapt.duminica, poarta: POARTA, parc: PARC, ferestre, zileLucru, masini: DUMP_M })); console.log(`dump ${DUMP}: ${DUMP_M.length} mașini`); }\n");
writeFileSync(F, s); console.log('ok');
