// ION-151: exportă datele de combustibil și km (2025-01-01 → azi) în CSV pentru analiză.
// Numele șoferilor se înlocuiesc cu coduri S001… (datele se citesc și de Codex). Rulare din rădăcina repo-ului principal:
//   node --env-file=apps/admin/.env <cale>/export.mjs <dir-ieșire>
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const out = process.argv[2];
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const coduri = new Map();
const cod = (s) => { if (!s) return ''; const k = String(s).trim().toUpperCase(); if (!coduri.has(k)) coduri.set(k, 'S' + String(coduri.size + 1).padStart(3, '0')); return coduri.get(k); };
async function tot(tabel, cols, filtru, ord) {
  const r = []; for (let i = 0; ; i += 1000) {
    let q = sb.from(tabel).select(cols).order(ord).order('id' in {} ? 'id' : ord).range(i, i + 999); q = filtru(q);
    const { data, error } = await q; if (error) throw new Error(tabel + ': ' + error.message);
    r.push(...data); if (data.length < 1000) break;
  } return r;
}
function csv(nume, rows, cols) {
  const esc = (v) => v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  writeFileSync(`${out}/${nume}.csv`, [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
  console.log(nume, rows.length);
}
const veh = await tot('vehicles', 'id,plate_number,active,is_lde,directions,passenger_seats', (q) => q, 'plate_number');
const norms = await tot('lde_vehicle_norms', 'vehicle_id,vehicle_type_id,measured_consumption_l_per_100km,measured_consumption_l_per_100km_loaded,measurement_date,in_repair', (q) => q, 'vehicle_id');
const tipuri = await tot('lde_vehicle_types', 'id,display_name,category,norm_l_per_100km,norm_l_per_100km_loaded,passenger_seats', (q) => q, 'id');
const nm = new Map(norms.map((n) => [n.vehicle_id, n])); const tm = new Map(tipuri.map((t) => [t.id, t]));
csv('vehicule', veh.map((v) => { const n = nm.get(v.id) || {}; const t = tm.get(n.vehicle_type_id) || {};
  return { vehicle_id: v.id, placa: v.plate_number, active: v.active, is_lde: v.is_lde, directii: (v.directions || []).join('|'), locuri: v.passenger_seats,
    tip: n.vehicle_type_id, tip_nume: t.display_name, categorie: t.category, norma_tip: t.norm_l_per_100km, norma_tip_incarcat: t.norm_l_per_100km_loaded,
    norma_masurata: n.measured_consumption_l_per_100km, norma_masurata_incarcat: n.measured_consumption_l_per_100km_loaded, data_masurare: n.measurement_date, in_reparatie: n.in_repair }; }),
  ['vehicle_id','placa','active','is_lde','directii','locuri','tip','tip_nume','categorie','norma_tip','norma_tip_incarcat','norma_masurata','norma_masurata_incarcat','data_masurare','in_reparatie']);
const pl = new Map(veh.map((v) => [v.id, v.plate_number]));
const al = await tot('lde_fuel_alimentari', 'id,vehicle_id,driver_id,alimentat_at,litri,suma_lei,source', (q) => q.gte('alimentat_at', '2025-01-01'), 'alimentat_at');
csv('alimentari_benzol', al.map((a) => ({ placa: pl.get(a.vehicle_id), alimentat_at: a.alimentat_at, litri: a.litri, suma_lei: a.suma_lei, sursa: a.source, sofer: cod(a.driver_id) })),
  ['placa','alimentat_at','litri','suma_lei','sursa','sofer']);
const fo = await tot('lde_fuel_foaie', 'id,vehicle_id,zi,litri,foaie,sofer,km_total', (q) => q.gte('zi', '2025-01-01'), 'zi');
csv('foi_parcurs', fo.map((f) => ({ placa: pl.get(f.vehicle_id), zi: f.zi, litri: f.litri, foaie: f.foaie, km_foaie: f.km_total, sofer: cod(f.sofer) })), ['placa','zi','litri','foaie','km_foaie','sofer']);
const m2 = await tot('lde_km_m2m', 'id,vehicle_id,zi,km,sofer,directia', (q) => q.gte('zi', '2025-01-01'), 'zi');
csv('km_lde_m2m', m2.map((m) => ({ placa: pl.get(m.vehicle_id), zi: m.zi, km: m.km, directia: m.directia, sofer: cod(m.sofer) })), ['placa','zi','km','directia','sofer']);
const gp = [];
for (let i = 0; ; i += 1000) {
  const { data, error } = await sb.from('lde_vehicle_gps_daily').select('vehicle_id,date,km_total,km_loaded,km_patched,km_check,gps_points,gps_points_dropped,suspect,suspect_reason,data_source')
    .order('date').order('vehicle_id').range(i, i + 999);
  if (error) throw new Error(error.message); gp.push(...data); if (data.length < 1000) break; }
csv('km_gps_zi', gp.map((g) => ({ placa: pl.get(g.vehicle_id), ...g, vehicle_id: undefined })),
  ['placa','date','km_total','km_loaded','km_patched','km_check','gps_points','gps_points_dropped','suspect','suspect_reason','data_source']);
console.log('șoferi codați', coduri.size);
