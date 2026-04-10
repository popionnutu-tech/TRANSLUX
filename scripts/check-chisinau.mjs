import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Check Chisinau reports for this week
const { data, count } = await db
  .from('reports')
  .select('id, report_date, point, status, passengers_count', { count: 'exact' })
  .eq('point', 'CHISINAU')
  .gte('report_date', '2026-03-30')
  .lte('report_date', '2026-04-05')
  .is('cancelled_at', null)
  .limit(5);

console.log(`Chisinau reports (03/30-04/05): ${count}`);
console.log(JSON.stringify(data, null, 2));

// Check Balti
const { count: baltiCount } = await db
  .from('reports')
  .select('id', { count: 'exact' })
  .eq('point', 'BALTI')
  .gte('report_date', '2026-03-30')
  .lte('report_date', '2026-04-05')
  .is('cancelled_at', null);

console.log(`\nBalti reports (03/30-04/05): ${baltiCount}`);

// Check which Vercel project env var is set
console.log('\nLocal SUPABASE_SERVICE_KEY starts with:', process.env.SUPABASE_SERVICE_KEY?.substring(0, 20));
