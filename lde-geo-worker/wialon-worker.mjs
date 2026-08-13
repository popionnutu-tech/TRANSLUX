// ============================================================================
// LDE Wialon worker — CAMIOANELE (39 ACTROS) din Wialon API → Supabase.
// Aceeași conductă ca gps-worker (opriri + km/zi + cârpire sărituri), sursa
// fiind API-ul oficial Wialon (hst-api.wialon.com), nu BD directă.
// Diferențe intenționate față de gps-worker:
//   • viteza Wialon e în KM/H (nu noduri) → praguri convertite, fără ×1.852;
//   • citește lde_route_legs pentru cârpire, dar NU învață tronsoane noi
//     (traseele camioanelor nu trebuie să contamineze referința autobuzelor);
//   • fereastra zilei = TZ locală a VPS-ului (Europe/Chisinau, DST corect).
// Rulare: node --env-file=.env wialon-worker.mjs <YYYY-MM-DD>[,zi2...] [--write]
// ============================================================================
import fs from 'fs';
import { WebSocket as WS } from 'ws';
import { createClient } from '@supabase/supabase-js';
import { login, listUnits, loadTrack } from './wialon-api.mjs';
import { computeDay, plausibleBridgeKm, hav } from './km-core.mjs';
globalThis.WebSocket = globalThis.WebSocket || WS;

const args = process.argv.slice(2);
const DAYS = (args.find(a => /^\d{4}-\d{2}-\d{2}/.test(a)) || '').split(',').filter(Boolean);
const WRITE = args.includes('--write');
if (!DAYS.length) { console.error('Lipsește ziua: node wialon-worker.mjs 2026-07-07 [--write]'); process.exit(1); }

// ── parametri (aceiași ca gps-worker, viteza în km/h) ──
const BBOX = { latMin: 44, latMax: 55, lonMin: 8, lonMax: 32 };  // camioanele merg internațional (TIR) — bbox larg Europa Centrală/Est
const MOVING_KMH = 5.6;           // = 3 noduri (pragul gps-worker)
const STOP_KMH = 7.4;             // = 4 noduri
const STOP_MIN_S = 90;
const STOP_NEAR_KM = 2.0;         // = LDE_GEO_VILLAGE_PROXIMITY_KM (regulă fermă)
// pragurile de km (teleport/gaură/plafon) stau în km-core.mjs — comune cu gps-worker

const normPlate = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ── localități OSM (doar Moldova — în afara ei opririle rămân fără nume) ──
const places = [];
if (fs.existsSync(process.env.PLACES_FILE || '')) {
  for (const line of fs.readFileSync(process.env.PLACES_FILE, 'utf8').split('\n')) {
    const cl = line.replace(/\x1e/g, '').trim(); if (!cl) continue;
    let f; try { f = JSON.parse(cl); } catch { continue; }
    const nm = f.properties && (f.properties['name:ro'] || f.properties.name); if (!nm) continue;
    const [lon, lat] = f.geometry.coordinates; places.push({ name: nm, lat, lon });
  }
}
function locName(p) { let b=null,bd=Infinity; for(const pl of places){const d=hav(p,pl); if(d<bd){bd=d;b=pl.name;}} return bd<=STOP_NEAR_KM ? b : null; }

// ── conexiuni ──
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
let sid = (await login(process.env.WIALON_TOKEN)).sid;

// mapare plăcuță EXACTĂ normalizată: unitate Wialon ("ACTROS ANT 316 (!)") ↔ vehicles
const { data: vehs, error: ve } = await supa.from('vehicles').select('id,plate_number')
  .eq('active', true).contains('directions', ['camioane']);
if (ve) { console.error('Supabase vehicles:', ve.message); process.exit(1); }
const plate2veh = new Map((vehs || []).map(v => [normPlate(v.plate_number), v.id]));
const units = await listUnits(sid);
const fleet = [];
for (const u of units) {
  const m = u.name.match(/([A-Z]{3})\s?(\d{3})/);           // «ACTROS ANT 316 (…)» → ANT316
  if (!m) continue;
  const p = m[1] + m[2];
  if (plate2veh.has(p)) fleet.push({ unit: u.id, vehicle_id: plate2veh.get(p), plate: p });
}
console.log(`Camioane potrivite Wialon↔vehicles: ${fleet.length}/${units.length} | zile: ${DAYS.join(',')} | mod: ${WRITE ? 'SCRIE' : 'DRY'}`);

