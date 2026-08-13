// ============================================================================
// LDE GPS worker — citește tracker GPS, calculează opriri + km/zi, scrie Supabase.
// FĂRĂ Valhalla (decizie Ion 24.06): km din traseu curat; sărituri GPS cârpite
// din baza noastră reală (lde_route_legs) sau linie dreaptă provizorie.
// Rulare: node --env-file=.env gps-worker.mjs <YYYY-MM-DD>[,zi2...] [--write] [--limit N]
// ============================================================================
import fs from 'fs';
import pg from 'pg';
import { WebSocket as WS } from 'ws';
import { createClient } from '@supabase/supabase-js';
import { computeDay, plausibleBridgeKm, hav } from './km-core.mjs';
globalThis.WebSocket = globalThis.WebSocket || WS; // Node 20 nu are WebSocket nativ (supabase-js)

const args = process.argv.slice(2);
const DAYS = (args.find(a => /^\d{4}-\d{2}-\d{2}/.test(a)) || '').split(',').filter(Boolean);
const WRITE = args.includes('--write');
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : 0; })();
// --plates 603BRAS,893BRAX — re-calcul punctual pe câteva mașini, fără să plimbăm toată flota
const PLATES = (() => { const i = args.indexOf('--plates'); return i >= 0 ? (args[i + 1] || '').toUpperCase().split(',').filter(Boolean) : []; })();
if (!DAYS.length) { console.error('Lipsește ziua: node gps-worker.mjs 2026-06-23 [--write]'); process.exit(1); }

// ── parametri (validați pe date reale) ──
const KN = 1.852;                 // track.speed e în noduri → km/h
const BBOX = { latMin: 45, latMax: 49, lonMin: 26, lonMax: 31 };
const MOVING_KN = 3;              // peste = mașina merge
const STOP_KN = 4;                // sub = oprire
const STOP_MIN_S = 90;            // cluster oprire valid
const STOP_NEAR_KM = 2.0;         // oprire ↔ localitate — = LDE_GEO_VILLAGE_PROXIMITY_KM (packages/db/src/lde-geo-rules.ts), regulă fermă
// pragurile de km (teleport/gaură/plafon) stau în km-core.mjs — comune cu wialon-worker

