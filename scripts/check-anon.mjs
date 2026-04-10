import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Check if anon key works at all (basic connectivity)
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const { data, error } = await db.from('offers').select('id').limit(1);
console.log('Anon key → offers:', data ? `OK (${data.length} rows)` : 'null', error ? `ERROR: ${error.message}` : '');

// Check URL is reachable
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
