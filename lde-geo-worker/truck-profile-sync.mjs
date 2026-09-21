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
// A doua dovadă, din urma GPS (Ion, 21.09.2026): camionul din flota de camioane
// fără tip care a stat de cel puțin două ori, peste pragul punctului, la un punct
// de încărcare, e cisternă. Recepțiile TLX singure nu ajung — cisterna care duce
// numai biodiesel în Bulgaria nu descarcă niciodată la o stație TLX, deci rămânea
// fără tip, iar automatul de stări sare camionul fără tip (RWN193, «tip?» în mini
// app, nevăzut de pe 09.09). Regula stă în camion-auto.mjs (cisterneDinOpriri).
//
// Rulare:  node --env-file=.env truck-profile-sync.mjs [--write]
// ============================================================================
import { planCisterneDinTlx, ZILE_CISTERNA_DIN_TLX } from './trip-auto.mjs';
import { cisterneDinOpriri } from './camion-auto.mjs';

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

/** Cât înapoi se caută în urma GPS opririle care dovedesc o cisternă. */
const ZILE_CISTERNA_DIN_GPS = 60;
/** Sub atâtea minute o oprire nu e încărcare nicăieri (cel mai mic prag din PRAG_MIN). */
const OPRIRE_MIN_MINUTE = 45;

/**
 * Cisternele din urma GPS, pentru camioanele care n-au încă tip. Opririle se
 * citesc pe camion, nu pe toată flota deodată: PostgREST taie orice răspuns la
 * 1000 de rânduri, iar 60 de zile × zeci de camioane trec ușor de plafon și ar
 * pierde tăcut exact mașina căutată.
 */
async function cisterneleDinGps(vehicule, profiluri, acumMs) {
  const cuTip = new Set((profiluri || []).filter((p) => p.fleet_type).map((p) => p.vehicle_id));
  // Doar flota de camioane: `vehicule` e toată flota activă, autobuze cu tot, iar
  // regula asta n-are ce căuta la ele — nici ca citire pe mașină, nici ca verdict.
  const faraTip = (vehicule || []).filter((v) => !cuTip.has(v.id)
    && Array.isArray(v.directions) && v.directions.includes('camioane'));
  if (faraTip.length === 0) return { cisterneNoi: [], conflicte: [] };
  const puncte = await sb('lde_dispatch_points?select=id,name,lat,lng,radius_m,kind&active=is.true&limit=1000');
  const incarcari = (puncte || [])
    .filter((p) => p.kind === 'incarcare_diesel' || p.kind === 'incarcare_biodiesel')
    .map((p) => ({ id: p.id, lat: p.lat, lon: p.lng, radius_m: p.radius_m, kind: p.kind }));
  if (incarcari.length === 0) return { cisterneNoi: [], conflicte: [] };

  const deLa = new Date(acumMs - ZILE_CISTERNA_DIN_GPS * 86400e3).toISOString().slice(0, 10);
  const opriri = [];
  for (const v of faraTip) {
    const rows = await sb(`lde_gps_stops?select=vehicle_id,lat,lon,dwell_min` +
      `&vehicle_id=eq.${v.id}&date=gte.${deLa}&dwell_min=gte.${OPRIRE_MIN_MINUTE}&limit=1000`);
    for (const r of rows || []) opriri.push(r);
  }
  return cisterneDinOpriri(opriri, incarcari, faraTip, profiluri);
}

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

  // A doua dovadă: urma GPS (Ion, 21.09). Cisterna care duce numai biodiesel în
  // Bulgaria nu apare niciodată într-o recepție TLX, deci prima regulă n-o vede
  // niciodată — iar fără tip automatul de stări o sare cu totul (RWN193).
  const planGps = await cisterneleDinGps(vehicule || [], profiluri || [], acumMs);
  const dejaCisterna = new Set(plan.cisterneNoi.map((c) => c.vehicleId));
  for (const c of planGps.cisterneNoi) {
    if (dejaCisterna.has(c.vehicleId)) continue;
    plan.cisterneNoi.push({ vehicleId: c.vehicleId, plate: c.plate, dinGps: c.opriri });
  }
  for (const c of planGps.conflicte) {
    console.error(`  CONFLICT ${c.plate}: e «${c.fleetType}» în TRANSLUX, dar a stat de ${c.opriri} ori la un punct de încărcare — de lămurit de om`);
  }

  for (const c of plan.cisterneNoi) console.log(`  ${c.plate}: devine cisternă${c.dinGps ? ` (${c.dinGps} opriri lungi la puncte de încărcare)` : ''}`);
  for (const d of plan.directiiDeAdaugat) console.log(`  ${d.plate}: intră în flota de camioane`);
  for (const c of plan.conflicte) console.error(`  CONFLICT ${c.plate}: e «${c.fleetType}» în TRANSLUX, dar a descărcat carburant la TLX — de lămurit de om`);
  if (plan.necunoscute.length) console.log(`  în TLX, fără mașină în TRANSLUX: ${plan.necunoscute.join(', ')}`);
  if (!WRITE) return;

  if (plan.cisterneNoi.length) {
    await sb('lde_truck_profile?on_conflict=vehicle_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(plan.cisterneNoi.map((c) => ({
        vehicle_id: c.vehicleId, fleet_type: 'cisterna',
        updated_by: c.dinGps ? 'auto:gps' : 'auto:tlx', updated_at: new Date().toISOString(),
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