const nmea = v => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const normPlate = s => (s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

// ── localități OSM ──
const places = [];
for (const line of fs.readFileSync(process.env.PLACES_FILE, 'utf8').split('\n')) {
  const cl = line.replace(/\x1e/g, '').trim(); if (!cl) continue;
  let f; try { f = JSON.parse(cl); } catch { continue; }
  const nm = f.properties && (f.properties['name:ro'] || f.properties.name); if (!nm) continue;
  const [lon, lat] = f.geometry.coordinates; places.push({ name: nm, lat, lon });
}
function nearest(p) { let b=null,bd=Infinity; for(const pl of places){const d=hav(p,pl); if(d<bd){bd=d;b=pl;}} return { name:b.name, d:bd }; }
function locName(p) { const n = nearest(p); return n.d <= STOP_NEAR_KM ? n.name : null; }

// ── conexiuni ──
const tracker = new pg.Client({ host:process.env.TRACKER_HOST, port:+process.env.TRACKER_PORT, user:process.env.TRACKER_USER, password:process.env.TRACKER_PASS, database:process.env.TRACKER_DB });
await tracker.connect();
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// ── harta mașină LDE → device ──
// Întreaga flotă activă (LDE uzine + interurban + suburban). Tabelele GPS sunt fleet-wide;
// consumatorii LDE (salarii) filtrează pe vehicle_id, dashboard arată „km flotă".
const { data: vehs, error: ve } = await supa.from('vehicles').select('id,plate_number,is_lde').eq('active', true);
if (ve) { console.error('Supabase vehicles:', ve.message); process.exit(1); }
const plate2veh = new Map(vehs.map(v => [normPlate(v.plate_number), { id: v.id, is_lde: v.is_lde }]));
const { rows: devs } = await tracker.query(`SELECT id, "CarName", "RegNo" FROM devices WHERE active=true`);
// O mașină poate avea MAI MULTE dispozitive: la schimbul de tracker (07.08.2026) cel vechi
// e redenumit «603BRAS-DEFECTAT» și rămâne activ, cu tot istoricul în el. Potrivim pe ambele
// câmpuri (CarName ȘI RegNo) și ținem toate dispozitivele; ziua se ia de la cel cu puncte.
const byPlate = new Map();
for (const d of devs) {
  for (const p of new Set([normPlate(d.CarName), normPlate(d.RegNo)])) {
    if (!plate2veh.has(p)) continue;
    if (!byPlate.has(p)) byPlate.set(p, []);
    if (!byPlate.get(p).includes(d.id)) byPlate.get(p).push(d.id);
  }
}
let fleet = [...byPlate.entries()].map(([p, devices]) => { const vv = plate2veh.get(p); return { devices, vehicle_id: vv.id, is_lde: vv.is_lde, plate: p }; });
if (PLATES.length) fleet = fleet.filter(f => PLATES.includes(f.plate));
if (LIMIT) fleet = fleet.slice(0, LIMIT);
console.log(`Flotă: ${fleet.length} mașini | zile: ${DAYS.join(',')} | mod: ${WRITE ? 'SCRIE' : 'DRY (doar calcul)'}`);

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

// ── referința tronsoane (învățată) ──
const legKey = (a, b) => `${a}→${b}`;
const legs = new Map();
for (const l of await fetchAll('lde_route_legs', 'from_locality,to_locality,km_real_median'))
  legs.set(legKey(l.from_locality, l.to_locality), Number(l.km_real_median));
const legObs = new Map(); // acumulează observații curate noi: key -> [km...]

// ── tronsoane pe COORDONATE (migrația 227) — prioritare la cârpire ──
// cheia = capetele rotunjite la 3 zecimale; ordinea capetelor = sensul
const coordLegs = [];
for (const l of await fetchAll('lde_route_legs_coord', 'from_lat,from_lon,to_lat,to_lon,km_real_median,observations'))
  coordLegs.push({ fa: { lat: +l.from_lat, lon: +l.from_lon }, fb: { lat: +l.to_lat, lon: +l.to_lon }, km: Number(l.km_real_median), obs: l.observations });
const COORD_NEAR_KM = 2.0;  // aceeași rază ca botezarea localităților

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
  // tronsonul învățat se acceptă doar dacă e plauzibil pentru gaura ASTA: buclele
  // (capete suprapuse, km_real_median 100+) au umflat km-ul flotei din 10.07
  const direct = hav(a, b);
  const ck = coordLegKm(a, b);
  if (plausibleBridgeKm(ck, direct)) return { km: ck, src: 'leg_coord' };
  const la = locName(a), lb = locName(b);
  if (la && lb) { const k = legs.get(legKey(la, lb)) ?? legs.get(legKey(lb, la)); if (plausibleBridgeKm(k, direct)) return { km: k, src: 'leg_db' }; }
  return { km: direct, src: 'straight_line' };
}

