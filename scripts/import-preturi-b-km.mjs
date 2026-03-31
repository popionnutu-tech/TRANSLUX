#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlFile = process.argv[2] || join(__dirname, '../../../Downloads/CC.sql');
const sql = readFileSync(sqlFile, 'utf8');

const blocks = sql.match(/INSERT INTO `n_preturi_b_km`[^;]+;/gs);
if (!blocks) { console.log('No n_preturi_b_km found'); process.exit(1); }

const rows = [];
for (const block of blocks) {
  const re = /\((\d+),\s*(\d+),\s*(\d+),\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(\d+),\s*(\d+)\)/g;
  let m;
  while ((m = re.exec(block))) {
    rows.push({
      id: parseInt(m[1]),
      id_r: parseInt(m[2]),
      pret_c: parseInt(m[3]),
      ora_c: m[4],
      name_ro: m[5],
      name_ru: m[6],
      ora_n: m[7],
      pret_n: parseInt(m[8]),
      afisam: parseInt(m[9]) === 1,
    });
  }
}

console.log(`Parsed ${rows.length} fare rows`);

const validIds = new Set([1,2,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29]);
function esc(s) { return s.replace(/'/g, "''"); }

let out = 'BEGIN;\n';
let skipped = 0;

for (const r of rows) {
  if (!validIds.has(r.id_r)) { skipped++; continue; }
  out += `INSERT INTO crm_stop_fares (id, crm_route_id, price_from_chisinau, hour_from_chisinau, name_ro, name_ru, hour_from_nord, price_from_nord, is_visible) VALUES (${r.id}, ${r.id_r}, ${r.pret_c}, '${esc(r.ora_c)}', '${esc(r.name_ro)}', '${esc(r.name_ru)}', '${esc(r.ora_n)}', ${r.pret_n}, ${r.afisam}) ON CONFLICT (id) DO NOTHING;\n`;
}

out += 'COMMIT;\n';
console.log(`Skipped ${skipped} rows`);

const outPath = join(__dirname, 'output/crm-stop-fares.sql');
writeFileSync(outPath, out, 'utf8');
console.log(`Generated: ${outPath}`);
