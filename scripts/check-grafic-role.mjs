import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Check grafic user
const { data: grafic } = await supabase
  .from('admin_accounts')
  .select('id, email, role')
  .eq('email', 'grafic@translux.md')
  .single();

console.log('Grafic user:', JSON.stringify(grafic, null, 2));

// Check all accounts roles
const { data: all } = await supabase
  .from('admin_accounts')
  .select('email, role');

console.log('\nAll accounts:');
for (const a of all || []) {
  console.log(`  ${a.email} → role: ${JSON.stringify(a.role)}`);
}