// PostgREST taie tăcut la «Max Rows» (default 1000) — tabelele de tronsoane au depășit pragul
async function fetchAll(table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from(table).select(cols).order('id', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`${table} (pagina de la ${from}): ${error.message}`); // referință parțială = km greșiți tăcuți — mai bine pică rulajul
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// referința tronsoane (READ-ONLY — nu învățăm din camioane)
const legs = new Map();
for (const l of await fetchAll('lde_route_legs', 'from_locality,to_locality,km_real_median'))
  legs.set(`${l.from_locality}→${l.to_locality}`, Number(l.km_real_median));

// tronsoane pe COORDONATE (migrația 227) — prioritare la cârpire; tot READ-ONLY.
// cheia = capetele rotunjite la 3 zecimale; ordinea capetelor = sensul
const coordLegs = [];
for (const l of await fetchAll('lde_route_legs_coord', 'from_lat,from_lon,to_lat,to_lon,km_real_median,observations'))
  coordLegs.push({ fa: { lat: +l.from_lat, lon: +l.from_lon }, fb: { lat: +l.to_lat, lon: +l.to_lon }, km: Number(l.km_real_median), obs: l.observations });
const COORD_NEAR_KM = 2.0;
function coordLegKm(a, b) { // tronsonul învățat cu capetele cele mai apropiate de gaură
  let best = null, bd = Infinity;
  for (const l of coordLegs) {
    const d1 = hav(a, l.fa); if (d1 > COORD_NEAR_KM) continue;
    const d2 = hav(b, l.fb); if (d2 > COORD_NEAR_KM) continue;
    const d = d1 + d2;
    if (d < bd || (d === bd && l.obs > (best?.obs ?? 0))) { bd = d; best = l; }
  }
  return best ? best.km : null;
}

function bridgeKm(a, b) { // cârpire gaură: coordonate → leg-db (nume) → linie dreaptă
  // tronsonul învățat se acceptă doar dacă e plauzibil pentru gaura ASTA (vezi km-core.mjs)
  const direct = hav(a, b);
  const ck = coordLegKm(a, b);
  if (plausibleBridgeKm(ck, direct)) return { km: ck, src: 'leg_coord' };
  const la = locName(a), lb = locName(b);
  if (la && lb) { const k = legs.get(`${la}→${lb}`) ?? legs.get(`${lb}→${la}`); if (plausibleBridgeKm(k, direct)) return { km: k, src: 'leg_db' }; }
  return { km: direct, src: 'straight_line' };
}

async function withRelogin(fn) { // sid poate expira pe rulări lungi → un re-login
  try { return await fn(); }
  catch (e) {
    if (/error 1\b/.test(String(e.message))) { sid = (await login(process.env.WIALON_TOKEN)).sid; return await fn(); }
    throw e;
  }
}

async function processDay(v, day) {
  // fereastra zilei în TZ locală a VPS-ului (Europe/Chisinau — DST corect)
  const from = Math.floor(new Date(`${day}T00:00:00`).getTime() / 1000);
  const to = from + 86400;
  const raw = await withRelogin(() => loadTrack(sid, v.unit, from, to));
  const pts = [];
  for (const m of raw) {
    if (m.lat < BBOX.latMin || m.lat > BBOX.latMax || m.lon < BBOX.lonMin || m.lon > BBOX.lonMax) continue;
    pts.push({ lat: m.lat, lon: m.lon, t: new Date(m.t * 1000), sp: m.speed });
  }
  if (pts.length < 2) return { km: 0, stops: [], vmax: 0, viol: 0, patched: 0, check: 0, dropped: 0, npts: pts.length };

  // km + pașii lor (vezi km-core.mjs: se cârpesc doar găurile reale, plafonat)
  // + km_check = integrarea vitezei (Σ v×dt, dt≤60s) — verificare independentă a km_total
  const calc = computeDay(pts, { bridgeKm, movingKmh: MOVING_KMH });
  const { stepKm, stepPatched, stepSrc, stepDropped } = calc;

  const stops = []; let cl = null;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].sp <= STOP_KMH) { if (!cl) cl = { i0: i, i1: i }; else cl.i1 = i; }
    else { if (cl && (pts[cl.i1].t - pts[cl.i0].t)/1000 >= STOP_MIN_S) stops.push(cl); cl = null; }
  }
  if (cl && (pts[cl.i1].t - pts[cl.i0].t)/1000 >= STOP_MIN_S) stops.push(cl);

  const out = []; let prevEnd = null;
  for (let s = 0; s < stops.length; s++) {
    const c = stops[s];
    const lat = pts.slice(c.i0, c.i1+1).reduce((a,p)=>a+p.lat,0)/(c.i1-c.i0+1);
    const lon = pts.slice(c.i0, c.i1+1).reduce((a,p)=>a+p.lon,0)/(c.i1-c.i0+1);
    const dwell = Math.round((pts[c.i1].t - pts[c.i0].t)/60000);
    let kmPrev = null, src = 'gps';
    // sursa etichetei = cârpirea DOMINANTĂ (cei mai mulți km) de pe tronson; fără cârpiri → gps
    if (prevEnd != null) { let k=0, drop=false; const bySrc = new Map(); for (let i=prevEnd+1; i<=c.i0; i++){ k+=stepKm[i]; if(stepDropped[i]) drop=true; if(stepPatched[i]) bySrc.set(stepSrc[i], (bySrc.get(stepSrc[i])||0)+stepKm[i]); } kmPrev = k; src = bySrc.size ? [...bySrc.entries()].sort((a,b)=>b[1]-a[1])[0][0] : (drop ? 'gps_filtrat' : 'gps'); }
    out.push({ seq: s+1, locality: locName({lat,lon}), lat: +lat.toFixed(7), lon: +lon.toFixed(7), arrival: pts[c.i0].t, departure: pts[c.i1].t, dwell, kmPrev: kmPrev==null?null:+kmPrev.toFixed(2), src });
    prevEnd = c.i1;
  }
  return { km: calc.km, stops: out, vmax: calc.vmax, viol: calc.viol, patched: calc.patched, check: calc.check, dropped: calc.dropped, npts: pts.length };
}

