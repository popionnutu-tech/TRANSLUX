// Разовый добивочный импорт запчастей — пачками по 500 с повтором (устойчиво к блипам).
// Дедуп по той же логике, что import-piese-catalog.mjs (barcode / name+mfr+model+article).
// Запуск: SUPABASE_URL=.. SUPABASE_SERVICE_KEY=.. node scripts/_finish-parts.mjs ~/Downloads/piese-parts.csv
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const low = (v) => (v ?? '').toString().trim().toLowerCase();

function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let f = '', row = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ';') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const rows = parseCSV(readFileSync(process.argv[2], 'utf8'));
const data = rows.slice(1).map((r) => ({
  group: (r[0] || '').trim(), name_long: (r[1] || '').trim(),
  manufacturer: (r[2] || '').trim() || null, model: null,
  article_code: (r[3] || '').trim() || null, oem_code: null,
  barcode: (r[4] || '').trim() || null, unit: (r[5] || '').trim() || 'buc', is_for_sale: false,
})).filter((r) => r.group && r.name_long);

const composite = (p) => [p.name_long, p.manufacturer, p.model, p.article_code].map(low).join('|');
async function fetchAll(table, cols) { const { data, error } = await sb.from(table).select(cols).limit(100000); if (error) throw new Error(table + ': ' + error.message); return data || []; }

const gmap = new Map((await fetchAll('piese_part_groups', 'id, name_ro')).map((g) => [low(g.name_ro), g.id]));
const existing = await fetchAll('piese_parts', 'barcode, name_long, manufacturer, model, article_code');
const haveBC = new Set(existing.map((p) => p.barcode).filter(Boolean));
const haveComp = new Set(existing.map(composite));
console.log(`existing parts: ${existing.length}, groups: ${gmap.size}`);

const toInsert = [];
for (const r of data) {
  if (r.barcode && haveBC.has(r.barcode)) continue;
  if (!r.barcode && haveComp.has(composite(r))) continue;
  let gid = gmap.get(low(r.group));
  if (!gid) { const { data: g, error } = await sb.from('piese_part_groups').insert({ name_ro: r.group }).select('id').single(); if (error) throw new Error('grupa ' + r.group + ': ' + error.message); gid = g.id; gmap.set(low(r.group), gid); }
  if (r.barcode) haveBC.add(r.barcode);
  haveComp.add(composite(r));
  toInsert.push({ group_id: gid, name_long: r.name_long, manufacturer: r.manufacturer, model: r.model, article_code: r.article_code, oem_code: r.oem_code, barcode: r.barcode, unit: r.unit, is_for_sale: r.is_for_sale });
}
console.log(`to insert: ${toInsert.length}`);

const B = 500; let done = 0;
for (let i = 0; i < toInsert.length; i += B) {
  const batch = toInsert.slice(i, i + B);
  let ok = false;
  for (let a = 1; a <= 6 && !ok; a++) {
    const { error } = await sb.from('piese_parts').insert(batch);
    if (!error) { ok = true; done += batch.length; }
    else if (error.code === '23505') { // редкий дубль внутри пачки — построчно, пропуская дубли
      let sub = 0; for (const rec of batch) { const { error: e2 } = await sb.from('piese_parts').insert(rec); if (!e2) sub++; else if (e2.code !== '23505') { console.error('row err:', e2.message); } }
      ok = true; done += sub;
    } else { console.error(`batch@${i} try ${a}: ${error.message}`); await new Promise((res) => setTimeout(res, 1500 * a)); }
  }
  if (!ok) { console.error('BATCH FAILED after retries at offset', i); process.exit(1); }
  console.log(`progress: ${done}/${toInsert.length}`);
}
console.log(`DONE. inserted this run: ${done}`);
process.exit(0);
