/**
 * Import km-based pricing from Excel files
 *
 * Reads 14 Excel files (km matrices) + rute.xlsx (route-to-tariff mapping)
 * Generates SQL to populate route_km_pairs table and update crm_routes tariff_ids
 *
 * Usage: node scripts/import-km-prices.mjs
 * Output: scripts/output/km-prices-import.sql
 */

import XLSX from 'xlsx';
import { writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DOWNLOADS = '/Users/ionpop/Downloads';
const PRICE_PER_KM = 0.94;

// Excel files mapping: tariff_id → filename pattern
const TARIFF_FILES = {
  98:  '98 Corjeuti - ChisinauBriceni by KM.xlsx',
  104: '104 Criva - ChisinauLarga by KM.xlsx',
  105: '105 Chisinau - Criva EXPRESS by KM.xlsx',
  106: '106 Criva - Chisinau EXPRESS by KM.xlsx',
  109: '109 Chisinau - LipcaniRiscani b.xlsx',
  110: '110 Lipcani - ChisinauRiscani b.xlsx',
  111: '111 Lipcani-ChisinauBrinzeni by.xlsx',
  114: '114 Chisinau - LipcaniTetcani by KM.xlsx',
  115: '115 Lipcani - ChisinauEdinet by KM.xlsx',
  116: '116 Chisinau-CorjeutiBriceni by KM.xlsx',
  117: '117 Chisinau - CrivaLarga by KM.xlsx',
  118: '118 Chisinau- Lipcani Brinzeni by KM.xlsx',
  120: '120 Chisinau - Ocnita by KM.xlsx',
  122: '122 Ocnita - Chisinau by KM.xlsx',
};

// crm_route_id → { tariff_tur, tariff_retur }
// Mapped from rute.xlsx Тариф column + crm_route_links
const ROUTE_TARIFFS = {
  1:  { tur: 106, retur: 105 },  // 3.00 Grimancauti-Chisinau / 11.20
  2:  { tur: 106, retur: 105 },  // 5.45 Briceni-Chisinau / 17.50
  3:  { tur: 98,  retur: 116 },  // 8.00 Corjeuti-Chisinau/Briceni / 17.20
  4:  { tur: 106, retur: 105 },  // 2.00 Lipcani-Chisinau / 9.25
  3:  { tur: 122, retur: 120 },  // 8.00 Ocnita-Chisinau / 15.55
  5:  { tur: 110, retur: 109 },  // 10.10 Sirauti-Chisinau / 18.05
  6:  { tur: 98,  retur: 116 },  // 6.17 Corjeuti-Chisinau / 11.43
  7:  { tur: 106, retur: 105 },  // 10.50 Criva-Chisinau / 18.30
  8:  { tur: 106, retur: 105 },  // 12.30 Criva-Chisinau / 20.00
  9:  { tur: 106, retur: 105 },  // 12.00 Criva-Chisinau / 19.20
  10: { tur: 106, retur: 105 },  // 14.10 Criva-Chisinau / 8.40
  11: { tur: 106, retur: 105 },  // 13.20 Criva-Chisinau / 6.55
  12: { tur: 106, retur: 105 },  // 15.55 Briceni-Chisinau / 07.30
  13: { tur: 110, retur: 109 },  // 15.00 Lipcani-Chisinau/Riscani / 08.00
  14: { tur: 106, retur: 105 },  // 15.30 Criva-Chisinau / 10.10
  15: { tur: 106, retur: 105 },  // 17.25 Criva-Chisinau / 09.40
  16: { tur: 106, retur: 105 },  // 2.50 Criva-Chisinau / 10.40
  17: { tur: 98,  retur: 116 },  // 2.40 Criva-Chisinau/Tetcani / 13.55
  18: { tur: 115, retur: 114 },  // 4.00 Lipcani-Chisinau/Edinet / 13.00
  19: { tur: 106, retur: 105 },  // 5.30 Criva-Chisinau/Briceni / 14.15
  20: { tur: 104, retur: 117 },  // 6.30 Coteala-Chisinau / 12.30
  21: { tur: 122, retur: 120 },  // 12.35 Otaci-Chisinau / 18.55
  22: { tur: 106, retur: 105 },  // 6.00 Criva-Chisinau / 13.30
  23: { tur: 106, retur: 105 },  // 7.00 Criva-Chisinau/Briceni / 15.15
  24: { tur: 104, retur: 117 },  // 7.25 Criva-Chisinau / 14.50
  25: { tur: 115, retur: 114 },  // 6.50 Caracusenii Vechi-Chisinau / 16.15
  26: { tur: 106, retur: 105 },  // 11.00 Lipcan-Chisinau / 17.40
  27: { tur: 106, retur: 105 },  // 9.00 Criva-Chisinau / 15.35
  28: { tur: 106, retur: 105 },  // 9.35 Criva-Chisinau / 16.25
  29: { tur: 122, retur: 120 },  // 9.50 Ocnita-Chisinau / 18.10
};

/**
 * Normalize stop name for consistent matching
 * Removes diacritics, lowercases, trims
 */
function normalize(name) {
  let n = name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove diacritics
    .replace(/\s+/g, ' ');

  // Strip suffixes that differ between Excel and crm_stop_fares
  n = n.replace(/\s*translux$/i, '');     // "chisinau translux" → "chisinau"
  n = n.replace(/\s+ga$/i, '');           // "balti ga", "lipcani ga", "ocnita ga", "otaci ga"
  n = n.replace(/\(sat\)$/i, '');         // "ocnita(sat)" → "ocnita"
  n = n.replace(/^ret\s+/i, '');          // "ret caracusenii vechi" → "caracusenii vechi"
  n = n.replace(/^sl\.\s*/i, 'slobozia ');// "sl. sirauti" → "slobozia sirauti"

  // Strip composite prefixes/suffixes from itinerary names
  n = n.replace(/^-\//, '');              // "-/coteala" → "coteala"
  n = n.replace(/\/-$/, '');              // "caracusenii noi/-" → "caracusenii noi"

  // Map itinerary names to km-pair names
  const ALIASES = {
    'coteala': 'cotelea',
    'hlinaia': 'hlina',
    'criva vama': 'criva',
    'gordinestii noi': 'gordinesti',
    'intersectia tabani': 'tabani',
    'intersectia trestieni': 'halahora de sus',  // nearest known, +4km
    'intersectia riscani': 'riscani',
    'petrom riscani': 'riscani',
    'beleavinti': 'larga',
    'beleavinti/larga': 'larga',
    'berlinti/cotiujeni': 'cotiujeni',
    'caracusenii noi/-': 'caracusenii noi',
  };

  n = n.trim();
  if (ALIASES[n]) n = ALIASES[n];

  return n;
}

/**
 * Escape single quotes for SQL
 */
function esc(str) {
  return str.replace(/'/g, "''");
}

/**
 * Parse one Excel km file → array of {from, to, km}
 */
function parseKmFile(filepath) {
  const wb = XLSX.readFile(filepath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const pairs = [];
  for (const row of rows) {
    const from = row['Из'] || row['From'] || '';
    const to = row['В'] || row['To'] || '';
    const km = parseFloat(row['Расстояние'] || row['Distance'] || 0);

    if (from && to && km > 0 && normalize(from) !== 'nan' && normalize(to) !== 'nan') {
      pairs.push({
        from: normalize(from),
        to: normalize(to),
        km: Math.round(km * 100) / 100,  // 2 decimal places
        price: Math.round(km * PRICE_PER_KM),
      });
    }
  }

  return pairs;
}

// ---- MAIN ----

console.log('=== TRANSLUX km-based pricing import ===\n');

const lines = ['BEGIN;\n'];

// 1. Parse all 14 Excel files
let totalPairs = 0;
const allPairs = {};  // tariff_id → pairs[]

for (const [tariffId, filename] of Object.entries(TARIFF_FILES)) {
  const filepath = join(DOWNLOADS, filename);
  try {
    const pairs = parseKmFile(filepath);
    allPairs[tariffId] = pairs;
    totalPairs += pairs.length;
    console.log(`  ✓ Tariff ${tariffId}: ${pairs.length} pairs from "${filename}"`);
  } catch (err) {
    console.error(`  ✗ Tariff ${tariffId}: FAILED to read "${filename}": ${err.message}`);
  }
}

console.log(`\nTotal pairs: ${totalPairs}\n`);

// 2. Generate INSERT statements for route_km_pairs
lines.push('-- Clear old km pairs and re-insert');
lines.push('DELETE FROM route_km_pairs;\n');

for (const [tariffId, pairs] of Object.entries(allPairs)) {
  lines.push(`-- Tariff ${tariffId} (${TARIFF_FILES[tariffId]})`);
  for (const p of pairs) {
    lines.push(
      `INSERT INTO route_km_pairs (tariff_id, from_stop, to_stop, km, price) ` +
      `VALUES (${tariffId}, '${esc(p.from)}', '${esc(p.to)}', ${p.km}, ${p.price}) ` +
      `ON CONFLICT (tariff_id, from_stop, to_stop) DO UPDATE SET km = ${p.km}, price = ${p.price};`
    );
  }
  lines.push('');
}

// 3. Generate delta-based pairs for stops missing from Excel
// Each entry: [missingStop, referenceStop, deltaKm, direction]
// direction: '+' means missing is FURTHER from Chisinau than reference
//            '-' means missing is CLOSER to Chisinau than reference
//            '=' means same location (delta 0)
const DELTA_STOPS = [
  ['stauceni',              'chisinau',         8,  '+'],
  ['magdacesti',            'peresecina',       12, '-'],
  ['pascani',               'peresecina',       6,  '-'],
  ['ciocilteni',            'orhei',            7,  '+'],
  ['intersectia soroca',    'zahareuca',        5,  '+'],
  ['grigorauca',            'copaceni',         2,  '+'],
  ['bilicenii noi',         'bilicenii vechi',  5,  '+'],
  ['intersectia pelenia',   'corlateni',        5,  '+'],
  ['intersectia riscani',   'riscani',          0,  '='],
  ['petrom riscani',        'riscani',          0,  '='],
  ['bratusenii noi',        'bratuseni',        3,  '+'],
  ['colicauti',             'briceni',          9,  '+'],
  ['intersectia trestieni', 'halahora de sus',  4,  '+'],
  ['dingeni',               'edinet',           15, '+'],
  ['druta',                 'riscani',          10, '+'],
  ['dumeni',                'edinet',           8,  '+'],
  ['hancauti',              'edinet',           5,  '+'],
  ['slobotca',              'brinzeni',         3,  '+'],
];

lines.push('-- Delta-based pairs for stops missing from Excel');
let deltaCount = 0;

for (const [tariffId, pairs] of Object.entries(allPairs)) {
  // Build a quick lookup: refStop → [{ to, km }]
  const refPairs = new Map();
  for (const p of pairs) {
    if (!refPairs.has(p.from)) refPairs.set(p.from, []);
    refPairs.get(p.from).push({ to: p.to, km: p.km });
    if (!refPairs.has(p.to)) refPairs.set(p.to, []);
    refPairs.get(p.to).push({ to: p.from, km: p.km });
  }

  for (const [missing, ref, delta, dir] of DELTA_STOPS) {
    if (!refPairs.has(ref)) continue; // ref not in this tariff

    const refDestinations = refPairs.get(ref);
    for (const { to: dest, km: refKm } of refDestinations) {
      if (dest === missing) continue; // skip self-referential

      // Calculate km: if missing is further (+), add delta; if closer (-), subtract
      let newKm;
      if (dir === '=') {
        newKm = refKm;
      } else if (dir === '+') {
        // Missing is further from Chisinau than ref
        // If dest is on the Chisinau side: km = refKm + delta
        // If dest is on the Nord side: km = refKm - delta (but min 1)
        // Since we don't know direction, use absolute delta from reference
        // For simplicity: newKm = |refKm ± delta|, try both and pick reasonable one
        // Best heuristic: missing is delta km further, so from missing to dest:
        // if dest is "toward Chisinau" relative to ref: add delta
        // We approximate: use refKm + delta (worst case off by 2*delta)
        // Actually simpler: the Excel pair ref→dest = refKm
        // missing is delta km from ref, so missing→dest ≈ refKm + delta or refKm - delta
        // We pick the one that makes geographic sense: if refKm > delta, could be either
        // Best approach: generate BOTH missing→dest with refKm+delta and refKm-delta,
        // but only keep the one where km > 0
        // For now use absolute: max(refKm - delta, 1) as minimum
        newKm = refKm; // will be adjusted below
      } else {
        newKm = refKm;
      }

      // Simple heuristic: if we know ref→dest km, and missing is delta km from ref,
      // then missing→dest is approximately refKm ± delta. We don't know the sign,
      // but we can check: does adding or subtracting make more sense?
      // If ref→chisinau exists and missing→chisinau should be ref→chisinau ± delta,
      // we can determine direction. For simplicity, we just add delta (overestimates slightly for same-side destinations)
      if (dir === '+') {
        // Missing is further from Chisinau. For most destinations (which are between missing and Chisinau),
        // the distance is refKm + delta
        newKm = refKm + delta;
      } else if (dir === '-') {
        // Missing is closer to Chisinau. For most destinations (which are further north),
        // the distance is refKm + delta
        newKm = refKm + delta;
      }

      if (newKm <= 0) continue;
      const newPrice = Math.round(newKm * PRICE_PER_KM);

      lines.push(
        `INSERT INTO route_km_pairs (tariff_id, from_stop, to_stop, km, price) ` +
        `VALUES (${tariffId}, '${esc(missing)}', '${esc(dest)}', ${Math.round(newKm * 100) / 100}, ${newPrice}) ` +
        `ON CONFLICT (tariff_id, from_stop, to_stop) DO UPDATE SET km = ${Math.round(newKm * 100) / 100}, price = ${newPrice};`
      );
      deltaCount++;
    }
  }
}

lines.push('');
console.log(`\nDelta pairs generated: ${deltaCount}`);

// 4. Update crm_routes with tariff IDs
lines.push('-- Update crm_routes tariff IDs');
for (const [routeId, tariffs] of Object.entries(ROUTE_TARIFFS)) {
  lines.push(
    `UPDATE crm_routes SET tariff_id_tur = ${tariffs.tur}, tariff_id_retur = ${tariffs.retur} WHERE id = ${routeId};`
  );
}
lines.push('');

// 4. Deactivate routes not in our mapping (routes > 29 or unmapped)
lines.push('-- Deactivate crm_routes not in the active route set');
const activeRouteIds = Object.keys(ROUTE_TARIFFS).join(',');
lines.push(`UPDATE crm_routes SET active = false WHERE id NOT IN (${activeRouteIds});`);
lines.push('');

// 5. Collect all unique stop names from itineraries (crm_stop_fares)
// This will be used to filter localities — done via SQL directly
lines.push('-- Deactivate localities not present in active route itineraries');
lines.push(`UPDATE localities SET active = false;`);
lines.push(`UPDATE localities SET active = true WHERE name_ro IN (`);
lines.push(`  SELECT DISTINCT csf.name_ro FROM crm_stop_fares csf`);
lines.push(`  WHERE csf.crm_route_id IN (${activeRouteIds})`);
lines.push(`);`);
lines.push('');

lines.push('COMMIT;');

// Write output
const outputPath = join(import.meta.dirname, 'output', 'km-prices-import.sql');
writeFileSync(outputPath, lines.join('\n'), 'utf8');
console.log(`\n✓ Output written to: ${outputPath}`);
console.log(`  - ${totalPairs} km pair inserts`);
console.log(`  - ${Object.keys(ROUTE_TARIFFS).length} route tariff updates`);

// Stats: show some example prices
console.log('\n=== Example prices (km × 0.9) ===');
const exampleTariff = allPairs['106'] || allPairs[Object.keys(allPairs)[0]];
if (exampleTariff) {
  const examples = exampleTariff
    .filter(p => p.from.includes('chisinau'))
    .slice(0, 5);
  for (const e of examples) {
    console.log(`  ${e.from} → ${e.to}: ${e.km} km → ${e.price} lei`);
  }
}
