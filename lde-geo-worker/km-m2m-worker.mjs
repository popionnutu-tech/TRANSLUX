// ============================================================================
// km-m2m worker — km pe mașină × zi din baza LDE (raznareadca.km_m2m) → lde_km_m2m (ION-135).
// Pentru norma faptică pe /lde/combustibil acolo unde GPS-ul nostru (lde_vehicle_gps_daily, din 10.06.2026)
// n-are km. Doar mașinile din vehicles (fuel-common.vehicleMap — aceeași regulă ca la combustibil); rândurile
// marcate delete=1 în LDE nu intră, iar cele șterse sau marcate între timp se scot din fereastra rulată.
//
// Rulare: node --env-file=.env km-m2m-worker.mjs [YYYY-MM-DD start|--all] [--write]
// Implicit: ultimele 45 de zile. Fără --write: doar raportul.
// ============================================================================
import mysql from 'mysql2/promise';
import { WebSocket as WS } from 'ws';
import { createClient } from '@supabase/supabase-js';
import { normPlate, vehicleMap, selectAll } from './fuel-common.mjs';
globalThis.WebSocket = globalThis.WebSocket || WS;

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const START = args.includes('--all') ? '2000-01-01'
  : args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || (() => { const d = new Date(); d.setDate(d.getDate() - 45); return d.toISOString().slice(0, 10); })();
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Chisinau' });

for (const k of ['BENZOL_HOST', 'BENZOL_PORT', 'LDE_DB_USER', 'LDE_DB_PASS', 'LDE_DB_NAME']) {
  if (!process.env[k]) { console.error(`lipsește ${k} în .env`); process.exit(1); }
}
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const plate2veh = await vehicleMap(supa);

const l = await mysql.createConnection({ host: process.env.BENZOL_HOST, port: +process.env.BENZOL_PORT, connectTimeout: 20000,
  user: process.env.LDE_DB_USER, password: process.env.LDE_DB_PASS, database: process.env.LDE_DB_NAME });
// data e DATE (zi locală) — o formatăm în SQL, ca fusul orar al procesului să n-o mute
const [rows] = await l.query(
  `SELECT id, DATE_FORMAT(data, '%Y-%m-%d') zi, masina, sofer, directia, km FROM km_m2m
   WHERE \`delete\` = 0 AND data >= ? ORDER BY id`, [START]);
await l.end();

const records = [];
const straine = new Map();
let bad = 0;
for (const r of rows) {
  const vid = plate2veh.get(normPlate(r.masina));
  if (!vid) { straine.set(r.masina, (straine.get(r.masina) || 0) + 1); continue; }
  const km = Math.round(Number(r.km) * 100) / 100;
  if (!r.zi || r.zi > TODAY || !(km >= 0) || km >= 5000) { bad++; continue; }
  records.push({ vehicle_id: vid, zi: r.zi, km, sofer: r.sofer && r.sofer !== 'Alege' ? String(r.sofer).slice(0, 120) : null,
    directia: r.directia ? String(r.directia).slice(0, 60) : null, external_id: String(r.id) });
}
console.log(`km_m2m din ${START}: ${rows.length} rânduri | ale flotei: ${records.length} | plăcuțe străine: ${straine.size} | greșite: ${bad}`);
console.log(`  km flotă: ${Math.round(records.reduce((s, r) => s + r.km, 0))}`);
if (!WRITE) { console.log('DRY — rulează cu --write'); process.exit(0); }

const now = new Date().toISOString();
for (let i = 0; i < records.length; i += 500) {
  const { error } = await supa.from('lde_km_m2m').upsert(records.slice(i, i + 500).map(r => ({ ...r, imported_at: now })), { onConflict: 'external_id' });
  if (error) { console.error(`  ! upsert chunk ${i}: ${error.message}`); process.exit(1); }
}
console.log(`Scris (upsert): ${records.length} rânduri în lde_km_m2m`);

const keep = new Set(records.map(r => r.external_id));
const inDb = await selectAll(() => supa.from('lde_km_m2m').select('id,external_id').gte('zi', START).order('id'));
const stale = inDb.filter(r => !keep.has(r.external_id)).map(r => r.id);
for (let i = 0; i < stale.length; i += 200) {
  const { error } = await supa.from('lde_km_m2m').delete().in('id', stale.slice(i, i + 200));
  if (error) { console.error(`  ! delete: ${error.message}`); process.exit(1); }
}
console.log(`Scos: ${stale.length} rânduri (șterse sau marcate delete în LDE)`);
