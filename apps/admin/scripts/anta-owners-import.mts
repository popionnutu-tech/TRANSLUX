// Încarcă proprietarii firmelor ANTA (scripts/anta/owners.json) în anta_companies (ION-13).
//
//   cd apps/admin && node --env-file=.env --import tsx scripts/anta-owners-import.mts
//
// Rescrie tabela întreg. owners.json e strâns o dată din registrele publice (srl.md, informer.md,
// overit.md, infobiz.md); când se adaugă firme noi în graficul ANTA, se completează fișierul și se rulează iar.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pick = async (p: string) => { const m: any = await import(p); return m.default ?? m; };
const S: any = await pick('../src/lib/supabase');

const HERE = dirname(fileURLToPath(import.meta.url));
const rows: any[] = JSON.parse(readFileSync(join(HERE, 'anta', 'owners.json'), 'utf8'));
const seen = new Set<string>();
const clean = rows.filter((r) => { if (seen.has(r.company)) return false; seen.add(r.company); return true; })
  .map((r) => ({
    company: String(r.company).trim(),
    idno: r.idno ?? null,
    official_name: r.official_name ?? null,
    administrator: r.administrator ?? null,
    founders: Array.isArray(r.founders) ? r.founders : [],
    source: r.source ?? null,
    note: r.note ?? null,
    fetched_at: r.fetched_at ?? null,
  }));

const db = S.getSupabase();
const must = (r: { error: any }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); };
must(await db.from('anta_companies').delete().gte('id', 0), 'șterge');
for (let i = 0; i < clean.length; i += 200) must(await db.from('anta_companies').insert(clean.slice(i, i + 200)), 'inserare');

// verificare: câte firme din anta_courses.operator au rând aici
const { data: ops } = await db.rpc('anta_operators');
const N: any = await pick('../src/lib/anta/names');
const missing = new Set<string>();
for (const o of (ops ?? []) as Array<{ operator: string }>) for (const c of N.splitOperator(o.operator)) if (!seen.has(c)) missing.add(c);
console.log(`scris: ${clean.length} firme; cu IDNO ${clean.filter((c) => c.idno).length}; fără nici un nume ${clean.filter((c) => !c.administrator && !c.founders.length).length}`);
console.log(`firme din graficul ANTA fără rând în owners.json: ${missing.size}`, [...missing].slice(0, 20));
