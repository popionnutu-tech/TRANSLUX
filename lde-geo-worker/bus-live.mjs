// Ultimul punct al autobuzelor de pe cursele interurbane de AZI → bus_live_positions
// (migr. 391, ION-39). Rulează pe VPS în fiecare minut:
//   * * * * * cd /root/lde-worker && flock -n /tmp/bus-live.lock node --env-file=.env bus-live.mjs >> bus-live.log 2>&1
//
// De ce aici și nu în central-hub: trackerul (TRACKER_HOST) răspunde doar VPS-ului.
// Ce se scrie: DOAR mașinile din daily_assignments de azi (vehicle_id + vehicle_id_retur),
// DOAR ultimul punct din ultimele 15 minute, fără viteză. Cine vede punctul și când
// hotărăște asistentul (central-hub), nu scriptul ăsta.
//
// Supabase prin REST simplu: supabase-js pe Node 20 cere `ws` doar ca să construiască
// clientul, iar aici nu e nevoie de nimic din el.

import pg from 'pg';
import { loadPlaces, buildPlacesIndex, nearestLiniar } from './places-index.mjs';

// track.w_date e UTC fără fus (vezi gps-worker.mjs, commit f97bd6d).
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const normPlate = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const BBOX = { latMin: 45, latMax: 49, lonMin: 26, lonMax: 31 };

async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
const asg = await rest(`daily_assignments?assignment_date=eq.${today}&select=vehicle_id,vehicle_id_retur`);
const ids = [...new Set(asg.flatMap((a) => [a.vehicle_id, a.vehicle_id_retur]).filter(Boolean))];
if (ids.length === 0) { console.log(`${new Date().toISOString()} ${today}: nicio atribuire`); process.exit(0); }
const vehs = await rest(`vehicles?id=in.(${ids.join(',')})&select=plate_number`);
const plates = new Set(vehs.map((v) => normPlate(v.plate_number)));

const tracker = new pg.Client({
  host: process.env.TRACKER_HOST, port: +(process.env.TRACKER_PORT || 5432),
  user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB,
});
await tracker.connect();
try {
  const { rows: devs } = await tracker.query(`SELECT id, "CarName", "RegNo" FROM devices WHERE active=true`);
  const plateByDev = new Map();
  for (const d of devs) {
    const p = plates.has(normPlate(d.CarName)) ? normPlate(d.CarName) : normPlate(d.RegNo);
    if (plates.has(p)) plateByDev.set(d.id, p);
  }
  if (plateByDev.size === 0) { console.log(`${new Date().toISOString()}: niciun tracker`); process.exit(0); }
  const { rows } = await tracker.query(
    `SELECT DISTINCT ON (id) id, w_date, x, y FROM track
      WHERE id = ANY($1) AND w_date > now() - interval '15 minutes' AND w_date <= now()
      ORDER BY id, w_date DESC`,
    [[...plateByDev.keys()]],
  );

  // O mașină cu două trackere: câștigă punctul cel mai nou.
  const best = new Map();
  for (const r of rows) {
    const lat = nmea(+r.x), lon = nmea(+r.y);
    if (lat < BBOX.latMin || lat > BBOX.latMax || lon < BBOX.lonMin || lon > BBOX.lonMax) continue;
    const plate = plateByDev.get(r.id);
    const prev = best.get(plate);
    if (!prev || r.w_date > prev.at) best.set(plate, { plate, lat, lon, at: r.w_date });
  }
  if (best.size === 0) { console.log(`${new Date().toISOString()}: niciun punct proaspăt`); process.exit(0); }

  // «Acum lângă X»: localitatea OSM cea mai apropiată, până la 15 km.
  let near = () => null;
  if (process.env.PLACES_FILE) {
    const places = loadPlaces(process.env.PLACES_FILE);
    const idx = buildPlacesIndex(places);
    near = (p) => {
      const n = idx.nearestWithin(p, 3.8) ?? nearestLiniar(places, p);
      return n && n.d <= 15 ? n.name : null;
    };
  }
  const now = new Date().toISOString();
  const body = [...best.values()].map((b) => ({
    plate: b.plate, lat: +b.lat.toFixed(6), lon: +b.lon.toFixed(6), at: b.at.toISOString(), near: near(b), updated_at: now,
  }));
  await rest('bus_live_positions?on_conflict=plate', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body),
  });
  console.log(`${now} ${today}: ${body.length}/${plates.size} mașini scrise`);
} finally {
  await tracker.end();
}
