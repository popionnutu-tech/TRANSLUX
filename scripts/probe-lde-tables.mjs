import { readFileSync } from 'fs';

// Load .env (SUPABASE_URL + SUPABASE_SERVICE_KEY)
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;

const tables = [
  // 203
  'lde_vehicle_types', 'lde_vehicle_norms', 'lde_uzine', 'lde_factory_routes',
  'lde_factory_route_shifts', 'lde_factory_route_vehicles', 'lde_driver_extras',
  'lde_active_assignments', 'lde_audit_log',
  // 205
  'lde_vehicle_gps_daily', 'lde_fuel_alimentari', 'lde_fuel_alimentari_cash',
  'lde_plin_events', 'lde_dt_alerts', 'lde_dt_indications', 'lde_dt_drivers_window',
  // 206
  'lde_route_geometry', 'lde_daily_route_execution', 'lde_deviation_events',
  'lde_speed_events', 'lde_marsrut_repeat_alert', 'lde_parking_locations',
  // 208
  'lde_salary_runs', 'lde_salary_uzine_monthly', 'lde_salary_breakdown',
  'lde_school_periods', 'lde_extra_orders', 'lde_salary_audit',
];

const out = {};
for (const t of tables) {
  const r = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=0`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact' },
  });
  if (r.ok) {
    const cr = r.headers.get('content-range'); // e.g. "0-0/12" or "*/0"
    const count = cr ? cr.split('/')[1] : '?';
    out[t] = `EXISTS (rows=${count})`;
  } else {
    const body = await r.json().catch(() => ({}));
    out[t] = `MISSING (${r.status} ${body.code || ''} ${body.message || ''})`;
  }
}

// probe column-level: 209 (lde_vehicle_norms.measured_consumption nullable can't be seen via REST easily)
//                     210 (lde_dt_alerts.pererashod_l_per_100km column)
let col210 = 'n/a (lde_dt_alerts missing)';
if (out['lde_dt_alerts']?.startsWith('EXISTS')) {
  const r = await fetch(`${URL_}/rest/v1/lde_dt_alerts?select=pererashod_l_per_100km,vehicle_in_repair&limit=0`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  col210 = r.ok ? 'COLUMNS EXIST (210 applied)' : `COLUMNS MISSING (210 not applied) [${r.status}]`;
}

for (const [k, v] of Object.entries(out)) console.log(`${k.padEnd(34)} ${v}`);
console.log('---');
console.log(`210 dt_alerts columns: ${col210}`);
