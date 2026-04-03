import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
console.log(`Seeding assignments for: ${today}`);

// Fetch routes, drivers, vehicles, trips in parallel
const [routesRes, driversRes, vehiclesRes, tripsRes] = await Promise.all([
  supabase.from('crm_routes').select('id, dest_to_ro, time_chisinau').eq('active', true),
  supabase.from('drivers').select('id, full_name, phone').eq('active', true).not('phone', 'is', null),
  supabase.from('vehicles').select('id, plate_number').eq('active', true),
  supabase.from('trips').select('id').eq('active', true),
]);

const routes = routesRes.data || [];
const drivers = driversRes.data || [];
const vehicles = vehiclesRes.data || [];
const trips = tripsRes.data || [];

console.log(`Found: ${routes.length} routes, ${drivers.length} drivers, ${vehicles.length} vehicles, ${trips.length} trips`);

if (drivers.length === 0) {
  console.error('No active drivers found!');
  process.exit(1);
}
if (routes.length === 0) {
  console.error('No active routes found!');
  process.exit(1);
}

// Delete existing assignments for today first
const { error: delErr } = await supabase
  .from('daily_assignments')
  .delete()
  .eq('assignment_date', today);

if (delErr) {
  console.error('Error deleting existing:', delErr.message);
  process.exit(1);
}

// Shuffle helper
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Assign random driver + vehicle to each route
const shuffledDrivers = shuffle(drivers);
const shuffledVehicles = vehicles.length > 0 ? shuffle(vehicles) : [];
const shuffledTrips = trips.length > 0 ? shuffle(trips) : [];

const rows = routes.map((route, i) => ({
  crm_route_id: route.id,
  assignment_date: today,
  driver_id: shuffledDrivers[i % shuffledDrivers.length].id,
  vehicle_id: shuffledVehicles.length > 0
    ? shuffledVehicles[i % shuffledVehicles.length].id
    : null,
  trip_id: shuffledTrips.length > 0
    ? shuffledTrips[i % shuffledTrips.length].id
    : null,
}));

const { error: insertErr } = await supabase
  .from('daily_assignments')
  .insert(rows);

if (insertErr) {
  console.error('Error inserting:', insertErr.message);
  process.exit(1);
}

console.log(`\nCreated ${rows.length} assignments for ${today}:`);
for (const row of rows) {
  const route = routes.find(r => r.id === row.crm_route_id);
  const driver = drivers.find(d => d.id === row.driver_id);
  const vehicle = vehicles.find(v => v.id === row.vehicle_id);
  console.log(`  ${route.time_chisinau?.split(' - ')[0] || '??:??'} ${route.dest_to_ro} → ${driver.full_name} ${vehicle ? `(${vehicle.plate_number})` : ''}`);
}
