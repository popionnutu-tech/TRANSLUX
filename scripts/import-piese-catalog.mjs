// ============================================================================
// Import unic în modulul „Piese" (TRANSLUX / central-hub) dintr-un export 1C.
// Încarcă: GRUPE (piese_part_groups), PIESE (piese_parts), FURNIZORI (piese_suppliers).
//
// Folosire:
//   node scripts/import-piese-catalog.mjs <fisier.csv> --type=parts|groups|suppliers [--apply] [--delim=;]
//
//   • FĂRĂ --apply  → DRY-RUN: doar afișează ce ar importa, NU scrie nimic (implicit, sigur).
//   • CU   --apply  → scrie efectiv. A SE COORDONA CU ION (bază de producție comună) ȘI a face backup întâi.
//
// Env necesare (doar pentru --apply): SUPABASE_URL, SUPABASE_SERVICE_KEY.
// Necesită `npm install` în rădăcina repo-ului (@supabase/supabase-js).
//
// IDEMPOTENȚĂ: importul e SIGUR la re-rulare — dedublează grupe (după nume), furnizori (după nume)
// și piese (după cod de bare; iar piesele fără cod de bare după denumire+producător+model+articol).
// NU e tranzacțional (REST), dar fiind idempotent, după o eroare la mijloc poți re-rula fără dubluri.
//
// MAPAREA COLOANELOR: vezi COLUMN_ALIASES. Anteturile CSV se potrivesc case-insensitive cu numele
// canonice; dacă exportul tău din 1C are alte denumiri, adaugă-le în liste sau redenumește anteturile.
//
// Notă: citește tot fișierul în memorie — potrivit pentru un catalog (MB), nu pentru fișiere de GB.
// ============================================================================

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// ── Argumente ──
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const typeArg = (args.find((a) => a.startsWith('--type=')) || '').split('=')[1];
const apply = args.includes('--apply');
const delimArg = (args.find((a) => a.startsWith('--delim=')) || '').split('=')[1];

if (!file || !typeArg) {
  console.error('Folosire: node scripts/import-piese-catalog.mjs <fisier.csv> --type=parts|groups|suppliers [--apply] [--delim=;]');
  process.exit(1);
}
if (!['parts', 'groups', 'suppliers'].includes(typeArg)) {
  console.error(`--type invalid: "${typeArg}". Valori permise: parts, groups, suppliers.`);
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (apply && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) {
  console.error('Pentru --apply ai nevoie de SUPABASE_URL și SUPABASE_SERVICE_KEY în env.');
  process.exit(1);
}

// ── Maparea anteturilor CSV → câmpuri canonice (case-insensitive; adaugă aici aliasuri din 1C) ──
const COLUMN_ALIASES = {
  groups: {
    name_ro: ['name_ro', 'denumire', 'grupa', 'grupă', 'название', 'наименование'],
    name_ru: ['name_ru', 'denumire_ru', 'название_ru', 'наименование ru'],
    markup_pct: ['markup_pct', 'adaos', 'adaos%', 'наценка'],
    norm_km: ['norm_km', 'norma', 'norma_km', 'норма', 'норма км'],
  },
  suppliers: {
    name: ['name', 'denumire', 'furnizor', 'поставщик', 'название', 'наименование'],
    idno: ['idno', 'cod_fiscal', 'cod fiscal', 'идно', 'фискальный'],
    contact: ['contact', 'telefon', 'tel', 'контакт', 'телефон'],
  },
  parts: {
    group: ['group', 'grupa', 'grupă', 'grupa_ro', 'группа', 'denumire grupa'],
    name_long: ['name_long', 'denumire', 'name', 'наименование', 'название'],
    manufacturer: ['manufacturer', 'producator', 'producător', 'brand', 'производитель'],
    model: ['model', 'модель'],
    article_code: ['article_code', 'articol', 'cod_articol', 'cod articol', 'артикул'],
    oem_code: ['oem_code', 'oem', 'код oem'],
    barcode: ['barcode', 'cod_de_bare', 'cod de bare', 'штрихкод', 'ean'],
    unit: ['unit', 'unitate', 'um', 'ед', 'ед.изм'],
    is_for_sale: ['is_for_sale', 'vanzare', 'vânzare', 'pt_vanzare', 'для продажи'],
  },
};
const REQUIRED = { groups: ['name_ro'], suppliers: ['name'], parts: ['group', 'name_long'] };

// ── Parser CSV minimal (gestionează ghilimele, delimitatori în câmpuri, BOM) ──
function detectDelimiter(firstLine) {
  const counts = { ';': 0, ',': 0, '\t': 0 };
  for (const ch of firstLine) if (ch in counts) counts[ch]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}
function parseCSV(text, delimiter) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let field = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

function buildColumnIndex(header, aliases) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const [field, names] of Object.entries(aliases)) {
    const i = norm.findIndex((h) => names.includes(h));
    if (i >= 0) idx[field] = i;
  }
  return idx;
}

