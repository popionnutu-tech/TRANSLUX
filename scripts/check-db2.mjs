import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Simple select
const { data, error } = await db
  .from('reports')
  .select('id, report_date, point, status')
  .order('created_at', { ascending: false })
  .limit(5);

console.log('Last 5 reports:', JSON.stringify(data, null, 2));
if (error) console.log('Error:', error);

// Check trips
const { data: trips, error: err2 } = await db
  .from('trips')
  .select('id, departure_time, direction')
  .eq('active', true)
  .limit(3);

console.log('\nTrips sample:', JSON.stringify(trips, null, 2));
if (err2) console.log('Trips error:', err2);

// Check users
const { data: users, error: err3 } = await db
  .from('users')
  .select('id, username, point, active')
  .eq('active', true)
  .limit(3);

console.log('\nUsers sample:', JSON.stringify(users, null, 2));
if (err3) console.log('Users error:', err3);
