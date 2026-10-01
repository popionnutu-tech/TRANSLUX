// Mejgorod — nomenclatorul: rutele interurbane active, opririle lor cu coordonate și ore,
// graficul zilnic (mașina turului și a returului) pe fereastra analizei (ION-55).
//   cd /root/lde-worker/mejgorod/cod && node --env-file=../../.env nomenclator.mjs [FROM] [TO]
import { writeFileSync } from 'node:fs';
import { loadPlaces } from '/root/lde-worker/places-index.mjs';
import { hav, norm, inMd, STATII } from './geo.mjs';

const FROM = process.argv[2] || '2026-06-24', TO = process.argv[3] || '2026-09-23';
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function rest(path) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${SB}/rest/v1/${path}${path.includes('?') ? '&' : '?'}limit=1000&offset=${off}`, { headers: H });
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
    const page = await r.json(); out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

// geocodarea din route-shapes.mjs: unicele întâi, omonimele după vecinul de rută, omonimul departe de vecini iese
const places = loadPlaces(process.env.PLACES_FILE);
const byName = new Map();
for (const p of places) { const k = norm(p.name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(p); }
function candidates(name) {
  const k = norm(name); let c = byName.get(k) ?? [];
  if (c.length === 0) c = byName.get(k.split(' ')[0]) ?? [];
  return c.filter(inMd);
}
function geocode(stops) {
  const out = stops.map((s) => ({ ...s, cand: candidates(s.name_ro) }));
  for (const s of out) if (s.cand.length === 1) s.pt = s.cand[0];
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < out.length; i++) {
    const s = out[i]; if (s.pt || s.cand.length === 0) continue;
    const nb = [];
    for (let d = 1; d < out.length && nb.length < 2; d++) { if (out[i - d]?.pt) nb.push(out[i - d].pt); if (out[i + d]?.pt) nb.push(out[i + d].pt); }
    if (nb.length === 0) continue;
    s.pt = s.cand.reduce((b, c) => (Math.min(...nb.map((n) => hav(c, n))) < Math.min(...nb.map((n) => hav(b, n))) ? c : b));
  }
  for (let i = 0; i < out.length; i++) {
    const s = out[i]; if (!s.pt) continue;
    const prev = out.slice(0, i).reverse().find((x) => x.pt), next = out.slice(i + 1).find((x) => x.pt);
    const ds = [prev, next].filter(Boolean).map((x) => hav(s.pt, x.pt));
    if (ds.length && Math.min(...ds) > 30) s.pt = null;
  }
  return out;
}

const rute = await rest(`crm_routes?route_type=eq.interurban&active=eq.true&select=id,dest_from_ro,dest_to_ro,time_nord,time_chisinau,tur_ascuns,retur_ascuns,retur_disabled,retur_uses_route_id&order=id`);
const stopsAll = await rest(`crm_stop_fares?select=crm_route_id,stop_order,name_ro,hour_from_nord,hour_from_chisinau,is_visible&order=crm_route_id,stop_order`);
const asg = await rest(`daily_assignments?assignment_date=gte.${FROM}&assignment_date=lte.${TO}&select=assignment_date,crm_route_id,vehicle_id,retur_route_id,vehicle_id_retur&order=assignment_date`);
const vehs = await rest(`vehicles?select=id,plate_number`);
const plateOf = new Map(vehs.map((v) => [v.id, v.plate_number]));

const out = [];
for (const r of rute) {
  const stops = stopsAll.filter((s) => s.crm_route_id === r.id);
  const g = geocode(stops);
  // gările au peronul lor exact (route-shapes.mjs); capetele și «trece prin gară» se măsoară față de el
  for (const s of g) { const st = STATII.get(norm(s.name_ro)); if (st) { s.pt = st; s.gara = norm(s.name_ro); } }
  out.push({
    id: r.id, nume: `${r.dest_from_ro} → ${r.dest_to_ro}`, capNord: stops[0]?.name_ro, timeNord: r.time_nord, timeChisinau: r.time_chisinau,
    turAscuns: r.tur_ascuns, returAscuns: r.retur_ascuns, returDisabled: r.retur_disabled, returUsesRouteId: r.retur_uses_route_id,
    opriri: g.map((s) => ({ o: s.stop_order, n: s.name_ro, hN: s.hour_from_nord, hC: s.hour_from_chisinau, vizibil: s.is_visible,
      lat: s.pt ? +s.pt.lat.toFixed(5) : null, lon: s.pt ? +s.pt.lon.toFixed(5) : null, gara: s.gara || null })),
  });
  const lipsa = g.filter((s) => !s.pt).map((s) => s.name_ro);
  console.log(`ruta ${String(r.id).padStart(2)} ${out.at(-1).nume.padEnd(58)} ${g.filter((s) => s.pt).length}/${stops.length} opriri${lipsa.length ? ' · fără loc: ' + lipsa.join(', ') : ''}`);
}

// graficul: pe zi și rută, mașina turului (hour_from_nord) și a returului (hour_from_chisinau) — ca în route-shapes.mjs
const atribuiri = [];
for (const a of asg) {
  const p = (id) => plateOf.get(id) || null;
  if (a.crm_route_id && a.vehicle_id) atribuiri.push({ z: a.assignment_date, r: a.crm_route_id, s: 'tur', m: p(a.vehicle_id) });
  if (a.retur_route_id && (a.vehicle_id_retur ?? a.vehicle_id)) atribuiri.push({ z: a.assignment_date, r: a.retur_route_id, s: 'retur', m: p(a.vehicle_id_retur ?? a.vehicle_id) });
  else if (a.crm_route_id && !a.retur_route_id && (a.vehicle_id_retur ?? a.vehicle_id)) atribuiri.push({ z: a.assignment_date, r: a.crm_route_id, s: 'retur', m: p(a.vehicle_id_retur ?? a.vehicle_id) });
}
const ids = new Set(out.map((r) => r.id));
const A = atribuiri.filter((a) => ids.has(a.r) && a.m);
writeFileSync(`../date/nomenclator${process.env.SUFIX || ''}.json`, JSON.stringify({ FROM, TO, rute: out, atribuiri: A }));
console.log(`\n${out.length} rute · ${A.length} atribuiri (${FROM} → ${TO}) · mașini: ${[...new Set(A.map((a) => a.m))].sort().join(', ')}`);
