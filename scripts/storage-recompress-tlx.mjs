#!/usr/bin/env node
// Recompress large images in TLX Supabase Storage buckets.
// Default: dry run. Pass --apply to actually reupload.
// Usage:
//   node scripts/storage-recompress-tlx.mjs            # dry run, z-reports
//   node scripts/storage-recompress-tlx.mjs --apply    # actually reupload
//   node scripts/storage-recompress-tlx.mjs --bucket=cash-receipts --apply

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const TLX_URL = 'https://tvefsxwqsopfboiaikeq.supabase.co';
const TLX_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2ZWZzeHdxc29wZmJvaWFpa2VxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ0NzQzNSwiZXhwIjoyMDg4MDIzNDM1fQ.fmqn806-pj3nmemMCH_r6s1AWka33OGvVOJlWwG_P-s';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const bucketArg = args.find((a) => a.startsWith('--bucket='));
const BUCKET = bucketArg ? bucketArg.split('=')[1] : 'z-reports';
const MIN_SIZE = 400 * 1024; // skip files smaller than 400 KB
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 75;
const CONCURRENCY = 4;

const supabase = createClient(TLX_URL, TLX_SERVICE_KEY);

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

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
        mimetype: item.metadata?.mimetype ?? '',
        created: item.created_at,
      });
    }
  }
  return acc;
}

async function processOne(file) {
  const { data, error } = await supabase.storage.from(BUCKET).download(file.path);
  if (error) throw new Error(`download failed: ${error.message}`);
  const buf = Buffer.from(await data.arrayBuffer());

  let pipeline = sharp(buf, { failOn: 'none' }).rotate();
  const meta = await sharp(buf, { failOn: 'none' }).metadata();
  if (meta.width && meta.width > MAX_WIDTH) {
    pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
  }
  const out = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();

  if (out.length >= file.size * 0.9) {
    return { skipped: true, oldSize: file.size, newSize: out.length };
  }

  if (APPLY) {
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(file.path, out, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (upErr) throw new Error(`upload failed: ${upErr.message}`);
  }

  return { skipped: false, oldSize: file.size, newSize: out.length };
}

async function runPool(items, worker) {
  let i = 0;
  let done = 0;
  const total = items.length;
  const results = new Array(total);
  async function next() {
    while (i < total) {
      const idx = i++;
      try {
        results[idx] = await worker(items[idx]);
      } catch (e) {
        results[idx] = { error: e.message };
      }
      done++;
      if (done % 25 === 0 || done === total) {
        process.stdout.write(`\r  progress: ${done}/${total}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
  process.stdout.write('\n');
  return results;
}

console.log(`\nBucket: ${BUCKET}`);
console.log(`Mode: ${APPLY ? 'APPLY (will reupload)' : 'DRY RUN'}`);
console.log(`Min size: ${fmtBytes(MIN_SIZE)}, max width: ${MAX_WIDTH}px, jpeg q: ${JPEG_QUALITY}\n`);

console.log('Listing files...');
const all = await listAll();
console.log(`  Total: ${all.length} files, ${fmtBytes(all.reduce((s, f) => s + f.size, 0))}`);

const candidates = all.filter((f) => f.size >= MIN_SIZE);
const candSize = candidates.reduce((s, f) => s + f.size, 0);
console.log(`  Candidates (>= ${fmtBytes(MIN_SIZE)}): ${candidates.length} files, ${fmtBytes(candSize)}\n`);

if (!candidates.length) {
  console.log('Nothing to do.');
  process.exit(0);
}

console.log(`Processing (concurrency ${CONCURRENCY})...`);
const results = await runPool(candidates, processOne);

let oldTotal = 0;
let newTotal = 0;
let skipped = 0;
let errors = 0;
for (const r of results) {
  if (!r) continue;
  if (r.error) {
    errors++;
    continue;
  }
  if (r.skipped) {
    skipped++;
    oldTotal += r.oldSize;
    newTotal += r.oldSize;
  } else {
    oldTotal += r.oldSize;
    newTotal += r.newSize;
  }
}

console.log('\n=== Summary ===');
console.log(`  Processed: ${candidates.length}`);
console.log(`  Skipped (gain < 10%): ${skipped}`);
console.log(`  Errors: ${errors}`);
console.log(`  Before: ${fmtBytes(oldTotal)}`);
console.log(`  After:  ${fmtBytes(newTotal)}`);
console.log(`  Saved:  ${fmtBytes(oldTotal - newTotal)} (${((1 - newTotal / oldTotal) * 100).toFixed(1)}%)`);
if (!APPLY) {
  console.log('\n(DRY RUN — nothing was uploaded. Re-run with --apply to perform the reupload.)');
}

if (errors) {
  console.log('\nFirst 5 errors:');
  let shown = 0;
  for (let i = 0; i < results.length && shown < 5; i++) {
    if (results[i]?.error) {
      console.log(`  ${candidates[i].path}: ${results[i].error}`);
      shown++;
    }
  }
}
