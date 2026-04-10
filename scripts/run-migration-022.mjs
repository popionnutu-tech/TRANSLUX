import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Migration 023: Add crm_route_id to trips and populate mapping

const mapping = [
  { time: '06:55:00', crm: 11 },
  { time: '07:35:00', crm: 12 },
  { time: '08:15:00', crm: 13 },
  { time: '08:50:00', crm: 10 },
  { time: '09:30:00', crm: 15 },
  { time: '10:10:00', crm: 14 },
  { time: '10:40:00', crm: 16 },
  { time: '11:20:00', crm: 1 },
  { time: '11:55:00', crm: 6 },
  { time: '12:30:00', crm: 20 },
  { time: '13:00:00', crm: 18 },
  { time: '13:30:00', crm: 22 },
  { time: '13:55:00', crm: 17 },
  { time: '14:20:00', crm: 19 },
  { time: '14:50:00', crm: 24 },
  { time: '15:15:00', crm: 23 },
  { time: '15:40:00', crm: 27 },
  { time: '15:55:00', crm: 3 },
  { time: '16:20:00', crm: 25 },
  { time: '16:45:00', crm: 28 },
  { time: '17:20:00', crm: 26 },
  { time: '17:50:00', crm: 5 },
  { time: '18:10:00', crm: 29 },
  { time: '18:30:00', crm: 7 },
  { time: '18:55:00', crm: 21 },
  { time: '19:25:00', crm: 9 },
  { time: '20:00:00', crm: 8 },
];

let ok = 0;
let fail = 0;

for (const m of mapping) {
  const { data, error } = await db
    .from('trips')
    .update({ crm_route_id: m.crm })
    .eq('departure_time', m.time)
    .eq('direction', 'CHISINAU_BALTI')
    .select('id, departure_time');

  if (error) {
    console.log(`FAIL ${m.time} → crm_route ${m.crm}: ${error.message}`);
    fail++;
  } else {
    console.log(`OK   ${m.time} → crm_route ${m.crm}  (${data?.length || 0} rows)`);
    ok++;
  }
}

console.log(`\nDone: ${ok} OK, ${fail} failed`);

// Verify
const { data: all } = await db
  .from('trips')
  .select('departure_time, crm_route_id')
  .eq('direction', 'CHISINAU_BALTI')
  .eq('active', true)
  .order('departure_time', { ascending: true });

console.log('\n--- Verification ---');
for (const t of all || []) {
  console.log(`${t.departure_time.slice(0,5)} → crm_route_id: ${t.crm_route_id ?? 'NULL'}`);
}
