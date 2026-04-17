/**
 * Find and fix corrupted km values by cross-referencing all Excel files.
 * For each deleted pair, check if another Excel file has the correct km.
 * Output: SQL to re-insert the fixed pairs.
 */
import XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { join } from 'path';

const DOWNLOADS = '/Users/ionpop/Downloads';
const RATE = 0.94;

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

function normalize(name) {
  return name.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*translux$/i, '')
    .replace(/\s+ga$/i, '')
    .replace(/\(sat\)$/i, '')
    .replace(/^ret\s+/i, '')
    .replace(/^sl\.\s*/i, 'slobozia ')
    .replace(/^-\//, '')
    .replace(/\/-$/, '')
    .trim();
}

// Build a map: "from|to" → { good_km, bad_km, tariff_ids_bad, tariff_ids_good }
const pairMap = new Map();

for (const [tariffId, filename] of Object.entries(TARIFF_FILES)) {
  const filepath = join(DOWNLOADS, filename);
  try {
    const wb = XLSX.readFile(filepath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    for (const row of rows) {
      const from = normalize(row['Из'] || row['From'] || '');
      const to = normalize(row['В'] || row['To'] || '');
      const km = parseFloat(row['Расстояние'] || row['Distance'] || 0);
      if (!from || !to || km <= 0) continue;

      const key = `${from}|${to}`;
      if (!pairMap.has(key)) pairMap.set(key, { good: [], bad: [] });
      const entry = pairMap.get(key);

      if (km > 1000) {
        entry.bad.push({ tariffId: Number(tariffId), km });
      } else {
        entry.good.push({ tariffId: Number(tariffId), km });
      }
    }
  } catch (err) {
    console.error(`Failed: ${filename}: ${err.message}`);
  }
}

// Find pairs that ONLY have bad values (no good reference in any file)
let fixable = 0, unfixable = 0;
const sqlLines = [];
const unfixablePairs = [];

for (const [key, data] of pairMap) {
  if (data.bad.length === 0) continue; // no bad data

  if (data.good.length > 0) {
    // Has good reference — use first good km
    const goodKm = data.good[0].km;
    const [from, to] = key.split('|');
    for (const bad of data.bad) {
      sqlLines.push(
        `INSERT INTO route_km_pairs (tariff_id, from_stop, to_stop, km, price) ` +
        `VALUES (${bad.tariffId}, '${from}', '${to}', ${goodKm}, ${Math.round(goodKm * RATE)}) ` +
        `ON CONFLICT (tariff_id, from_stop, to_stop) DO UPDATE SET km = ${goodKm}, price = ${Math.round(goodKm * RATE)};`
      );
    }
    fixable += data.bad.length;
  } else {
    const [from, to] = key.split('|');
    unfixablePairs.push({ from, to, badKm: data.bad[0].km, tariffs: data.bad.map(b => b.tariffId) });
    unfixable += data.bad.length;
  }
}

console.log(`\nFixable (have good reference): ${fixable} rows`);
console.log(`Unfixable (no good reference): ${unfixable} rows (${unfixablePairs.length} unique pairs)`);
console.log('\nUnfixable pairs:');
for (const p of unfixablePairs) {
  console.log(`  ${p.from} → ${p.to} (bad km: ${p.badKm}, tariffs: ${p.tariffs.join(',')})`);
}

if (sqlLines.length > 0) {
  const output = sqlLines.join('\n');
  writeFileSync(join(import.meta.dirname, 'output', 'fix-corrupted-km.sql'), output);
  console.log(`\n✓ SQL written: scripts/output/fix-corrupted-km.sql (${sqlLines.length} statements)`);
}
