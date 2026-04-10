import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SOURCE_DATE = '2026-04-01';
const TARGET_DATES = ['2026-04-03', '2026-04-04', '2026-04-05', '2026-04-06', '2026-04-07'];

async function copy() {
  const { data: source, error: srcErr } = await db
    .from('daily_assignments')
    .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur, retur_route_id')
    .eq('assignment_date', SOURCE_DATE);

  if (srcErr) { console.error('Error fetching source:', srcErr); return; }
  if (!source?.length) { console.log('No assignments on', SOURCE_DATE); return; }

  console.log(`Found ${source.length} assignments on ${SOURCE_DATE}`);

  for (const targetDate of TARGET_DATES) {
    const rows = source.map(s => ({
      crm_route_id: s.crm_route_id,
      driver_id: s.driver_id,
      vehicle_id: s.vehicle_id,
      vehicle_id_retur: s.vehicle_id_retur,
      retur_route_id: s.retur_route_id,
      assignment_date: targetDate,
    }));

    const { error } = await db
      .from('daily_assignments')
      .upsert(rows, { onConflict: 'crm_route_id,assignment_date' });

    if (error) {
      console.error(`Error copying to ${targetDate}:`, error.message);
    } else {
      console.log(`Copied ${rows.length} assignments to ${targetDate}`);
    }
  }

  // Verify
  const { data: verify } = await db
    .from('daily_assignments')
    .select('assignment_date')
    .in('assignment_date', TARGET_DATES);

  const byDate = {};
  for (const r of verify || []) {
    byDate[r.assignment_date] = (byDate[r.assignment_date] || 0) + 1;
  }
  console.log('\nVerification:');
  console.table(byDate);
}

copy();
