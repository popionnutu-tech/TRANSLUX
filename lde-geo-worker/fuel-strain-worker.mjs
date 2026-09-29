// ============================================================================
// Fuel strain worker — tot combustibilul alimentat în afara flotei noastre → lde_fuel_strain (ION-134).
//
// Surse (aceleași ca la fuel-worker și lde-alim-worker, doar partea pe care ele o aruncă):
//   benzol, benzol2 — stațiile proprii (MySQL benzol), cu oră;
//   foaie           — coloana `litri` de pe foile de parcurs LDE pz_* (baza raznareadca), pe zi.
// O alimentare intră aici dacă plăcuța ei NU e în vehicles (vezi fuel-common.vehicleMap — aceeași regulă
// ca la celelalte două importuri). Categoria: 'masina' dacă arată a plăcuță, altfel 'nume' (VINZARE,
// CONSUMINTE, COMBINA, PROTOCOL…). Rândurile care între timp au devenit ale unei mașini din flotă, sau au
// dispărut / au fost puse pe 0 la sursă, se scot din fereastra rulată.
//
// Rulare: node --env-file=.env fuel-strain-worker.mjs [YYYY-MM-DD start|--all] [--write]
// Implicit: ultimele 45 de zile. Fără --write: doar raportul.
// ============================================================================
import mysql from 'mysql2/promise';
import { WebSocket as WS } from 'ws';
import { createClient } from '@supabase/supabase-js';
import { normPlate, vehicleMap, benzolIso, selectAll } from './fuel-common.mjs';
globalThis.WebSocket = globalThis.WebSocket || WS;

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const START = args.includes('--all') ? '2000-01-01'
  : args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || (() => { const d = new Date(); d.setDate(d.getDate() - 45); return d.toISOString().slice(0, 10); })();
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Chisinau' });
// MD (123ABC, ABC123, 123ABCD), RO (B123ABC), UA (AI9071..); restul = nume
const PLATE = /^(\d{3}[A-Z]{3,4}|[A-Z]{2,3}\d{3,4}|[A-Z]{1,2}\d{2,4}[A-Z]{1,3}|\d{2,4}[A-Z]{2,4})$/;

for (const k of ['BENZOL_HOST', 'BENZOL_PORT', 'BENZOL_USER', 'BENZOL_PASS', 'LDE_DB_USER', 'LDE_DB_PASS', 'LDE_DB_NAME']) {
  if (!process.env[k]) { console.error(`lipsește ${k} în .env`); process.exit(1); }
}
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const plate2veh = await vehicleMap(supa);
const host = { host: process.env.BENZOL_HOST, port: +process.env.BENZOL_PORT, connectTimeout: 20000 };
const clip = (s, n) => { const t = String(s ?? '').trim(); return t && t !== 'Alege' ? t.slice(0, n) : null; };

const records = [];
const stat = {};
const push = (r) => {
  records.push(r);
  const s = stat[r.sursa] ||= { n: 0, l: 0, masina: 0, nume: 0 };
  s.n++; s.l += r.litri; s[r.categorie]++;
};

// ── benzol, benzol2: tot ce nu e al flotei ──
const b = await mysql.createConnection({ ...host, user: process.env.BENZOL_USER, password: process.env.BENZOL_PASS });
for (const db of ['benzol', 'benzol2']) {
  const [rows] = await b.query(
    `SELECT id, data, ora, litri, nr FROM \`${db}\`.benzol WHERE STR_TO_DATE(LPAD(data, 8, '0'), '%d%m%Y') >= ?`, [START]);
  for (const r of rows) {
    const p = normPlate(r.nr);
    if (plate2veh.has(p)) continue; // al flotei → fuel-worker
    const t = benzolIso(r.data, r.ora);
    const litri = Math.round(Number(r.litri) * 100) / 100;
    if (!t || t.zi > TODAY || !(litri > 0) || litri >= 1e7) continue;
    push({ sursa: db, external_id: String(r.id), placuta: String(r.nr ?? '').trim() || '(gol)', placuta_norm: p || '(GOL)',
      categorie: PLATE.test(p) ? 'masina' : 'nume', zi: t.zi, alimentat_at: t.iso, litri,
      foaie: null, sofer: null, observatii: null });
  }
}
await b.end();

// ── foi LDE pz_*: coloana litri (litri_a = benzol, deja mai sus) ──
const l = await mysql.createConnection({ ...host, user: process.env.LDE_DB_USER, password: process.env.LDE_DB_PASS, database: process.env.LDE_DB_NAME });
const [cols] = await l.query(`SELECT table_name t, GROUP_CONCAT(column_name) c FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name LIKE 'pz\\_%' GROUP BY table_name`);
for (const { t, c } of cols) {
  const has = new Set(c.split(','));
  if (!['id', 'masina', 'data', 'litri'].every(n => has.has(n))) continue;
  const [rows] = await l.query(
    `SELECT id, data, masina, litri${has.has('sofer') ? ', sofer' : ''}${has.has('observatii') ? ', observatii' : ''}
     FROM \`${t}\` WHERE litri > 0 AND data LIKE '____.__.__' AND data >= ?`, [START.replace(/-/g, '.')]);
  for (const r of rows) {
    const p = normPlate(r.masina);
    if (plate2veh.has(p)) continue; // al flotei → lde-alim-worker
    const zi = String(r.data).replace(/\./g, '-');
    const litri = Math.round(Number(r.litri) * 100) / 100;
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(zi) || zi > TODAY || !(litri > 0) || litri >= 1e7) continue;
    push({ sursa: 'foaie', external_id: `${t}:${r.id}`, placuta: String(r.masina ?? '').trim() || '(gol)', placuta_norm: p || '(GOL)',
      categorie: PLATE.test(p) ? 'masina' : 'nume', zi, alimentat_at: null, litri,
      foaie: t, sofer: clip(r.sofer, 120), observatii: clip(r.observatii, 300) });
  }
}
await l.end();

console.log(`Străine din ${START}: ${records.length} alimentări`);
for (const [s, v] of Object.entries(stat)) console.log(`  ${s}: ${v.n} (${v.masina} plăcuțe, ${v.nume} nume), ${Math.round(v.l)} l`);
if (!WRITE) { console.log('DRY — rulează cu --write'); process.exit(0); }

const now = new Date().toISOString();
let written = 0;
for (let i = 0; i < records.length; i += 500) {
  const chunk = records.slice(i, i + 500).map(r => ({ ...r, imported_at: now }));
  const { error } = await supa.from('lde_fuel_strain').upsert(chunk, { onConflict: 'sursa,external_id' });
  if (error) { console.error(`  ! upsert chunk ${i}: ${error.message}`); process.exit(1); }
  written += chunk.length;
}
console.log(`Scris (upsert): ${written} rânduri în lde_fuel_strain`);

// În fereastră, tot ce n-a mai venit la rularea asta: plăcuța a intrat în flotă, rândul a dispărut sau e 0.
const keep = new Set(records.map(r => `${r.sursa}:${r.external_id}`));
const inDb = await selectAll(() => supa.from('lde_fuel_strain').select('id,sursa,external_id').gte('zi', START).order('id'));
const stale = inDb.filter(r => !keep.has(`${r.sursa}:${r.external_id}`)).map(r => r.id);
for (let i = 0; i < stale.length; i += 200) {
  const { error } = await supa.from('lde_fuel_strain').delete().in('id', stale.slice(i, i + 200));
  if (error) { console.error(`  ! delete: ${error.message}`); process.exit(1); }
}
console.log(`Scos: ${stale.length} rânduri (intrate în flotă sau dispărute la sursă)`);
