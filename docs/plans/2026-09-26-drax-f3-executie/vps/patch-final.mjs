// Execuție F3 (ION-94), pasul A.3: prototipurile vps/ → fișierele livrate în drax/cod/saptamanal/ (diferențele din plan).
import { readFileSync, writeFileSync } from 'node:fs';
const D = process.argv[2];
const ed = (f, pasi) => { let s = readFileSync(`${D}/${f}`, 'utf8');
  for (const [a, b] of pasi) { if (!s.includes(a)) throw new Error(`${f}: lipsește «${a.slice(0, 60)}»`); s = s.replace(a, b); }
  writeFileSync(`${D}/${f}`, s); console.log(`${f}: ${pasi.length} schimbări`); };

ed('saptamanal.sh', [
  ['v5. PROTOTIP «cercetează»: --write e primit, dar scrie-analiza nu scrie în bază.', 'v5, livrat de «execută» (ION-94) 26.09.2026. Cu --write, scrie-analiza.mjs face upsert în lde_analiza_reguli.'],
  ['datele în ECON_D (niciodată peste datele F2). În prototip din copia ./econ/\n# (singurele diferențe: `D = process.env.ECON_D || …` și câmpurile aditive nelamuritLista / curseDePranz).',
   'datele în ECON_D (niciodată peste datele F2): drax/cod/economie/comun.mjs\n# citește `D = process.env.ECON_D || …`; alternative.mjs are câmpurile aditive nelamuritLista / curseDePranz (probele a, b din 26.09).'],
  ['cd "$AICI/econ"', 'cd "$AICI/../economie"'],
]);
ed('liber.mjs', [
  [' [--modul proto|orig]', ''],
  ["// DRAX_MODUL_TL există DOAR în prototipul «cercetează» (modulul extins nu e încă livrat); «execută» îl scoate.\nconst MODUL = process.env.DRAX_MODUL_TL || '/root/lde-worker/lear-timp-liber.mjs';",
   "// Import FIX (execuție ION-94): fără variabilă de mediu care să-l înlocuiască.\nconst MODUL = '/root/lde-worker/lear-timp-liber.mjs';"],
]);
ed('scrie-analiza.mjs', [
  ['// PROTOTIP «cercetează» F3: --write e primit (forma exactă din blocul de luni) dar IGNORAT — nimic scris în bază.',
   '// Cu --write: upsert REST în lde_analiza_reguli (on_conflict=uzina,saptamina, rulat_la = acum), DOAR cu P10 și P10c trecute și\n// invarianții de mai jos; altfel analiza-respinsa.json și cod 1 (paznicul vede lipsa rândului). Fără --write: doar analiza.json.'],
  ["if (WRITE) console.log('PROTOTIP: --write primit și IGNORAT — nimic scris în bază (se pornește în «execută»)');\n", ''],
  ["console.log(`${luni} → ${dum}: ${note} · top: ${indicatii.top.map((x) => `${x.m} ${x.R1bR3}`).join(', ') || '—'} · date ${(s.length / 1024).toFixed(0)} KB · (prototip: nimic scris în bază)`);",
   `console.log(\`\${luni} → \${dum}: \${note} · top: \${indicatii.top.map((x) => \`\${x.m} \${x.R1bR3}\`).join(', ') || '—'} · date \${(s.length / 1024).toFixed(0)} KB\`);
if (!WRITE) { console.log('(fără --write, nimic scris în bază)'); process.exit(0); }
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SB || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY lipsesc (--env-file=/root/lde-worker/.env)'); process.exit(1); }
const r = await fetch(\`\${SB}/rest/v1/lde_analiza_reguli?on_conflict=uzina,saptamina\`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: \`Bearer \${KEY}\`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ uzina: 'DRAXELMAIER', saptamina: luni, rulat_la: new Date().toISOString(), date, note }),
});
if (!r.ok) { console.error(\`lde_analiza_reguli: HTTP \${r.status} \${(await r.text()).slice(0, 300)}\`); process.exit(1); }
console.log(\`scris: lde_analiza_reguli DRAXELMAIER \${luni}\`);`],
]);
