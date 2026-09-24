// Ora REALĂ la care autobuzul cursei trece prin fiecare oprire a rutei → route_stop_passes
// (migr. 393, ION-39). Ion, 23.09: «după engine ruta de seară era 23:00 din Edineț la
// Briceni, după real el a trecut Edinețul mai devreme».
//
// Pentru fiecare zi, rută și sens: mașina din graficul zilei (daily_assignments, aceeași
// regulă ca pe site — apps/admin/src/lib/assignments.ts), urma ei brută din tracker, și
// pentru fiecare oprire (route_shapes.stops, cu coordonate) punctul cel mai apropiat în
// ±2 h față de ora din grafic (crm_stop_fares). Sub PASS_M metri = a trecut atunci.
//
// Rulare:  node --env-file=.env stop-times.mjs [--from 2026-09-09] [--to 2026-09-22] [--write]
// Fără --from/--to: ziua de ieri. Fără --write: doar raportul.

import pg from 'pg';

pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z')); // track.w_date e UTC

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const WRITE = args.includes('--write');
const PASS_M = 1000;         // față de punctul opririi pe linia rutei; linia (route_shapes) nu calcă exact pe drumul real
const WINDOW_MIN = 120;      // căutăm trecerea în ±2 h față de grafic
const LEAVE_M = 150;        // «încă la oprire»: rutiera care stă în gară e la sub atât de peron
const BACK_MIN = 5;          // o trecere mai devreme decât precedenta cu atât = altă cursă, se aruncă
const DIAG = args.includes('--diag');
const diag = [];

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const normPlate = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

/**
 * Oprirea mutată pe drumul rutei: punctul din route_shapes.stops e centrul satului (OSM),
 * iar autobuzul trece pe drumul mare, adesea la 0,5–2 km de el. Trecerea se măsoară față
 * de punctul cel mai apropiat de pe linia rutei (proiecție pe segmente, nu doar pe vârfuri).
 */
function snapToShape(shape, p) {
  let best = null;
  for (let i = 1; i < shape.length; i++) {
    const a = { lat: shape[i - 1][0], lon: shape[i - 1][1] }, b = { lat: shape[i][0], lon: shape[i][1] };
    const kx = Math.cos((p.lat * Math.PI) / 180);
    const ax = a.lon * kx, ay = a.lat, bx = b.lon * kx, by = b.lat, px = p.lon * kx, py = p.lat;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const q = { lat: ay + u * dy, lon: (ax + u * dx) / kx };
    const d = hav(q, p);
    if (!best || d < best.d) best = { d, q };
  }
  return best;
}
const SNAP_MAX_M = 3000;     // oprirea mai departe de linie decât atât nu e pe ruta asta

