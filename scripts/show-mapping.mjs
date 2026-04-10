import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Get trips (operator schedule)
const { data: trips } = await db
  .from('trips')
  .select('id, departure_time, route_id')
  .eq('direction', 'CHISINAU_BALTI')
  .eq('active', true)
  .order('departure_time', { ascending: true });

// Get crm_routes (site/grafic schedule)
const { data: routes } = await db
  .from('crm_routes')
  .select('id, time_chisinau, dest_to_ro')
  .eq('active', true)
  .order('id', { ascending: true });

console.log('=== TRIPS (bot/operator) ===');
console.log('departure | trip_id');
for (const t of trips) {
  console.log(`${t.departure_time.slice(0,5)}      | ${t.id}`);
}

console.log('\n=== CRM_ROUTES (site/grafic) ===');
console.log('id | time_chisinau          | destination');
for (const r of routes) {
  const dep = r.time_chisinau?.match(/(\d{1,2}:\d{2})/)?.[1] || '??';
  console.log(`${String(r.id).padStart(2)} | ${dep.padEnd(5)} (${r.time_chisinau?.padEnd(13) || '?'}) | ${r.dest_to_ro}`);
}

console.log(`\nTrips: ${trips.length}, CRM Routes: ${routes.length}`);
