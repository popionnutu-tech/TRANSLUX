#!/usr/bin/env node
/**
 * Import legacy MySQL data from CC.sql into Supabase PostgreSQL
 *
 * Usage: node scripts/import-legacy.mjs /path/to/CC.sql
 *
 * Generates: scripts/output/supabase-import.sql
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlFile = process.argv[2] || join(__dirname, '../../../Downloads/CC.sql');

console.log(`Reading ${sqlFile}...`);
const sql = readFileSync(sqlFile, 'utf8');

// ── Parse n_directii (all localities with RO/RU names) ──
function parseDirectii() {
  const match = sql.match(/INSERT INTO `n_directii`[^;]+;/s);
  if (!match) return [];
  const rows = [];
  const re = /\((\d+),\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(\d+),\s*(\d+),\s*(\d+),\s*'([^']*)'\)/g;
  let m;
  while ((m = re.exec(match[0]))) {
    rows.push({
      id: parseInt(m[1]),
      name_ro: m[2],
      name_ru: m[4], // denumirea_ru is the correct RU name
      imp_ro: parseInt(m[5]),
    });
  }
  return rows;
}

// ── Parse n_orar (schedule) ──
function parseOrar() {
  const match = sql.match(/INSERT INTO `n_orar` \(`id`[^;]+;/s);
  if (!match) return [];
  const rows = [];
  const re = /\((\d+),\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'\)/g;
  let m;
  while ((m = re.exec(match[0]))) {
    rows.push({
      id: parseInt(m[1]),
      duration_c: m[2],    // "06:55 - 11:05"
      duration_n: m[3],    // "14:10 - 18:30"
      ora_c: m[4],         // "06:55:00"
      ora_n: m[5],         // "14:10:00"
      dela_ro: m[6],
      dela_ru: m[7],
      spre_ro: m[8],
      spre_ru: m[9],
    });
  }
  return rows;
}

// ── Parse n_soferi (drivers) ──
function parseSoferi() {
  const match = sql.match(/INSERT INTO `n_soferi`[^;]+;/s);
  if (!match) return [];
  const rows = [];
  const re = /\((\d+),\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',/g;
  let m;
  while ((m = re.exec(match[0]))) {
    const nume = m[2].trim();
    const prenume = m[3].trim();
    const tel = m[5].trim();
    if (nume && prenume !== '/') {
      rows.push({
        full_name: `${nume} ${prenume}`.trim(),
        phone: tel || null,
      });
    }
  }
  return rows;
}

// ── Parse n_preturi (prices per stop per route) ──
function parsePreturi() {
  // n_preturi has two INSERT blocks, collect both
  const blocks = sql.match(/INSERT INTO `n_preturi` \(`id`[^;]+;/gs);
  if (!blocks) return [];
  const rows = [];
  for (const block of blocks) {
    const re = /\((\d+),\s*(\d+),\s*[\d.]+,\s*(\d+),\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(\d+),\s*[\d.]+,\s*(\d+)\)/g;
    let m;
    while ((m = re.exec(block))) {
      rows.push({
        id: parseInt(m[1]),
        route_id: parseInt(m[2]),
        price_c: parseInt(m[3]),
        time_c: m[4],
        name_ro: m[5],
        name_ru: m[6],
        time_n: m[7],
        price_n: parseInt(m[8]),
        visible: parseInt(m[9]) === 1,
      });
    }
  }
  return rows;
}

function esc(s) {
  return s.replace(/'/g, "''");
}

// ── Generate SQL ──
console.log('Parsing...');
const directii = parseDirectii();
const orar = parseOrar();
const soferi = parseSoferi();
const preturi = parsePreturi();

console.log(`Localities: ${directii.length}`);
console.log(`Schedule: ${orar.length}`);
console.log(`Drivers: ${soferi.length}`);
console.log(`Price stops: ${preturi.length}`);

let out = `-- Auto-generated from CC.sql legacy import
-- Generated: ${new Date().toISOString()}
-- Run after migration 008_legacy_import.sql

BEGIN;

-- ============================================================
-- 1. LOCALITIES
-- ============================================================
`;

for (const d of directii) {
  const isMajor = d.imp_ro > 0;
  out += `INSERT INTO localities (id, name_ro, name_ru, is_major, sort_order) VALUES (${d.id}, '${esc(d.name_ro)}', '${esc(d.name_ru)}', ${isMajor}, ${d.imp_ro}) ON CONFLICT (id) DO NOTHING;\n`;
}
out += `SELECT setval('localities_id_seq', (SELECT MAX(id) FROM localities));\n`;

out += `\n-- ============================================================
-- 2. SCHEDULE (departures)
-- ============================================================
`;

for (const o of orar) {
  out += `INSERT INTO schedule (id, destination_ro, destination_ru, departure_chisinau, departure_destination, duration_display_c, duration_display_n) VALUES (${o.id}, '${esc(o.spre_ro)}', '${esc(o.spre_ru)}', '${o.ora_c}', '${o.ora_n}', '${esc(o.duration_c)}', '${esc(o.duration_n)}') ON CONFLICT (id) DO NOTHING;\n`;
}
out += `SELECT setval('schedule_id_seq', (SELECT MAX(id) FROM schedule));\n`;

out += `\n-- ============================================================
-- 3. DRIVERS (into existing drivers table)
-- ============================================================
`;

for (const s of soferi) {
  out += `INSERT INTO drivers (full_name, phone, active) VALUES ('${esc(s.full_name)}', '${esc(s.phone || '')}', true) ON CONFLICT DO NOTHING;\n`;
}

out += `\n-- ============================================================
-- 4. STOP PRICES
-- ============================================================
`;

// Build locality name->id map
const locMap = {};
for (const d of directii) {
  locMap[d.name_ro.toLowerCase()] = d.id;
}

let skipped = 0;
let stopOrder = 0;
let lastRouteId = -1;

for (const p of preturi) {
  const locId = locMap[p.name_ro.toLowerCase()];
  if (!locId) {
    skipped++;
    continue;
  }
  if (p.route_id !== lastRouteId) {
    stopOrder = 0;
    lastRouteId = p.route_id;
  }
  stopOrder++;
  out += `INSERT INTO stop_prices (schedule_id, locality_id, stop_order, price_from_chisinau, time_from_chisinau, price_from_north, time_from_north, is_visible) VALUES (${p.route_id}, ${locId}, ${stopOrder}, ${p.price_c}, '${esc(p.time_c)}', ${p.price_n}, '${esc(p.time_n)}', ${p.visible}) ON CONFLICT DO NOTHING;\n`;
}

out += '\nCOMMIT;\n';

if (skipped > 0) {
  console.log(`Skipped ${skipped} price rows (locality not found in n_directii)`);
}

mkdirSync(join(__dirname, 'output'), { recursive: true });
const outPath = join(__dirname, 'output/supabase-import.sql');
writeFileSync(outPath, out, 'utf8');
console.log(`\nGenerated: ${outPath}`);
console.log(`Total SQL lines: ${out.split('\n').length}`);
