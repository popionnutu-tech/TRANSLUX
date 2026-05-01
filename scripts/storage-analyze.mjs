#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const BUCKET = 'report-photos';

async function listAll(prefix = '', acc = []) {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw error;
  for (const item of data) {
    if (item.id === null) {
      await listAll(prefix ? `${prefix}/${item.name}` : item.name, acc);
    } else {
      acc.push({
        path: prefix ? `${prefix}/${item.name}` : item.name,
        size: item.metadata?.size ?? 0,
        created: item.created_at,
      });
    }
  }
  return acc;
}

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function monthKey(iso) {
  if (!iso) return 'unknown';
  return iso.slice(0, 7);
}

function ageBucket(iso) {
  if (!iso) return 'unknown';
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (days < 30) return '0-1 luna';
  if (days < 90) return '1-3 luni';
  if (days < 180) return '3-6 luni';
  if (days < 365) return '6-12 luni';
  return '>1 an';
}

console.log('Listing all files in bucket...');
const files = await listAll();
const total = files.reduce((s, f) => s + f.size, 0);
console.log(`\nTotal: ${files.length} files, ${fmtBytes(total)}\n`);

console.log('=== By month (created_at) ===');
const byMonth = {};
for (const f of files) {
  const k = monthKey(f.created);
  byMonth[k] = byMonth[k] || { count: 0, size: 0 };
  byMonth[k].count++;
  byMonth[k].size += f.size;
}
for (const k of Object.keys(byMonth).sort()) {
  const { count, size } = byMonth[k];
  console.log(`  ${k}: ${count} files, ${fmtBytes(size)}`);
}

console.log('\n=== By age ===');
const byAge = {};
const order = ['0-1 luna', '1-3 luni', '3-6 luni', '6-12 luni', '>1 an', 'unknown'];
for (const f of files) {
  const k = ageBucket(f.created);
  byAge[k] = byAge[k] || { count: 0, size: 0 };
  byAge[k].count++;
  byAge[k].size += f.size;
}
for (const k of order) {
  if (!byAge[k]) continue;
  const { count, size } = byAge[k];
  console.log(`  ${k}: ${count} files, ${fmtBytes(size)}`);
}

console.log('\n=== Top 10 largest files ===');
const top = [...files].sort((a, b) => b.size - a.size).slice(0, 10);
for (const f of top) {
  console.log(`  ${fmtBytes(f.size).padStart(10)}  ${f.path}`);
}

console.log('\n=== Orphan check (Storage files NOT in report_photos table) ===');
const { data: dbRows, error: dbErr } = await supabase
  .from('report_photos')
  .select('storage_path, file_path, path')
  .limit(100000);
if (dbErr) {
  console.log(`  Could not query report_photos: ${dbErr.message}`);
} else {
  const refs = new Set();
  for (const r of dbRows || []) {
    for (const v of Object.values(r)) if (v) refs.add(String(v));
  }
  const orphans = files.filter((f) => {
    if (refs.has(f.path)) return false;
    const name = f.path.split('/').pop();
    return ![...refs].some((r) => r.endsWith(name));
  });
  const orphanSize = orphans.reduce((s, f) => s + f.size, 0);
  console.log(`  DB rows: ${dbRows?.length ?? 0}, refs collected: ${refs.size}`);
  console.log(`  Orphans: ${orphans.length} files, ${fmtBytes(orphanSize)}`);
  if (orphans.length && orphans.length <= 20) {
    for (const o of orphans) console.log(`    ${o.path}  (${fmtBytes(o.size)})`);
  }
}
