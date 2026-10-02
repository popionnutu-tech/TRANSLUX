// ============================================================================
// Nopțile mașinilor pentru agrearea șoferilor (ION-174, pagina /lde/agreare).
//
// Unde a dormit mașina = localitatea din care a pornit ziua, din lde_harta_zi (date->'iv'->0->>'de';
// harta o scrie lanțul săptămânal al fiecărei uzine, din GPS-ul nostru; la Drăxlmaier iv[0].de e o coordonată, iar
// numele stă în sumar.locuri[0]) → lde_noapte_zi, pe mașină și zi.
// Fără MEJGOROD (șoferul vine din grafic) și fără CAMIOANE. Ion, 02.10.2026: «de LDE trebuie să ne
// refuzăm» — nicio foaie de parcurs LDE aici, doar datele noastre.
//
// Rulare: node --env-file=.env noapte-worker.mjs [YYYY-MM-DD start|--all] [--write]
// Implicit: ultimele 21 de zile. --all: din 2026-08-01. Fără --write: raport. Idempotent (upsert pe plate+zi).
// ============================================================================
import { WebSocket as WS } from 'ws';
import { createClient } from '@supabase/supabase-js';
globalThis.WebSocket = globalThis.WebSocket || WS;

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const ALL = args.includes('--all');
const zileInUrma = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const START = ALL ? '2026-08-01' : args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || zileInUrma(21);
const FARA_UZINE = new Set(['MEJGOROD', 'CAMIOANE']);

for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
  if (!process.env[k]) { console.error(`lipsește ${k} în .env`); process.exit(1); }
}
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// o mașină poate fi pe harta a două uzine în aceeași zi (SEBN + LEAR Florești): o singură noapte pe plate+zi
const nopti = new Map();
const peUzina = {};
// Rândul lde_harta_zi are ~20 KB de jsonb; extragerea date->iv->0->>de pe o lună întreagă într-o singură
// cerere pică pe «statement timeout» (instanța NANO). De aceea: ferestre de 3 zile, pagini de 200.
const ziPlus = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const AZI = new Date().toISOString().slice(0, 10);
for (let de = START; de <= AZI; de = ziPlus(de, 3)) {
  const pana = ziPlus(de, 2);
  for (let off = 0; ; off += 200) {
    const { data, error } = await supa.from('lde_harta_zi').select('m, z, uzina, de:date->iv->0->>de, loc0:sumar->locuri->0')
      .gte('z', de).lte('z', pana).order('z').order('m').range(off, off + 199);
    if (error) { console.error(`Supabase lde_harta_zi (${de}–${pana}):`, error.message); process.exit(1); }
    for (const r of data) {
      if (FARA_UZINE.has(r.uzina)) continue;
      // Drăxlmaier scrie în iv[0].de coordonate, nu un nume; numele nopții stă în sumar.locuri[0]
      const loc = r.de && !/^\s*\[/.test(String(r.de)) ? String(r.de) : (r.loc0 ? String(r.loc0) : null);
      if (!loc) continue;
      peUzina[r.uzina] = (peUzina[r.uzina] || 0) + 1;
      const k = `${r.m}|${r.z}`;
      if (!nopti.has(k)) nopti.set(k, { plate: r.m, zi: r.z, uzina: r.uzina, loc: loc.slice(0, 80), imported_at: new Date().toISOString() });
    }
    if (data.length < 200) break;
  }
}
const lista = [...nopti.values()];
console.log(`Nopți din harta mașinii din ${START}: ${lista.length} (mașină × zi)`);
for (const [u, n] of Object.entries(peUzina)) console.log(`  ${u}: ${n}`);

if (!WRITE) { console.log(`DRY — ar scrie ${lista.length} rânduri în lde_noapte_zi (rulează cu --write)`); process.exit(0); }

for (let i = 0; i < lista.length; i += 500) {
  const { error } = await supa.from('lde_noapte_zi').upsert(lista.slice(i, i + 500), { onConflict: 'plate,zi' });
  if (error) { console.error(`  ! upsert nopți ${i}: ${error.message}`); process.exit(1); }
}
console.log(`Scris (upsert): ${lista.length} rânduri în lde_noapte_zi`);
