// ============================================================================
// PROBĂ Wialon API — de rulat imediat ce providerul activează user-ul token-ului.
// Validează lanțul complet: login → listă mașini → potrivire plăcuțe cu flota
// noastră → trage traseul unei zile pentru o mașină → km, de comparat cu cifra
// noastră din lde_vehicle_gps_daily (paritate BD directă vs API).
// Rulare: node --env-file=.env wialon-probe.mjs [PLACUTA] [YYYY-MM-DD]
// Cere în .env: WIALON_TOKEN (+ opțional WIALON_HOST).
// ============================================================================
import { login, listUnits, loadTrack } from './wialon-api.mjs';
import { WebSocket as WS } from 'ws';
import { createClient } from '@supabase/supabase-js';
globalThis.WebSocket = globalThis.WebSocket || WS;

const PLATE = (process.argv[2] || '035BRAT').toUpperCase().replace(/[^A-Z0-9]/g, '');
const DAY = process.argv[3] || '2026-06-23';
const KN = 1.852; // dacă viteza vine în noduri; Wialon dă km/h — verificăm empiric mai jos
const norm = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function hav(a, b) { const R=6371,t=Math.PI/180; const dLa=(b.lat-a.lat)*t,dLo=(b.lon-a.lon)*t,la1=a.lat*t,la2=b.lat*t; const x=Math.sin(dLa/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(x)); }

// 1) login
const { sid, user } = await login(process.env.WIALON_TOKEN);
console.log(`✅ login OK (user: ${user})`);

// 2) unități + potrivire cu flota noastră
const units = await listUnits(sid);
console.log(`unități în Wialon: ${units.length}`);
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const { data: vehs } = await supa.from('vehicles').select('plate_number').eq('active', true);
const ours = new Set((vehs || []).map(v => norm(v.plate_number)));
const matched = units.filter(u => ours.has(norm(u.name)));
console.log(`potrivite cu flota noastră (${ours.size} active): ${matched.length}`);
const unmatchedOurs = [...ours].filter(p => !units.some(u => norm(u.name) === p));
if (unmatchedOurs.length) console.log(`fără unitate Wialon (${unmatchedOurs.length}): ${unmatchedOurs.slice(0, 15).join(' ')}${unmatchedOurs.length > 15 ? '…' : ''}`);

// 3) traseul unei zile pentru mașina-țintă
const unit = units.find(u => norm(u.name) === PLATE);
if (!unit) { console.log(`✗ ${PLATE} nu e în Wialon (nume: căutați manual în listă)`); process.exit(1); }
const from = Math.floor(new Date(`${DAY}T00:00:00+03:00`).getTime() / 1000);
const to = from + 86400;
const track = await loadTrack(sid, unit.id, from, to);
console.log(`${PLATE} (unit ${unit.id}) ${DAY}: ${track.length} puncte`);
if (track.length > 1) {
  let km = 0, vmax = 0;
  for (let i = 1; i < track.length; i++) {
    if (track[i].speed > 3) km += hav(track[i-1], track[i]);
    if (track[i].speed > vmax) vmax = track[i].speed;
  }
  console.log(`  km (speed-gated, viteza ca km/h): ${km.toFixed(1)} | vmax raportat: ${vmax}`);
  console.log(`  dacă vmax pare jumătate din realitate → viteza e în noduri (×${KN}); altfel km/h direct.`);
  // comparație cu cifra noastră din BD
  const { data: d } = await supa.from('lde_vehicle_gps_daily').select('km_total,speed_max_kmh')
    .eq('date', DAY).limit(500);
  const { data: v2 } = await supa.from('vehicles').select('id').ilike('plate_number', `%${PLATE.slice(-6)}%`).limit(1);
  if (v2?.[0]) {
    const { data: row } = await supa.from('lde_vehicle_gps_daily').select('km_total,speed_max_kmh').eq('vehicle_id', v2[0].id).eq('date', DAY).maybeSingle();
    if (row) console.log(`  BD noastră pentru aceeași zi: km=${row.km_total} vmax=${row.speed_max_kmh} → diferența = paritate API vs BD`);
  }
}
console.log('PROBĂ COMPLETĂ.');