// marcare zi suspectă — prag ÎNALT, doar detectorii validați (migrația 226):
// punte_mare (km_patched>15) / km_parcare (stat >20h, tronsoanele nu explică km-ul)
function daySuspect(r) {
  if (r.patched > 15) return `punte_mare:${r.patched}km`;
  const dwell = r.stops.reduce((a, s) => a + s.dwell, 0);
  const legsKm = r.stops.reduce((a, s) => a + (s.kmPrev || 0), 0);
  if (dwell > 20 * 60 && legsKm < 5 && r.km - legsKm > 15) return `km_parcare:${r.km}km@${(dwell / 60).toFixed(1)}h`;
  return null;
}

let totalKm = 0, processed = 0, failed = 0;
for (const day of DAYS) {
  for (const v of fleet) {
    let r;
    try { r = await processDay(v, day); }
    catch (e) { failed++; console.error(`  ! ${v.plate} ${day}: ${e.message}`); continue; }  // skip-and-continue
    totalKm += r.km; processed++;
    const reason = daySuspect(r);
    if (r.npts > 0 && (r.km > 0 || r.stops.length)) {
      console.log(`  ${v.plate.padEnd(7)} ${day}  ${String(r.km).padStart(7)}km  v${r.vmax}  opriri:${r.stops.length}${r.patched>0?`  cârpit:${r.patched}km`:''}${reason?`  SUSPECT ${reason}`:''}`);
    }
    if (WRITE && r.npts > 0) {
      await supa.from('lde_vehicle_gps_daily').upsert({ vehicle_id: v.vehicle_id, date: day, km_total: r.km, speed_max_kmh: r.vmax, speed_violations_count: r.viol, km_patched: r.patched, km_check: r.check, gps_points: r.npts, gps_points_dropped: r.dropped, suspect: !!reason, suspect_reason: reason, data_source: 'platform_gps', imported_at: new Date().toISOString() }, { onConflict: 'vehicle_id,date' });
      await supa.from('lde_gps_stops').delete().eq('vehicle_id', v.vehicle_id).eq('date', day);
      if (r.stops.length) {
        const rows = r.stops.map(s => ({ vehicle_id: v.vehicle_id, date: day, seq: s.seq, locality: s.locality, lat: s.lat, lon: s.lon, arrival_at: s.arrival.toISOString(), departure_at: s.departure.toISOString(), dwell_min: s.dwell, km_from_prev: s.kmPrev, km_from_prev_source: s.src, is_base: false, gps_quality: r.patched>0?'patched':'clean' }));
        const { error } = await supa.from('lde_gps_stops').insert(rows);
        if (error) console.error(`    ! stops ${v.plate}: ${error.message}`);
      }
    }
  }
}
console.log(`\nTOTAL camioane: ${processed} mașini-zile ok, ${failed} eșuate | km ${totalKm.toFixed(0)}`);
