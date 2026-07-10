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
globalThis.WebSocket = globalThis.WebSocket || WS;

const args = process.argv.slice(2);
const DAYS = (args.find(a => /^\d{4}-\d{2}-\d{2}/.test(a)) || '').split(',').filter(Boolean);
const WRITE = args.includes('--write');
if (!DAYS.length) { console.error('Lipsește ziua: node wialon-worker.mjs 2026-07-07 [--write]'); process.exit(1); }

// ── parametri (aceiași ca gps-worker, viteza în km/h) ──
const BBOX = { latMin: 44, latMax: 55, lonMin: 8, lonMax: 32 };  // camioanele merg internațional (TIR) — bbox larg Europa Centrală/Est
const TELEPORT_KMH = 150;
const GAP_S = 600;
const MOVING_KMH = 5.6;           // = 3 noduri (pragul gps-worker)
const STOP_KMH = 7.4;             // = 4 noduri
const STOP_MIN_S = 90;
const STOP_NEAR_KM = 2.0;         // = LDE_GEO_VILLAGE_PROXIMITY_KM (regulă fermă)
const SPEED_LIMIT_KMH = 90;       // camioane

const normPlate = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function hav(a, b) { const R=6371,t=Math.PI/180; const dLa=(b.lat-a.lat)*t,dLo=(b.lon-a.lon)*t,la1=a.lat*t,la2=b.lat*t; const x=Math.sin(dLa/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(x)); }

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

// referința tronsoane (READ-ONLY — nu învățăm din camioane)
const legs = new Map();
{ const { data } = await supa.from('lde_route_legs').select('from_locality,to_locality,km_real_median');
  if (data) for (const l of data) legs.set(`${l.from_locality}→${l.to_locality}`, Number(l.km_real_median)); }
function bridgeKm(a, b) {
  const la = locName(a), lb = locName(b);
  if (la && lb) { const k = legs.get(`${la}→${lb}`) ?? legs.get(`${lb}→${la}`); if (k != null) return k; }
  return hav(a, b);
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
  if (pts.length < 2) return { km: 0, stops: [], vmax: 0, viol: 0, patched: 0, check: 0, npts: pts.length };

  // km_check = integrarea vitezei (Σ v×dt, dt≤60s) — verificare independentă a km_total
  const stepKm = new Array(pts.length).fill(0); const stepPatched = new Array(pts.length).fill(false);
  let kmTotal = 0, patchedKm = 0, vmax = 0, viol = 0, kmCheck = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i].t - pts[i-1].t) / 1000;
    const d = hav(pts[i-1], pts[i]);
    const impliedKmh = dt > 0 ? d / (dt/3600) : 9999;
    const kmh = pts[i].sp; if (kmh < 160 && kmh > vmax) vmax = kmh; if (kmh > SPEED_LIMIT_KMH && kmh < 160) viol++;
    if (kmh < 160) kmCheck += (kmh / 3600) * Math.min(Math.max(dt, 0), 60);
    let segKm = 0, patched = false;
    if (impliedKmh > TELEPORT_KMH || dt > GAP_S) { segKm = bridgeKm(pts[i-1], pts[i]); patched = true; patchedKm += segKm; }
    else if (pts[i].sp > MOVING_KMH) { segKm = d; }
    stepKm[i] = segKm; stepPatched[i] = patched; kmTotal += segKm;
  }

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
    if (prevEnd != null) { let k=0, pat=false; for (let i=prevEnd+1; i<=c.i0; i++){ k+=stepKm[i]; if(stepPatched[i])pat=true; } kmPrev = k; src = pat ? (legs.size? 'leg_db':'straight_line') : 'gps'; }
    out.push({ seq: s+1, locality: locName({lat,lon}), lat: +lat.toFixed(7), lon: +lon.toFixed(7), arrival: pts[c.i0].t, departure: pts[c.i1].t, dwell, kmPrev: kmPrev==null?null:+kmPrev.toFixed(2), src });
    prevEnd = c.i1;
  }
  return { km: +kmTotal.toFixed(1), stops: out, vmax: Math.round(vmax), viol, patched: +patchedKm.toFixed(1), check: +kmCheck.toFixed(1), npts: pts.length };
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
      await supa.from('lde_vehicle_gps_daily').upsert({ vehicle_id: v.vehicle_id, date: day, km_total: r.km, speed_max_kmh: r.vmax, speed_violations_count: r.viol, km_patched: r.patched, km_check: r.check, gps_points: r.npts, suspect: !!reason, suspect_reason: reason, data_source: 'platform_gps', imported_at: new Date().toISOString() }, { onConflict: 'vehicle_id,date' });
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