async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null; // upsert cu return=minimal întoarce corp gol
}
// PostgREST taie la 1000 de rânduri: pe pagini.
async function all(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(path, { headers: { Range: `${from}-${from + 999}` } });
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

/** «2026-09-22» + «23:05» (ora Chișinăului) → Date UTC. */
function chisinauInstant(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const guess = Date.parse(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const local = new Date(guess).toLocaleString('sv-SE', { timeZone: 'Europe/Chisinau' }).replace(' ', 'T') + 'Z';
  return new Date(guess - (Date.parse(local) - guess));
}
const hhmmMin = (s) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/); if (!m) return null; const v = +m[1] * 60 + +m[2]; return v === 0 ? null : v; };
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const yesterday = addDays(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' }), -1);
const FROM = arg('--from') || yesterday;
const TO = arg('--to') || FROM;

// Datele care nu se schimbă de la o zi la alta: rutele, opririle cu coordonate, orele.
const shapes = await all('route_shapes?select=crm_route_id,stops,shape');
const fares = await all('crm_stop_fares?select=crm_route_id,stop_order,name_ro,hour_from_chisinau,hour_from_nord');
const routes = await all('crm_routes?select=id,active,tur_ascuns,retur_ascuns');
const routeById = new Map(routes.map((r) => [r.id, r]));
const fareBy = new Map(fares.map((f) => [`${f.crm_route_id}:${f.stop_order}`, f]));
const vehicles = await all('vehicles?select=id,plate_number');
const plateById = new Map(vehicles.map((v) => [v.id, normPlate(v.plate_number)]));

const tracker = new pg.Client({
  host: process.env.TRACKER_HOST, port: +(process.env.TRACKER_PORT || 5432),
  user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB,
});
await tracker.connect();
const { rows: devs } = await tracker.query(`SELECT id, "CarName", "RegNo" FROM devices WHERE active=true`);
const devsByPlate = new Map();
for (const d of devs) {
  for (const p of new Set([normPlate(d.CarName), normPlate(d.RegNo)])) {
    if (!p) continue;
    devsByPlate.set(p, [...(devsByPlate.get(p) || []), d.id]);
  }
}

/** Urma unei mașini între două momente (toate trackerele ei), ordonată în timp. */
const trackCache = new Map();
async function track(plate, fromUtc, toUtc) {
  const key = `${plate}|${fromUtc.toISOString()}`;
  if (trackCache.has(key)) return trackCache.get(key);
  const ids = devsByPlate.get(plate) || [];
  if (!ids.length) { trackCache.set(key, []); return []; }
  const { rows } = await tracker.query(
    `SELECT w_date, x, y FROM track WHERE id = ANY($1) AND w_date >= $2 AND w_date < $3 ORDER BY w_date`,
    [ids, fromUtc.toISOString().replace('T', ' ').replace('Z', ''), toUtc.toISOString().replace('T', ' ').replace('Z', '')],
  );
  const pts = rows.map((r) => ({ t: r.w_date, lat: nmea(+r.x), lon: nmea(+r.y) })).filter((p) => p.lat > 45 && p.lat < 49 && p.lon > 26 && p.lon < 31);
  trackCache.set(key, pts);
  return pts;
}

/** Mașina fiecărei rute pe sens, ca buildTurAssignmentMap / buildReturAssignmentMap. */
function assignmentMaps(asg) {
  const tur = new Map(), retur = new Map();
  for (const a of asg) if (!tur.has(a.crm_route_id) && a.vehicle_id) tur.set(a.crm_route_id, a.vehicle_id);
  for (const a of asg) if (a.retur_route_id) retur.set(a.retur_route_id, a.vehicle_id_retur ?? a.vehicle_id);
  for (const a of asg) if (!retur.has(a.crm_route_id) && !a.retur_route_id) retur.set(a.crm_route_id, a.vehicle_id_retur ?? a.vehicle_id);
  return { tur, retur };
}

let totalRows = 0;
for (let day = FROM; day <= TO; day = addDays(day, 1)) {
  const asg = await all(`daily_assignments?assignment_date=eq.${day}&select=crm_route_id,vehicle_id,vehicle_id_retur,retur_route_id`);
  const { tur, retur } = assignmentMaps(asg);
  // Urma zilei: de la 03:00 ziua asta până la 06:00 a doua zi (cursele de noapte).
  const dayFrom = chisinauInstant(day, '03:00');
  const dayTo = new Date(chisinauInstant(addDays(day, 1), '06:00'));
  const rows = [];
  let tries = 0, found = 0;

  for (const s of shapes) {
    const route = routeById.get(s.crm_route_id);
    if (!route || route.active === false) continue;
    for (const goingNorth of [false, true]) {
      if (goingNorth ? route.retur_ascuns : route.tur_ascuns) continue;
      const vid = (goingNorth ? retur : tur).get(s.crm_route_id);
      const plate = vid && plateById.get(vid);
      if (!plate) continue;
      // Opririle în ordinea de mers, cu ora din grafic; trecerea de miezul nopții = ziua următoare.
      const ordered = [...s.stops]
        .map((st) => ({ ...st, fare: fareBy.get(`${s.crm_route_id}:${st.stop_order}`) }))
        .filter((st) => st.fare && Number.isFinite(st.lat))
        // Pe drum: punctul opririi proiectat pe linia rutei; prea departe de linie = scos.
        .map((st) => { const sn = snapToShape(s.shape || [], st); return sn && sn.d <= SNAP_MAX_M ? { ...st, lat: sn.q.lat, lon: sn.q.lon } : null; })
        .filter(Boolean)
        .map((st) => ({ ...st, hour: goingNorth ? st.fare.hour_from_chisinau : st.fare.hour_from_nord }))
        .filter((st) => hhmmMin(st.hour) !== null)
        .sort((a, b) => (goingNorth ? b.stop_order - a.stop_order : a.stop_order - b.stop_order));
      if (ordered.length < 2) continue;
      const pts = await track(plate, dayFrom, dayTo);
      if (!pts.length) continue;
      const first = hhmmMin(ordered[0].hour);
      let lastPass = null;
      for (const st of ordered) {
        tries++;
        const nextDay = hhmmMin(st.hour) < first - 60;
        const sched = chisinauInstant(nextDay ? addDays(day, 1) : day, st.hour.padStart(5, '0'));
        const lo = sched.getTime() - WINDOW_MIN * 60000, hi = sched.getTime() + WINDOW_MIN * 60000;
        let best = null;
        // Pe segmentul dintre două poziții consecutive, nu doar pe poziții: trackerul
        // transmite rar, iar la 90 km/h două poziții pot fi la sute de metri distanță —
        // trecerea e pe segment, cu ora interpolată.
        for (let k = 1; k < pts.length; k++) {
          const p0 = pts[k - 1], p1 = pts[k];
          const t0 = p0.t.getTime(), t1 = p1.t.getTime();
          if (t1 < lo) continue;
          if (t0 > hi) break;
          if (t1 - t0 > 5 * 60000) { // gaură în urmă: doar capetele, fără interpolare
            for (const [p, t] of [[p0, t0], [p1, t1]]) {
              const d = hav(p, st);
              if (t >= lo && t <= hi && (!best || d < best.d)) best = { d, t };
            }
            continue;
          }
          const kx = Math.cos((st.lat * Math.PI) / 180);
          const dx = (p1.lon - p0.lon) * kx, dy = p1.lat - p0.lat, len2 = dx * dx + dy * dy;
          const u = len2 ? Math.max(0, Math.min(1, (((st.lon - p0.lon) * kx) * dx + (st.lat - p0.lat) * dy) / len2)) : 0;
          const q = { lat: p0.lat + u * dy, lon: p0.lon + (u * dx) / kx };
          const t = t0 + u * (t1 - t0);
          const d = hav(q, st);
          if (t >= lo && t <= hi && (!best || d < best.d)) best = { d, t };
        }
        if (DIAG) diag.push(best ? best.d : -1);
        if (!best || best.d > PASS_M) continue;
        // Plecarea, nu sosirea: în gări rutiera stă la peron (Bălți, ruta 59: ajunge ~07:40,
        // pleacă ~08:10 după graficul de 08:15). Omul urcă la plecare, deci ora opririi e
        // ultimul moment în care autobuzul mai e la cel mult LEAVE_M de punctul cel mai apropiat.
        {
          const anchor = pts.find((p) => p.t.getTime() >= best.t) ?? null;
          if (anchor) {
            const ref = best.d <= LEAVE_M ? st : anchor;
            let leave = best.t;
            for (const p of pts) {
              const t = p.t.getTime();
              if (t < best.t) continue;
              if (t > hi) break;
              if (hav(p, ref) > LEAVE_M) break;
              leave = t;
            }
            best.t = leave;
          }
        }
        // Ordinea de mers: o trecere mult înaintea celei precedente e a altei curse.
        if (lastPass && best.t < lastPass - BACK_MIN * 60000) continue;
        lastPass = best.t;
        found++;
        rows.push({
          date: day, crm_route_id: s.crm_route_id, going_north: goingNorth, stop_order: st.stop_order,
          stop_name: st.name, scheduled: st.hour.padStart(5, '0'), passed_at: new Date(best.t).toISOString(),
          offset_min: Math.round((best.t - sched.getTime()) / 60000), distance_m: Math.round(best.d), vehicle_id: vid,
        });
      }
    }
  }
  totalRows += rows.length;
  const offs = rows.map((r) => r.offset_min).sort((a, b) => a - b);
  const med = offs.length ? offs[Math.floor(offs.length / 2)] : null;
  console.log(`${day}: ${found}/${tries} opriri găsite, abatere mediană ${med} min`);
  if (WRITE && rows.length) {
    for (let i = 0; i < rows.length; i += 500) {
      await rest('route_stop_passes?on_conflict=date,crm_route_id,going_north,stop_order', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)),
      });
    }
  }
}
if (DIAG) {
  const b = [0, 350, 700, 1000, 1500, 2500, 5000, Infinity];
  const none = diag.filter((d) => d < 0).length;
  console.log('fără nicio poziție în fereastră:', none);
  for (let i = 0; i < b.length - 1; i++) console.log(`${b[i]}-${b[i + 1]} m:`, diag.filter((d) => d >= b[i] && d < b[i + 1]).length);
}
await tracker.end();
console.log(`total ${totalRows} rânduri${WRITE ? ' scrise' : ' (fără --write)'}`);
