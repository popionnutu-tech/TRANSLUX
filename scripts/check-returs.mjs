import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'apps/web/.env' });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Check routes with chisinau time containing 8
const { data: routes, error: routesErr } = await db
  .from('crm_routes')
  .select('id, dest_to_ro, time_chisinau, time_nord')
  .eq('active', true);

console.log(`Total active routes: ${routes?.length}, error: ${routesErr?.message || 'none'}`);
const r8 = (routes || []).filter(r => r.time_chisinau && r.time_chisinau.match(/^0?8:00/));
console.log('Routes with chisinau ~8:00:', r8.map(r => `${r.id}:${r.dest_to_ro}=${r.time_chisinau}`));

// Check assignments on multiple dates
for (const d of ['2026-04-04', '2026-04-05']) {
  const { data: a } = await db.from('daily_assignments').select('id, crm_route_id, retur_route_id').eq('assignment_date', d);
  console.log(`\nAssignments on ${d}: ${a?.length || 0}`);
  const withRetur = (a || []).filter(x => x.retur_route_id);
  if (withRetur.length) console.log('  With retur:', withRetur.map(x => `route=${x.crm_route_id} retur=${x.retur_route_id}`));
}
