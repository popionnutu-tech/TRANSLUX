#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlFile = process.argv[2] || join(__dirname, '../../../Downloads/CC.sql');
const sql = readFileSync(sqlFile, 'utf8');

function esc(s) { return s.replace(/'/g, "''"); }
const validRouteIds = new Set([1,2,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29]);

let out = '';

// ═══════════════════════════════════════════
// 1. n_rute_crm → crm_route_links
// ═══════════════════════════════════════════
out += `-- 1. CRM Route Links (n_rute_crm)
CREATE TABLE IF NOT EXISTS crm_route_links (
  id INT PRIMARY KEY,
  lde_ruta VARCHAR(25),
  crm_ruta VARCHAR(100),
  crm_route_id INT
);

`;

const crmMatch = sql.match(/INSERT INTO `n_rute_crm` \(`id`[^;]+;/s);
if (crmMatch) {
  const re = /\((\d+),\s*'([^']*)',\s*'([^']*)',\s*(\d+)\)/g;
  let m, count = 0;
  while ((m = re.exec(crmMatch[0]))) {
    out += `INSERT INTO crm_route_links (id, lde_ruta, crm_ruta, crm_route_id) VALUES (${m[1]}, '${esc(m[2])}', '${esc(m[3])}', ${m[4]}) ON CONFLICT (id) DO NOTHING;\n`;
    count++;
  }
  console.log(`crm_route_links: ${count} rows`);
}

// ═══════════════════════════════════════════
// 2. n_rutiere → crm_vehicles
// ═══════════════════════════════════════════
out += `\n-- 2. CRM Vehicles (n_rutiere)
CREATE TABLE IF NOT EXISTS crm_vehicles (
  id INT PRIMARY KEY,
  code VARCHAR(50),
  color VARCHAR(50),
  year VARCHAR(50),
  plate_number VARCHAR(15),
  capacity SMALLINT NOT NULL DEFAULT 20,
  driver_ids VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

`;

const rutBlocks = sql.match(/INSERT INTO `n_rutiere`[^;]+;/gs);
if (rutBlocks) {
  let count = 0;
  for (const block of rutBlocks) {
    const re = /\((\d+),\s*'([^']*)',\s*'[^']*',\s*'([^']*)',\s*'[^']*',\s*'([^']*)',\s*'[^']*',\s*'([^']*)',\s*'[^']*',\s*(\d+),\s*'[^']*',\s*'([^']*)',\s*'[^']*'\)/g;
    let m;
    while ((m = re.exec(block))) {
      const plate = m[5].trim().replace(/\s+/g, ' ');
      out += `INSERT INTO crm_vehicles (id, code, color, year, plate_number, capacity, driver_ids) VALUES (${m[1]}, '${esc(m[2])}', '${esc(m[3])}', '${esc(m[4])}', '${esc(plate)}', ${m[6]}, '${esc(m[7])}') ON CONFLICT (id) DO NOTHING;\n`;
      count++;
    }
  }
  console.log(`crm_vehicles: ${count} rows`);
}

// ═══════════════════════════════════════════
// 3. n_rute_lde → crm_daily_log
// ═══════════════════════════════════════════
out += `\n-- 3. Daily Assignments Log (n_rute_lde)
CREATE TABLE IF NOT EXISTS crm_daily_log (
  id INT PRIMARY KEY,
  assignment_date DATE,
  crm_route_id SMALLINT NOT NULL DEFAULT 0,
  route_info VARCHAR(30),
  vehicle_id SMALLINT NOT NULL DEFAULT 0,
  vehicle_info VARCHAR(30),
  driver_id SMALLINT NOT NULL DEFAULT 0,
  driver_info VARCHAR(30),
  driver2_id SMALLINT NOT NULL DEFAULT 0,
  driver2_info VARCHAR(30),
  driver3_id SMALLINT NOT NULL DEFAULT 0,
  driver3_info VARCHAR(30)
);
CREATE INDEX IF NOT EXISTS idx_crm_daily_log_date ON crm_daily_log(assignment_date);

`;

const ldeBlocks = sql.match(/INSERT INTO `n_rute_lde`[^;]+;/gs);
if (ldeBlocks) {
  let count = 0;
  for (const block of ldeBlocks) {
    const re = /\((\d+),\s*'([^']*)',\s*(\d+),\s*'([^']*)',\s*(\d+),\s*'([^']*)',\s*(\d+),\s*'([^']*)',\s*(\d+),\s*'([^']*)',\s*(\d+),\s*'([^']*)'\)/g;
    let m;
    while ((m = re.exec(block))) {
      out += `INSERT INTO crm_daily_log (id, assignment_date, crm_route_id, route_info, vehicle_id, vehicle_info, driver_id, driver_info, driver2_id, driver2_info, driver3_id, driver3_info) VALUES (${m[1]}, '${m[2]}', ${m[3]}, '${esc(m[4])}', ${m[5]}, '${esc(m[6])}', ${m[7]}, '${esc(m[8])}', ${m[9]}, '${esc(m[10])}', ${m[11]}, '${esc(m[12])}') ON CONFLICT (id) DO NOTHING;\n`;
      count++;
    }
  }
  console.log(`crm_daily_log: ${count} rows`);
}

// ═══════════════════════════════════════════
// 4. n_preturi_km_raw → crm_stop_km_raw
// ═══════════════════════════════════════════
out += `\n-- 4. Raw KM prices (n_preturi_km_raw)
CREATE TABLE IF NOT EXISTS crm_stop_km_raw (
  id INT PRIMARY KEY,
  crm_route_id INT,
  km_from_chisinau FLOAT NOT NULL DEFAULT 0,
  hour_from_chisinau VARCHAR(5),
  name_ro VARCHAR(60) NOT NULL,
  name_ru VARCHAR(60) NOT NULL,
  hour_from_nord VARCHAR(5),
  km_from_nord FLOAT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT false
);

`;

const rawBlocks = sql.match(/INSERT INTO `n_preturi_km_raw`[^;]+;/gs);
if (rawBlocks) {
  let count = 0, skipped = 0;
  for (const block of rawBlocks) {
    const re = /\((\d+),\s*(\d+),\s*([\d.]+),\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*([\d.]+),\s*(\d+)\)/g;
    let m;
    while ((m = re.exec(block))) {
      const routeId = parseInt(m[2]);
      out += `INSERT INTO crm_stop_km_raw (id, crm_route_id, km_from_chisinau, hour_from_chisinau, name_ro, name_ru, hour_from_nord, km_from_nord, is_visible) VALUES (${m[1]}, ${routeId}, ${m[3]}, '${esc(m[4])}', '${esc(m[5])}', '${esc(m[6])}', '${esc(m[7])}', ${m[8]}, ${m[9] === '1'}) ON CONFLICT (id) DO NOTHING;\n`;
      count++;
    }
  }
  console.log(`crm_stop_km_raw: ${count} rows`);
}

const outPath = join(__dirname, 'output/remaining-import.sql');
writeFileSync(outPath, out, 'utf8');
console.log(`\nGenerated: ${outPath} (${out.split('\n').length} lines)`);
