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

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

async function listAll(bucket, prefix = '', acc = []) {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw error;
  for (const item of data) {
    if (item.id === null) {
      await listAll(bucket, prefix ? `${prefix}/${item.name}` : item.name, acc);
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

const { data: buckets, error } = await supabase.storage.listBuckets();
if (error) {
  console.error('Error listing buckets:', error.message);
  process.exit(1);
}

console.log(`Found ${buckets.length} buckets:\n`);

let grandTotal = 0;
let grandCount = 0;

for (const b of buckets) {
  try {
    const files = await listAll(b.name);
    const size = files.reduce((s, f) => s + f.size, 0);
    grandTotal += size;
    grandCount += files.length;
    console.log(`  ${b.name.padEnd(30)} ${String(files.length).padStart(6)} files  ${fmtBytes(size).padStart(12)}  (public: ${b.public})`);

    if (size > 50 * 1024 * 1024) {
      const top = [...files].sort((a, b) => b.size - a.size).slice(0, 5);
      console.log(`    Top 5 largest in ${b.name}:`);
      for (const f of top) {
        console.log(`      ${fmtBytes(f.size).padStart(10)}  ${f.path}`);
      }
      const byMonth = {};
      for (const f of files) {
        const k = f.created ? f.created.slice(0, 7) : 'unknown';
        byMonth[k] = byMonth[k] || { count: 0, size: 0 };
        byMonth[k].count++;
        byMonth[k].size += f.size;
      }
      console.log(`    By month:`);
      for (const k of Object.keys(byMonth).sort()) {
        console.log(`      ${k}: ${byMonth[k].count} files, ${fmtBytes(byMonth[k].size)}`);
      }
    }
  } catch (e) {
    console.log(`  ${b.name.padEnd(30)} ERROR: ${e.message}`);
  }
}

console.log(`\nGRAND TOTAL: ${grandCount} files, ${fmtBytes(grandTotal)}`);