async function processDay(v, day) {
  // cu mai multe dispozitive pe aceeași mașină, ziua se ia de la cel cu cele mai multe
  // puncte — NU se amestecă: trackerul vechi și cel nou pot raporta în paralel la schimb
  let rows = [];
  for (const device of v.devices) {
    const r = await tracker.query(
      `SELECT w_date,x,y,speed FROM track WHERE id=$1 AND w_date>=$2 AND w_date<($2::date+1) AND w_date<=now() ORDER BY w_date`, [device, day]);
    if (r.rows.length > rows.length) rows = r.rows;
  }
  const pts = [];
  for (const r of rows) { const lat = nmea(+r.x), lon = nmea(+r.y); if (lat<BBOX.latMin||lat>BBOX.latMax||lon<BBOX.lonMin||lon>BBOX.lonMax) continue; pts.push({ lat, lon, t: new Date(r.w_date), sp: r.speed }); }
  if (pts.length < 2) return { km: 0, stops: [], vmax: 0, viol: 0, patched: 0, check: 0, dropped: 0, npts: pts.length };

  // km + pașii lor (vezi km-core.mjs: se cârpesc doar găurile reale, plafonat)
  // + km_check = integrarea vitezei (Σ v×dt, dt≤60s) — verificare INDEPENDENTĂ a km_total
  const calc = computeDay(pts, { bridgeKm, movingKmh: MOVING_KN * KN, toKmh: (sp) => sp * KN });
  const { stepKm, stepPatched, stepSrc, stepDropped } = calc;

  // opriri: clustere de viteză mică, durată >= STOP_MIN_S
  const stops = []; let cl = null;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].sp <= STOP_KN) { if (!cl) cl = { i0: i, i1: i }; else cl.i1 = i; }
    else { if (cl && (pts[cl.i1].t - pts[cl.i0].t)/1000 >= STOP_MIN_S) stops.push(cl); cl = null; }
  }
  if (cl && (pts[cl.i1].t - pts[cl.i0].t)/1000 >= STOP_MIN_S) stops.push(cl);

  // construiește opririle cu localitate + km_from_prev
  const out = []; let prevEnd = null;
  for (let s = 0; s < stops.length; s++) {
    const c = stops[s];
    const lat = pts.slice(c.i0, c.i1+1).reduce((a,p)=>a+p.lat,0)/(c.i1-c.i0+1);
    const lon = pts.slice(c.i0, c.i1+1).reduce((a,p)=>a+p.lon,0)/(c.i1-c.i0+1);
    const loc = locName({ lat, lon });
    const dwell = Math.round((pts[c.i1].t - pts[c.i0].t)/60000);
    let kmPrev = null, src = 'gps';
    // sursa etichetei = cârpirea DOMINANTĂ (cei mai mulți km) de pe tronson; fără cârpiri → gps
    // 'gps_filtrat' = măsurat curat, dar peste puncte aruncate ca glitch → NU e etalon de învățat
    if (prevEnd != null) { let k=0, drop=false; const bySrc = new Map(); for (let i=prevEnd+1; i<=c.i0; i++){ k+=stepKm[i]; if(stepDropped[i]) drop=true; if(stepPatched[i]) bySrc.set(stepSrc[i], (bySrc.get(stepSrc[i])||0)+stepKm[i]); } kmPrev = k; src = bySrc.size ? [...bySrc.entries()].sort((a,b)=>b[1]-a[1])[0][0] : (drop ? 'gps_filtrat' : 'gps'); }
    // is_base = garaj/casă: doar la UZINE (LDE), unde prima/ultima oprire = baza șoferului.
    // La interurban/suburban prima/ultima oprire = capătul cursei, NU baza → fals.
    out.push({ seq: s+1, locality: loc, lat: +lat.toFixed(7), lon: +lon.toFixed(7), arrival: pts[c.i0].t, departure: pts[c.i1].t, dwell, kmPrev: kmPrev==null?null:+kmPrev.toFixed(2), src, isBase: !!v.is_lde && (s===0 || s===stops.length-1) });
    // învață tronson curat — pe nume (compat)
    if (prevEnd != null && src === 'gps' && out[s-1]?.locality && loc && out[s-1].locality !== loc && kmPrev > 0) {
      const k = legKey(out[s-1].locality, loc); if (!legObs.has(k)) legObs.set(k, []); legObs.get(k).push(kmPrev);
    }
    // tronsoanele coord NU se învață aici — le recalculează RPC-ul din istoric (migrația 228)
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

let totalKm = 0, totalStops = 0, processed = 0;
for (const day of DAYS) {
  for (const v of fleet) {
    const r = await processDay(v, day);
    totalKm += r.km; totalStops += r.stops.length; processed++;
    const reason = daySuspect(r);
    if (r.npts > 0 && (r.km > 0 || r.stops.length)) {
      const chain = r.stops.map(s => s.locality || '·').join('→');
      console.log(`  ${v.plate.padEnd(8)} ${day}  ${String(r.km).padStart(6)}km  v${r.vmax}  opriri:${r.stops.length}${r.patched>0?`  cârpit:${r.patched}km`:''}${reason?`  SUSPECT ${reason}`:''}  ${chain.slice(0,90)}`);
    }
    if (WRITE && r.npts > 0) {
      await supa.from('lde_vehicle_gps_daily').upsert({ vehicle_id: v.vehicle_id, date: day, km_total: r.km, speed_max_kmh: r.vmax, speed_violations_count: r.viol, km_patched: r.patched, km_check: r.check, gps_points: r.npts, gps_points_dropped: r.dropped, suspect: !!reason, suspect_reason: reason, data_source: 'platform_gps', imported_at: new Date().toISOString() }, { onConflict: 'vehicle_id,date' });
      await supa.from('lde_gps_stops').delete().eq('vehicle_id', v.vehicle_id).eq('date', day);
      if (r.stops.length) {
        const rows = r.stops.map(s => ({ vehicle_id: v.vehicle_id, date: day, seq: s.seq, locality: s.locality, lat: s.lat, lon: s.lon, arrival_at: s.arrival.toISOString(), departure_at: s.departure.toISOString(), dwell_min: s.dwell, km_from_prev: s.kmPrev, km_from_prev_source: s.src, is_base: s.isBase, gps_quality: r.patched>0?'patched':'clean' }));
        const { error } = await supa.from('lde_gps_stops').insert(rows);
        if (error) console.error(`    ! stops ${v.plate}: ${error.message}`);
      }
    }
  }
}

// învățare tronsoane: km_real_median = MEDIE rulantă incrementală (nu mediană strictă;
// ieftin + incremental cf. perf-reviewer). Doar din leguri 'gps' curate (vezi mai sus).
if (WRITE && legObs.size) {
  for (const [k, arr] of legObs) {
    const [from_locality, to_locality] = k.split('→');
    const { data: ex } = await supa.from('lde_route_legs').select('km_real_median,km_real_min,km_real_max,observations').eq('from_locality', from_locality).eq('to_locality', to_locality).maybeSingle();
    const add = arr.reduce((a,b)=>a+b,0), n = arr.length, mn = Math.min(...arr), mx = Math.max(...arr);
    let median, min, max, obs;
    if (ex) { obs = ex.observations + n; median = +(((ex.km_real_median*ex.observations)+add)/obs).toFixed(2); min = Math.min(+ex.km_real_min, mn); max = Math.max(+ex.km_real_max, mx); }
    else { obs = n; median = +(add/n).toFixed(2); min = +mn.toFixed(2); max = +mx.toFixed(2); }
    await supa.from('lde_route_legs').upsert({ from_locality, to_locality, km_real_median: median, km_real_min: min, km_real_max: max, observations: obs, last_observed_date: DAYS[DAYS.length-1], updated_at: new Date().toISOString() }, { onConflict: 'from_locality,to_locality' });
  }
}

// tronsoanele pe COORDONATE: mediană REALĂ recalculată din tot istoricul lde_gps_stops
// (RPC din migrația 228; idempotent — re-rulajul unei zile nu dublează observațiile)
let coordRefreshed = 0;
if (WRITE) {
  const { data, error } = await supa.rpc('lde_refresh_route_legs_coord');
  if (error) console.error(`refresh legs coord: ${error.message}`); else coordRefreshed = data;
}

await tracker.end();
console.log(`\nTOTAL: ${processed} mașini-zile | km ${totalKm.toFixed(0)} | opriri ${totalStops}${WRITE?` | tronsoane: ${legObs.size} noi (nume), ${coordRefreshed} actualizate (coord)`:''}`);
