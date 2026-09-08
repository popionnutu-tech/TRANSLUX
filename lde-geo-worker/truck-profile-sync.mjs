// ============================================================================
// LDE camioane — tipul camionului din recepțiile TLX (Ion, 08.09.2026):
// «automat, auto care au descărcări în ultimele 1–2 luni la TLX să se fixeze
// ca cisterne». Rulează noaptea (run-nightly.sh), după fuel-worker.
//
// Citește fuel_receipts din TLX (60 de zile), potrivește nr_auto cu vehicles
// din TRANSLUX și scrie:
//  · lde_truck_profile.fleet_type = 'cisterna' unde lipsea tipul;
//  · directions += 'camioane' unde mașina exista dar nu era în flota de camioane.
// NU răstoarnă un «zernovoz» pus de om — îl scrie în log ca conflict.
// Plăcuțele din TLX fără mașină în TRANSLUX se scriu în log ca necunoscute.
// Regula stă în trip-auto.mjs (planCisterneDinTlx), testată.
//
// Rulare:  node --env-file=.env truck-profile-sync.mjs [--write]
// ============================================================================
import { planCisterneDinTlx, ZILE_CISTERNA_DIN_TLX } from './trip-auto.mjs';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const TLX_URL = process.env.TLX_SUPABASE_URL;
const TLX_KEY = process.env.TLX_SERVICE_KEY;
const WRITE = process.argv.includes('--write');

if (!SB_URL || !SB_KEY) { console.error('Lipsesc SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!TLX_URL || !TLX_KEY) { console.error('Lipsesc TLX_SUPABASE_URL / TLX_SERVICE_KEY'); process.exit(1); }

function rest(baseUrl, key) {
  return async (path, init = {}) => {
    const r = await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    const ct = r.headers.get('content-type') || '';
    if (r.status === 204 || !ct.includes('application/json')) return null;
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  };
}
const sb = rest(SB_URL, SB_KEY);
const tlx = rest(TLX_URL, TLX_KEY);

async function main() {
  const acumMs = Date.now();
  const deLa = new Date(acumMs - (ZILE_CISTERNA_DIN_TLX + 7) * 86400e3).toISOString();
  console.log(`[profile-sync] cisterne din recepțiile TLX ale ultimelor ${ZILE_CISTERNA_DIN_TLX} zile${WRITE ? '' : ' (probă)'}`);

  const [receptii, vehicule, profiluri] = await Promise.all([
    // created_at poate fi cu zile după unloaded_at — citim cu o marjă, judecata e pe momentul descărcării.
    tlx(`fuel_receipts?select=nr_auto,unloaded_at,created_at,is_deleted&nr_auto=not.is.null&created_at=gte.${encodeURIComponent(deLa)}&limit=2000`),
    sb('vehicles?select=id,plate_number,directions&active=eq.true&limit=2000'),
    sb('lde_truck_profile?select=vehicle_id,fleet_type&limit=2000'),
  ]);
  const plan = planCisterneDinTlx(receptii || [], vehicule || [], profiluri || [], acumMs);

  for (const c of plan.cisterneNoi) console.log(`  ${c.plate}: devine cisternă`);
  for (const d of plan.directiiDeAdaugat) console.log(`  ${d.plate}: intră în flota de camioane`);
  for (const c of plan.conflicte) console.error(`  CONFLICT ${c.plate}: e «${c.fleetType}» în TRANSLUX, dar a descărcat carburant la TLX — de lămurit de om`);
  if (plan.necunoscute.length) console.log(`  în TLX, fără mașină în TRANSLUX: ${plan.necunoscute.join(', ')}`);
  if (!WRITE) return;

  if (plan.cisterneNoi.length) {
    await sb('lde_truck_profile?on_conflict=vehicle_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(plan.cisterneNoi.map((c) => ({
        vehicle_id: c.vehicleId, fleet_type: 'cisterna', updated_by: 'auto:tlx', updated_at: new Date().toISOString(),
      }))),
    });
  }
  for (const d of plan.directiiDeAdaugat) {
    await sb(`vehicles?id=eq.${d.vehicleId}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ directions: d.directions }),
    });
  }
  console.log(`  scrise: ${plan.cisterneNoi.length} cisterne, ${plan.directiiDeAdaugat.length} direcții`);
}

main().catch((e) => { console.error('[profile-sync]', e); process.exit(1); });
