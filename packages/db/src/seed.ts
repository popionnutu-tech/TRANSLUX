import 'dotenv/config';
import { getSupabaseClient } from './supabase.js';
import bcrypt from 'bcryptjs';
const { hash } = bcrypt;

async function seed() {
  const supabase = getSupabaseClient();

  console.log('Seeding TRANSLUX database...');

  // 1. Create admin account
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@translux.md';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const passwordHash = await hash(adminPassword, 12);

  const { data: admin, error: adminErr } = await supabase
    .from('admin_accounts')
    .upsert({ email: adminEmail, password_hash: passwordHash }, { onConflict: 'email' })
    .select()
    .single();

  if (adminErr) {
    console.error('Admin creation error:', adminErr);
  } else {
    console.log(`Admin created: ${admin.email}`);
  }

  // 2. Seed routes
  const routeNames = [
    'Chișinău - Bălți',
    'Chișinău - Soroca',
    'Chișinău - Edineț',
    'Chișinău - Drochia',
    'Chișinău - Florești',
  ];

  const { data: routes, error: routesErr } = await supabase
    .from('routes')
    .upsert(
      routeNames.map((name) => ({ name, active: true })),
      { onConflict: 'name' }
    )
    .select();

  if (routesErr) {
    console.error('Routes error:', routesErr);
  } else {
    console.log(`Routes seeded: ${routes.length}`);
  }

  // 3. Seed drivers
  const driverNames = [
    'Moldovan Ion',
    'Popa Vasile',
    'Rusu Andrei',
    'Ceban Dumitru',
    'Grosu Nicolae',
    'Lungu Sergiu',
    'Cojocaru Mihai',
    'Botnaru Pavel',
  ];

  const { data: drivers, error: driversErr } = await supabase
    .from('drivers')
    .upsert(
      driverNames.map((full_name) => ({ full_name, active: true })),
      { onConflict: 'full_name' }
    )
    .select();

  if (driversErr) {
    console.error('Drivers error:', driversErr);
  } else {
    console.log(`Drivers seeded: ${drivers.length}`);
  }

  // 4. Seed trips
  if (routes && routes.length > 0) {
    const tripTimes = ['06:00', '07:30', '09:00', '11:00', '13:00', '15:00', '17:00', '19:00'];

    const trips: Array<{
      route_id: string;
      direction: string;
      departure_time: string;
      active: boolean;
    }> = [];

    for (const route of routes) {
      for (const time of tripTimes) {
        // Both directions for each route
        trips.push({
          route_id: route.id,
          direction: 'CHISINAU_BALTI',
          departure_time: time,
          active: true,
        });
        trips.push({
          route_id: route.id,
          direction: 'BALTI_CHISINAU',
          departure_time: time,
          active: true,
        });
      }
    }

    const { data: insertedTrips, error: tripsErr } = await supabase
      .from('trips')
      .upsert(trips, { onConflict: 'route_id,direction,departure_time' })
      .select();

    if (tripsErr) {
      console.error('Trips error:', tripsErr);
    } else {
      console.log(`Trips seeded: ${insertedTrips.length}`);
    }
  }

  console.log('Seed complete.');
}

seed().catch(console.error);
