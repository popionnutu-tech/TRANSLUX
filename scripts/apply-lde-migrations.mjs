import { readFileSync } from 'fs';

// Reads SUPABASE_ACCESS_TOKEN from process.env first, then from .env as fallback.
function loadEnv() {
  try {
    return Object.fromEntries(
      readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        })
    );
  } catch {
    return {};
  }
}

const env = loadEnv();
const PROJECT_REF = 'zqkzqpfdymddsywxjxow';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error(
    'Missing SUPABASE_ACCESS_TOKEN (Supabase Management API personal access token,\n' +
    'starts with "sbp_", from https://supabase.com/dashboard/account/tokens).\n' +
    'Add it to .env as  SUPABASE_ACCESS_TOKEN=sbp_...  or export it, then re-run.'
  );
  process.exit(1);
}

// Strict dependency order. 203 tables -> 204 seed -> 205 dt -> 206 marsrut
// -> 207 indexes -> 208 salary -> 209 alter norms -> 210 alter dt_alerts.
const MIGRATIONS = [
  '203_lde_phase1_foundation.sql',
  '204_lde_seed_data.sql',
  '205_lde_dt_engine.sql',
  '206_lde_marsrut_abateri.sql',
  '207_lde_fk_indexes.sql',
  '208_lde_salary_engine.sql',
  '209_lde_vehicle_type_assignment.sql',
  '210_lde_dt_alerts_pererashod.sql',
];

const dir = new URL('../packages/db/migrations/', import.meta.url);

async function runQuery(sql) {
  const resp = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    }
  );
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text };
}

for (const file of MIGRATIONS) {
  const sql = readFileSync(new URL(file, dir), 'utf8');
  process.stdout.write(`→ ${file} (${sql.length} chars) ... `);
  const r = await runQuery(sql);
  if (!r.ok) {
    console.log(`FAILED (${r.status})`);
    console.error(`\nError applying ${file}:\n${r.text}`);
    console.error('\nStopped. Each migration is BEGIN/COMMIT-atomic, so this one rolled back fully. Already-applied earlier ones stay.');
    process.exit(1);
  }
  console.log('OK');
}

console.log('\nAll 8 LDE migrations (203–210) applied successfully.');
