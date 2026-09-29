// ============================================================================
// LDE foaie worker — importă litrii scriși de operator pe foile de parcurs LDE (baza MySQL
// «raznareadca», coloana `litri` din tabelele pz_*) în lde_fuel_foaie, pe mașină și zi (ION-132).
//
// De ce doar `litri`: pe aceleași foi, `litri_a` + `litri_ora` le scrie programul benzol (benzol_log)
// = alimentările de la stațiile proprii, deja în lde_fuel_alimentari din fuel-worker. `litri` e ce
// introduce operatorul — Chișinău (pz_c) și Ungheni (pz_u) aproape numai așa, ~70.000 l/lună care
// lipsesc din benzol. `r_alim_info` e copia benzol2, iar `litri_cec` e gol din 2025.
//
// Doar mașinile NOASTRE (plăcuța în flotă, și inversată, ca la fuel-worker). Idempotent prin
// UNIQUE(external_id = '<foaie>:<id>'). Un rând șters sau pus pe 0 în LDE se scoate și la noi.
//
// Rulare: node --env-file=.env lde-alim-worker.mjs [YYYY-MM-DD start|--all] [--write]
// Implicit: ultimele 45 de zile. Fără --write: doar raportul.
// ============================================================================
import mysql from 'mysql2/promise';
import { WebSocket as WS } from 'ws';
import { createClient } from '@supabase/supabase-js';
globalThis.WebSocket = globalThis.WebSocket || WS;

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const ALL = args.includes('--all');
const START = ALL ? '2000-01-01'
  : args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || (() => { const d = new Date(); d.setDate(d.getDate() - 45); return d.toISOString().slice(0, 10); })();
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Chisinau' });
const normPlate = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const flipPlate = p => { const m = p.match(/^(\d+)([A-Z]+)$/) || p.match(/^([A-Z]+)(\d+)$/); return m ? m[2] + m[1] : null; };

for (const k of ['BENZOL_HOST', 'BENZOL_PORT', 'LDE_DB_USER', 'LDE_DB_PASS', 'LDE_DB_NAME']) {
  if (!process.env[k]) { console.error(`lipsește ${k} în .env`); process.exit(1); }
}

// ── Supabase + harta plăcuță→mașină ──
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const { data: vehs, error: ve } = await supa.from('vehicles').select('id,plate_number').eq('active', true);
if (ve) { console.error('Supabase vehicles:', ve.message); process.exit(1); }
const plate2veh = new Map(vehs.map(v => [normPlate(v.plate_number), v.id]));
for (const v of vehs) { const f = flipPlate(normPlate(v.plate_number)); if (f && !plate2veh.has(f)) plate2veh.set(f, v.id); }

// ── LDE MySQL: toate foile pz_* care au masina + data + litri ──
const my = await mysql.createConnection({
  host: process.env.BENZOL_HOST, port: +process.env.BENZOL_PORT, connectTimeout: 20000,
  user: process.env.LDE_DB_USER, password: process.env.LDE_DB_PASS, database: process.env.LDE_DB_NAME,
});
const [cols] = await my.query(`SELECT table_name t, GROUP_CONCAT(column_name) c FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name LIKE 'pz\\_%' GROUP BY table_name`);
const foi = cols.filter(({ c }) => ['masina', 'data', 'litri', 'id'].every(n => c.split(',').includes(n))).map(x => x.t).sort();
const hasSofer = new Set(cols.filter(({ c }) => c.split(',').includes('sofer')).map(x => x.t));
const hasKm = new Set(cols.filter(({ c }) => c.split(',').includes('km_total')).map(x => x.t));

const records = [];
const perFoaie = {};
let scanned = 0, bad = 0;
for (const t of foi) {
  // data e «YYYY.MM.DD» pe foile vii; formatele vechi (DD.MM.YYYY, '..') nu trec de LIKE
  const [rows] = await my.query(
    `SELECT id, data, masina, litri${hasSofer.has(t) ? ', sofer' : ''}${hasKm.has(t) ? ', km_total' : ''}
     FROM \`${t}\` WHERE litri > 0 AND data LIKE '____.__.__' AND data >= ?`, [START.replace(/-/g, '.')]);
  const s = perFoaie[t] = { randuri: rows.length, ale_noastre: 0, litri: 0 };
  for (const r of rows) {
    scanned++;
    const vid = plate2veh.get(normPlate(r.masina));
    if (!vid) continue; // mașină străină
    const zi = String(r.data).replace(/\./g, '-');
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(zi) || zi > TODAY) { bad++; continue; }
    const litri = Math.round(Number(r.litri) * 100) / 100;
    if (!(litri > 0) || litri >= 1e6) { bad++; continue; }
    s.ale_noastre++; s.litri += litri;
    records.push({ vehicle_id: vid, zi, litri, foaie: t, external_id: `${t}:${r.id}`,
      sofer: r.sofer && r.sofer !== 'Alege' ? r.sofer : null,
      km_total: r.km_total != null && Math.abs(r.km_total) < 1e7 ? Math.round(r.km_total * 100) / 100 : null,
      imported_at: new Date().toISOString() });
  }
}
await my.end();

console.log(`Foi LDE din ${START}: ${scanned} rânduri cu litri | ale noastre: ${records.length} | dată/litri greșite: ${bad}`);
for (const [t, s] of Object.entries(perFoaie)) if (s.randuri) console.log(`  ${t}: ${s.randuri} rânduri, ${s.ale_noastre} ale noastre, ${Math.round(s.litri)} l`);

if (!WRITE) { console.log(`DRY — ar scrie ${records.length} rânduri (rulează cu --write)`); process.exit(0); }

let written = 0;
for (let i = 0; i < records.length; i += 500) {
  const chunk = records.slice(i, i + 500);
  const { error } = await supa.from('lde_fuel_foaie').upsert(chunk, { onConflict: 'external_id' });
  if (error) { console.error(`  ! upsert chunk ${i}: ${error.message}`); process.exit(1); }
  written += chunk.length;
}
console.log(`Scris (upsert): ${written} rânduri în lde_fuel_foaie`);

// Rânduri șterse sau puse pe 0 în LDE în fereastră → le scoatem și la noi (paginat: PostgREST dă max 1000)
const keep = new Set(records.map(r => r.external_id));
const stale = [];
for (let off = 0; ; off += 1000) {
  const { data, error } = await supa.from('lde_fuel_foaie').select('id,external_id')
    .gte('zi', START).order('id').range(off, off + 999);
  if (error) { console.error('Supabase lde_fuel_foaie:', error.message); process.exit(1); }
  for (const r of data) if (!keep.has(r.external_id)) stale.push(r.id);
  if (data.length < 1000) break;
}
for (let i = 0; i < stale.length; i += 200) {
  const { error } = await supa.from('lde_fuel_foaie').delete().in('id', stale.slice(i, i + 200));
  if (error) { console.error(`  ! delete: ${error.message}`); process.exit(1); }
}
console.log(`Scos: ${stale.length} rânduri care nu mai sunt în LDE`);
