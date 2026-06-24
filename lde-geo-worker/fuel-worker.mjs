// ============================================================================
// LDE Fuel worker — importă alimentările din Benzol (MySQL) în lde_fuel_alimentari.
// Idempotent prin UNIQUE(source, external_id). Doar mașinile NOASTRE (plăcuța în flotă).
// Rulare: node --env-file=.env fuel-worker.mjs [YYYY-MM-DD start] [--write]
// Implicit: ultimele 45 zile.
// ============================================================================
import mysql from 'mysql2/promise';
import { WebSocket as WS } from 'ws';
import { createClient } from '@supabase/supabase-js';
globalThis.WebSocket = globalThis.WebSocket || WS;

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const START = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || (() => { const d = new Date(); d.setDate(d.getDate() - 45); return d.toISOString().slice(0, 10); })();
const DBS = ['benzol', 'benzol2']; // benzol3 = moartă (doar 2020)
const normPlate = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ── Supabase + harta plăcuță→mașină ──
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const { data: vehs, error: ve } = await supa.from('vehicles').select('id,plate_number').eq('active', true);
if (ve) { console.error('Supabase vehicles:', ve.message); process.exit(1); }
const plate2veh = new Map(vehs.map(v => [normPlate(v.plate_number), v.id]));

// ── Benzol MySQL ──
const my = await mysql.createConnection({ host: process.env.BENZOL_HOST, port: +process.env.BENZOL_PORT, user: process.env.BENZOL_USER, password: process.env.BENZOL_PASS });

function toIso(data, ora) { // data=DDMMYYYY, ora=HHMM (Moldova local, iunie = +03:00)
  const dd = data.slice(0, 2), mm = data.slice(2, 4), yyyy = data.slice(4, 8);
  const o = String(ora || '').padStart(4, '0'); const HH = o.slice(0, 2), MI = o.slice(2, 4);
  return `${yyyy}-${mm}-${dd}T${HH}:${MI}:00+03:00`;
}

let scanned = 0, ours = 0, byDb = {};
const records = [];
for (const db of DBS) {
  const [rows] = await my.query(
    `SELECT id, data, ora, litri, nr FROM \`${db}\`.benzol WHERE STR_TO_DATE(data,'%d%m%Y') >= ? ORDER BY id`, [START]);
  byDb[db] = { total: rows.length, ours: 0 };
  for (const r of rows) {
    scanned++;
    const plate = normPlate(r.nr);
    const vid = plate2veh.get(plate);
    if (!vid) continue; // client extern — ignorăm
    ours++; byDb[db].ours++;
    const iso = toIso(String(r.data), String(r.ora));
    if (isNaN(new Date(iso).getTime())) continue; // dată coruptă
    records.push({ vehicle_id: vid, alimentat_at: iso, litri: Number(r.litri) || 0, statie: db, source: db, external_id: String(r.id), is_full: false, imported_at: new Date().toISOString() });
  }
}
await my.end();

console.log(`Benzol scanat din ${START}: ${scanned} rânduri | ale noastre: ${ours}`);
for (const db of DBS) console.log(`  ${db}: ${byDb[db].total} total, ${byDb[db].ours} ale noastre`);

if (WRITE && records.length) {
  let written = 0;
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    const { error } = await supa.from('lde_fuel_alimentari').upsert(chunk, { onConflict: 'source,external_id' });
    if (error) { console.error(`  ! upsert chunk ${i}: ${error.message}`); break; }
    written += chunk.length;
  }
  console.log(`Scris (upsert): ${written} alimentări în lde_fuel_alimentari`);
} else if (!WRITE) {
  console.log(`DRY — ar scrie ${records.length} alimentări (rulează cu --write)`);
}
