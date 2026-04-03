import { readFileSync } from 'fs';

const SUPABASE_PROJECT_REF = 'zqkzqpfdymddsywxjxow';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('Set SUPABASE_ACCESS_TOKEN env var (Management API token from supabase.com/dashboard/account/tokens)');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node run-migration.mjs <path-to-sql-file>');
  process.exit(1);
}

const sql = readFileSync(migrationFile, 'utf8');

console.log(`Running migration: ${migrationFile}`);
console.log(`SQL length: ${sql.length} chars`);

const resp = await fetch(
  `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  }
);

if (!resp.ok) {
  const text = await resp.text();
  console.error(`Error ${resp.status}: ${text}`);
  process.exit(1);
}

const result = await resp.json();
console.log('Migration applied successfully!');
console.log(JSON.stringify(result, null, 2));
