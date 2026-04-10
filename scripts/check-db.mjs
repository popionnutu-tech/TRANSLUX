import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Check reports count
const { data: reports, count, error } = await db
  .from('reports')
  .select('id', { count: 'exact', head: true })
  .gte('report_date', '2026-03-30')
  .lte('report_date', '2026-04-05')
  .is('cancelled_at', null);

console.log('Reports (03/30-04/05):', count, error ? `ERROR: ${error.message}` : '');

// Check total reports
const { count: total, error: err2 } = await db
  .from('reports')
  .select('id', { count: 'exact', head: true });

console.log('Total reports in DB:', total, err2 ? `ERROR: ${err2.message}` : '');

// Check if RLS is blocking by trying anon key
const dbAnon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { count: anonCount, error: err3 } = await dbAnon
  .from('reports')
  .select('id', { count: 'exact', head: true });

console.log('Reports via anon key:', anonCount, err3 ? `ERROR: ${err3.message}` : '');