// ── Helperi de valori ──
const truthy = (v) => ['1', 'da', 'yes', 'true', 'x', 'да'].includes((v || '').trim().toLowerCase());
// Acceptă virgulă sau punct zecimal; întoarce null dacă nu e număr valid (NU forțează 0/NaN tăcut).
function decimal(v) {
  const s = (v ?? '').toString().trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ── Citire + parsare ──
const raw = readFileSync(file, 'utf8');
const delimiter = delimArg || detectDelimiter(raw.split('\n')[0] || '');
const rows = parseCSV(raw, delimiter);
if (rows.length < 2) { console.error('CSV gol sau fără rânduri de date.'); process.exit(1); }

const header = rows[0];
const aliases = COLUMN_ALIASES[typeArg];
const colIdx = buildColumnIndex(header, aliases);

const missing = REQUIRED[typeArg].filter((f) => !(f in colIdx));
if (missing.length) {
  console.error(`Lipsesc coloane obligatorii pentru "${typeArg}": ${missing.join(', ')}.`);
  console.error(`Anteturi găsite: ${header.join(' | ')}`);
  console.error('Adaugă numele lor în COLUMN_ALIASES sau redenumește anteturile în CSV.');
  process.exit(1);
}

const get = (row, field) => (field in colIdx ? (row[colIdx[field]] ?? '').trim() : '');

// ── Construire înregistrări + avertismente pentru numere neparsabile ──
let numWarnings = 0;
function numField(row, field, { int = false } = {}) {
  const rawVal = get(row, field);
  if (rawVal === '') return null;
  const n = decimal(rawVal);
  if (n == null) { numWarnings++; return null; }
  return int ? Math.round(n) : n;
}

const dataRows = rows.slice(1);
const records = dataRows.map((row) => {
  if (typeArg === 'groups') return { name_ro: get(row, 'name_ro'), name_ru: get(row, 'name_ru') || null, markup_pct: numField(row, 'markup_pct') ?? 0, norm_km: numField(row, 'norm_km', { int: true }) };
  if (typeArg === 'suppliers') return { name: get(row, 'name'), idno: get(row, 'idno') || null, contact: get(row, 'contact') || null };
  return { group: get(row, 'group'), name_long: get(row, 'name_long'), manufacturer: get(row, 'manufacturer') || null, model: get(row, 'model') || null, article_code: get(row, 'article_code') || null, oem_code: get(row, 'oem_code') || null, barcode: get(row, 'barcode') || null, unit: get(row, 'unit') || 'buc', is_for_sale: truthy(get(row, 'is_for_sale')) };
}).filter((r) => REQUIRED[typeArg].every((f) => String(r[f] ?? '').trim() !== ''));

console.log(`Tip: ${typeArg} | delimitator: ${JSON.stringify(delimiter)} | rânduri valide: ${records.length}/${dataRows.length}`);
console.log('Mapare coloane:', colIdx);
console.log('Exemplu:', records[0]);
if (numWarnings) console.log(`⚠ ${numWarnings} valori numerice neparsabile au fost ignorate (verifică coloanele adaos/normă).`);

if (!apply) {
  console.log('\n[DRY-RUN] Nu s-a scris nimic. Rulează cu --apply (coordonat cu Ion, după backup) ca să imporți efectiv.');
  process.exit(0);
}

// ── Import efectiv ──
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const SEL_CAP = 100000; // peste plafonul implicit de 1000 al PostgREST (catalog inițial — o singură pagină)
let inserted = 0, skipped = 0;

async function fetchAll(table, cols) {
  const { data, error } = await sb.from(table).select(cols).limit(SEL_CAP);
  if (error) throw new Error(`Citire ${table}: ${error.message}`);
  return data || [];
}
function* chunked(arr, n) { for (let i = 0; i < arr.length; i += n) yield arr.slice(i, i + n); }
const low = (v) => (v ?? '').toString().trim().toLowerCase();

async function run() {
  if (typeArg === 'groups') {
    const have = new Set((await fetchAll('piese_part_groups', 'name_ro')).map((g) => low(g.name_ro)));
    const seen = new Set();
    const toInsert = records.filter((r) => { const k = low(r.name_ro); if (have.has(k) || seen.has(k)) return false; seen.add(k); return true; });
    skipped = records.length - toInsert.length;
    for (const chunk of chunked(toInsert, 200)) { const { error } = await sb.from('piese_part_groups').insert(chunk); if (error) throw new Error(error.message); inserted += chunk.length; }
  } else if (typeArg === 'suppliers') {
    const have = new Set((await fetchAll('piese_suppliers', 'name')).map((s) => low(s.name)));
    const seen = new Set();
    const toInsert = records.filter((r) => { const k = low(r.name); if (have.has(k) || seen.has(k)) return false; seen.add(k); return true; });
    skipped = records.length - toInsert.length;
    for (const chunk of chunked(toInsert, 200)) { const { error } = await sb.from('piese_suppliers').insert(chunk); if (error) throw new Error(error.message); inserted += chunk.length; }
  } else {
    // parts: rezolvă/creează grupa (group_id NOT NULL); dedup pe barcode, iar fără barcode pe cheia compusă.
    const groupId = new Map((await fetchAll('piese_part_groups', 'id, name_ro')).map((g) => [low(g.name_ro), g.id]));
    const existing = await fetchAll('piese_parts', 'barcode, name_long, manufacturer, model, article_code');
    const composite = (p) => [p.name_long, p.manufacturer, p.model, p.article_code].map(low).join('|');
    const haveBarcode = new Set(existing.map((p) => p.barcode).filter(Boolean));
    const haveComposite = new Set(existing.map(composite));

    for (const r of records) {
      const gkey = low(r.group);
      let gid = groupId.get(gkey);
      if (!gid) {
        const { data, error } = await sb.from('piese_part_groups').insert({ name_ro: r.group.trim() }).select('id').single();
        if (error) throw new Error(`Grupă „${r.group}": ${error.message}`);
        gid = data.id; groupId.set(gkey, gid);
      }
      const ckey = composite(r);
      if (r.barcode && haveBarcode.has(r.barcode)) { skipped++; continue; }
      if (!r.barcode && haveComposite.has(ckey)) { skipped++; continue; }
      const { error } = await sb.from('piese_parts').insert({ group_id: gid, name_long: r.name_long, manufacturer: r.manufacturer, model: r.model, article_code: r.article_code, oem_code: r.oem_code, barcode: r.barcode, unit: r.unit, is_for_sale: r.is_for_sale });
      if (error) { if (error.code === '23505') { skipped++; continue; } throw new Error(`Piesă „${r.name_long}": ${error.message}`); }
      if (r.barcode) haveBarcode.add(r.barcode);
      haveComposite.add(ckey);
      inserted++;
    }
  }
}

run().then(() => {
  console.log(`\nGata. Inserate: ${inserted}, sărite (duplicate/existente): ${skipped}.`);
  process.exit(0);
}).catch((e) => { console.error('Eroare la import (oprire):', e.message || e); process.exit(1); });
