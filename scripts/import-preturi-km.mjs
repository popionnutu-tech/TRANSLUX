#!/usr/bin/env node
/**
 * Parse n_preturi_km from CC.sql and generate Supabase INSERT SQL
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlFile = process.argv[2] || join(__dirname, '../../../Downloads/CC.sql');

const sql = readFileSync(sqlFile, 'utf8');

// Extract all INSERT blocks for n_preturi_km
const blocks = sql.match(/INSERT INTO `n_preturi_km`[^;]+;/gs);
if (!blocks) { console.log('No n_preturi_km found'); process.exit(1); }

const rows = [];
for (const block of blocks) {
  const re = /\((\d+),\s*(\d+),\s*([\d.]+),\s*(\d+),\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(\d+),\s*([\d.]+),\s*'([^']*)'\)/g;
  let m;
  while ((m = re.exec(block))) {
    rows.push({
      id: parseInt(m[1]),
      id_r: parseInt(m[2]),
      km_c: parseFloat(m[3]),
      time_c: parseInt(m[4]),
      ora_c: m[5],
      name_ro: m[6],
      name_ru: m[7],
      ora_n: m[8],
      time_n: parseInt(m[9]),
      km_n: parseFloat(m[10]),
      afisam: m[11] === '1',
    });
  }
}

console.log(`Parsed ${rows.length} price rows`);

// Valid crm_route_ids (n_rute ids that exist)
const validIds = new Set([1,2,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29]);

function esc(s) { return s.replace(/'/g, "''"); }

let out = 'BEGIN;\n';
let skipped = 0;

for (const r of rows) {
  if (!validIds.has(r.id_r)) { skipped++; continue; }
  out += `INSERT INTO crm_stop_prices (id, crm_route_id, km_from_chisinau, time_from_chisinau, hour_from_chisinau, name_ro, name_ru, hour_from_nord, time_from_nord, km_from_nord, is_visible) VALUES (${r.id}, ${r.id_r}, ${r.km_c}, ${r.time_c}, '${esc(r.ora_c)}', '${esc(r.name_ro)}', '${esc(r.name_ru)}', '${esc(r.ora_n)}', ${r.time_n}, ${r.km_n}, ${r.afisam}) ON CONFLICT (id) DO NOTHING;\n`;
}

out += `SELECT setval('crm_stop_prices_id_seq', (SELECT COALESCE(MAX(id),1) FROM crm_stop_prices));\n`;
out += 'COMMIT;\n';

console.log(`Skipped ${skipped} rows (route id not in crm_routes)`);

const outPath = join(__dirname, 'output/crm-stop-prices.sql');
writeFileSync(outPath, out, 'utf8');
console.log(`Generated: ${outPath} (${out.split('\n').length} lines)`);
