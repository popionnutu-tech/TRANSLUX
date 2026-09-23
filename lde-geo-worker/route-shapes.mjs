// Linia pe drum a rutelor interurbane → route_shapes (migr. 392, ION-43).
// Ion, 23.09: «pune totuși linia de traseu pe care merge mașina, fină să fie».
//
// Opririle din crm_stop_fares au doar nume. Aici: nume → localitate OSM (places-index),
// apoi Valhalla (costing bus) prin toate opririle găsite, în ordinea stop_order.
// Se rulează la mână (o dată, și când se schimbă opririle):
//   cd /root/lde-worker && node --env-file=.env route-shapes.mjs [--dry] [--jumps]
import { loadPlaces } from './places-index.mjs';
import { hav } from './km-core.mjs';
import { dp } from './geom-simplify.mjs';

const DRY = process.argv.includes('--dry');
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const VALHALLA = process.env.VALHALLA_URL || 'http://127.0.0.1:8002';

async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 || r.status === 201 ? null : r.json().catch(() => null);
}

// «Chișinău (Gara de Nord)» → «chisinau»; «Șeptelici» → «septelici».
const norm = (s) => String(s || '').replace(/\(.*?\)/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[şș]/g, 's').replace(/[ţț]/g, 't').replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();

const places = loadPlaces(process.env.PLACES_FILE);
const byName = new Map();
for (const p of places) {
  const k = norm(p.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(p);
}
// Moldova: numele fără ambiguitate sunt cele mai multe; la omonime alege vecinul de rută.
const MD = { latMin: 45.4, latMax: 48.6, lonMin: 26.6, lonMax: 30.2 };
const inMd = (p) => p.lat > MD.latMin && p.lat < MD.latMax && p.lon > MD.lonMin && p.lon < MD.lonMax;

function candidates(name) {
  const k = norm(name);
  let c = byName.get(k) ?? [];
  if (c.length === 0) { // «Bălți Autogara», «Edineț centru» — primul cuvânt
    const first = k.split(' ')[0];
    c = byName.get(first) ?? [];
  }
  return c.filter(inMd);
}

/** Opririle rutei cu coordonate: întâi cele unice, apoi omonimele după vecinul cel mai apropiat. */
function geocode(stops) {
  const out = stops.map((s) => ({ ...s, cand: candidates(s.name_ro) }));
  for (const s of out) if (s.cand.length === 1) s.pt = s.cand[0];
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < out.length; i++) {
      const s = out[i];
      if (s.pt || s.cand.length === 0) continue;
      const nb = [];
      for (let d = 1; d < out.length && nb.length < 2; d++) {
        if (out[i - d]?.pt) nb.push(out[i - d].pt);
        if (out[i + d]?.pt) nb.push(out[i + d].pt);
      }
      if (nb.length === 0) continue;
      s.pt = s.cand.reduce((b, c) => (Math.min(...nb.map((n) => hav(c, n))) < Math.min(...nb.map((n) => hav(b, n))) ? c : b));
    }
  }
  // Un punct departe de ambii vecini e un omonim greșit («Slobozia» luată după primul cuvânt
  // din «Slobozia Șirăuți», la 90 km): oprirea iese din linie, nu o trage în altă parte a țării.
  for (let i = 0; i < out.length; i++) {
    const s = out[i]; if (!s.pt) continue;
    const prev = out.slice(0, i).reverse().find((x) => x.pt), next = out.slice(i + 1).find((x) => x.pt);
    const ds = [prev, next].filter(Boolean).map((x) => hav(s.pt, x.pt));
    if (ds.length && Math.min(...ds) > 30) s.pt = null;
  }
  return out;
}

// Polyline cu precizie 6 (Valhalla).
function decode(str) {
  let i = 0, lat = 0, lon = 0; const pts = [];
  while (i < str.length) {
    for (const which of [0, 1]) {
      let b, shift = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (which === 0) lat += d; else lon += d;
    }
    pts.push({ lat: lat / 1e6, lon: lon / 1e6 });
  }
  return pts;
}

async function route(pts) {
  const body = {
    locations: pts.map((p, i) => ({ lat: p.lat, lon: p.lon, type: i === 0 || i === pts.length - 1 ? 'break' : 'through' })),
    costing: 'bus', units: 'kilometers', directions_type: 'none',
  };
  const r = await fetch(`${VALHALLA}/route`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`valhalla ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { pts: j.trip.legs.flatMap((l) => decode(l.shape)), km: j.trip.summary.length };
}

// PostgREST dă cel mult 1000 de rânduri pe cerere; opririle sunt peste 1200 — pe pagini.
const rows = [];
for (let off = 0; ; off += 1000) {
  const page = await rest(`crm_stop_fares?select=crm_route_id,stop_order,name_ro&order=crm_route_id,stop_order&limit=1000&offset=${off}`);
  rows.push(...page);
  if (page.length < 1000) break;
}
const byRoute = new Map();
for (const r of rows) {
  if (!byRoute.has(r.crm_route_id)) byRoute.set(r.crm_route_id, []);
  byRoute.get(r.crm_route_id).push(r);
}

let ok = 0;
for (const [rid, stops] of byRoute) {
  const g = geocode(stops);
  const found = g.filter((s) => s.pt);
  const missing = [...new Set(g.filter((s) => !s.pt).map((s) => s.name_ro))];
  // Opriri consecutive în aceeași localitate (autogară + centru) → un singur punct.
  // --jumps: opririle vecine la peste 25 km una de alta — semnul unui omonim greșit.
  if (process.argv.includes('--jumps')) {
    for (let i = 1; i < found.length; i++) {
      const d = hav(found[i].pt, found[i - 1].pt);
      if (d > 25) console.log(`  salt ${rid}: ${found[i - 1].name_ro} → ${found[i].name_ro} ${d.toFixed(0)} km`);
    }
  }
  const via = found.filter((s, i) => i === 0 || hav(s.pt, found[i - 1].pt) > 0.3).map((s) => s.pt);
  if (via.length < 2) { console.log(`ruta ${rid}: prea puține opriri găsite (${found.length}/${stops.length}); lipsă: ${missing.join(', ')}`); continue; }
  let r;
  try { r = await route(via); } catch (e) { console.log(`ruta ${rid}: ${e.message}`); continue; }
  const keep = dp(r.pts, 0, r.pts.length - 1, 30);
  const shape = keep.map((i) => [+r.pts[i].lat.toFixed(5), +r.pts[i].lon.toFixed(5)]);
  const stopsOut = found.map((s) => ({ stop_order: s.stop_order, name: s.name_ro, lat: +s.pt.lat.toFixed(5), lon: +s.pt.lon.toFixed(5) }));
  console.log(`ruta ${rid}: ${found.length}/${stops.length} opriri, ${r.km.toFixed(0)} km, ${shape.length} puncte${missing.length ? `; lipsă: ${missing.join(', ')}` : ''}`);
  if (!DRY) {
    await rest('route_shapes?on_conflict=crm_route_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ crm_route_id: rid, stops: stopsOut, shape, missing, updated_at: new Date().toISOString() }),
    });
  }
  ok++;
}
console.log(`${ok}/${byRoute.size} rute ${DRY ? '(dry, nimic scris)' : 'scrise în route_shapes'}`);
