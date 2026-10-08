// ============================================================================
// TLX QR worker — alimentările parcului cu QR la stațiile TLX (Reovis) intră automat în evidența motorinei TRANSLUX.
//
// Ion, 08.10.2026: «noi am dat la Reovis QR cod alimentări auto parc, trebuie aceste alimentări să le legăm de
// sistemul evidență motorină». În baza TLX parcul e clientul corporativ «Pat 9» (corporate_clients), cu câte un QR
// (sub-cont) pe mașină, cu plăcuța. Citim alimentările lui (corporate_transactions, fără cele anulate) și le trimitem
// la TRANSLUX prin lde_fuel_tlx_sync (migr. 539): QR-ul cu plăcuța găsită în parc se leagă singur de mașină, foaia LDE
// `pz_c` (care le copia de mână) se scade cu cât acoperă, anulările din TLX ies.
//
// Rulare (VPS, run-nightly.sh, după lde-alim-worker): node --env-file=.env tlx-qr-worker.mjs [YYYY-MM-DD|--all] [--write]
// Implicit: ultimele 45 de zile. Fără --write: doar raportul. Idempotent.
// ============================================================================
import { WebSocket as WS } from 'ws';
import { createClient } from '@supabase/supabase-js';
globalThis.WebSocket = globalThis.WebSocket || WS;

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const ALL = args.includes('--all');
const START = ALL ? '2026-05-01'
  : args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || new Date(Date.now() - 45 * 86400_000).toISOString().slice(0, 10);
const zi = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Chisinau' });
const TODAY = zi(Date.now());

for (const k of ['TLX_SUPABASE_URL', 'TLX_SERVICE_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
  if (!process.env[k]) { console.error(`lipsește ${k} în .env`); process.exit(1); }
}
const tlx = createClient(process.env.TLX_SUPABASE_URL, process.env.TLX_SERVICE_KEY, { auth: { persistSession: false } });
const tr = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

async function toate(q) {
  const out = [];
  for (let o = 0; ; o += 1000) {
    const { data, error } = await q().range(o, o + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// clientul parcului în TLX
const { data: own, error: eo } = await tlx.from('corporate_clients').select('id, company_name')
  .eq('type', 'owner').ilike('company_name', 'pat 9').limit(2);
if (eo) throw new Error(eo.message);
if (!own?.length || own.length > 1) { console.error('clientul «Pat 9» nu e unic în TLX', own); process.exit(1); }
const OWNER = own[0].id;

const clienti = await toate(() => tlx.from('corporate_clients').select('id, type, car_plate, driver_name, display_name')
  .or(`root_owner_id.eq.${OWNER},id.eq.${OWNER}`).order('id'));
const statii = new Map((await toate(() => tlx.from('stations').select('id, name').order('id'))).map((s) => [s.id, s.name]));
const startUtc = new Date(`${START}T00:00:00+03:00`).toISOString();   // marjă: ziua locală începe cel târziu la 00:00+03
const tx = await toate(() => tlx.from('corporate_transactions')
  .select('id, client_id, station_id, liters, price_per_liter, amount_lei, fuel_type, created_at, is_reversed')
  .eq('root_owner_id', OWNER).eq('is_reversed', false).gte('created_at', startUtc).order('id'));

// plăcuța din QR → mașina noastră (scrisă normal «503BRAR» sau invers «BRAR503»)
const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const { data: veh, error: ev } = await tr.from('vehicles').select('id, plate_number').limit(2000);
if (ev) throw new Error(ev.message);
const placi = new Map(veh.map((v) => [norm(v.plate_number), v.id]));
const gaseste = (p) => {
  const n = norm(p);
  if (!n) return null;
  const inv = n.replace(/^([A-Z]+)(\d+)$/, '$2$1');
  return placi.get(n) ?? placi.get(inv) ?? null;
};

const cl = new Map(clienti.map((c) => [c.id, c]));
const portofele = [...new Set(tx.map((t) => t.client_id))].map((id) => {
  const c = cl.get(id) ?? {};
  const nume = [c.car_plate, c.driver_name ?? c.display_name].filter(Boolean).join(' · ') || (c.type === 'owner' ? 'contul principal Pat 9' : id);
  return { cod: id, nume_fisier: nume, vehicle_id: c.car_plate ? gaseste(c.car_plate) : null };
});
const randuri = tx.filter((t) => zi(t.created_at) >= START).map((t) => ({
  external_id: `tlx:${t.id}`, cod: t.client_id, alimentat_at: new Date(t.created_at).toISOString(), zi_local: zi(t.created_at),
  litri: Number(t.liters), pret: t.price_per_liter != null ? Number(t.price_per_liter) : null,
  suma: t.amount_lei != null ? Number(t.amount_lei) : null, statie: statii.get(t.station_id) ?? null,
  produs: t.fuel_type, este_dt: t.fuel_type === 'diesel',
}));

const fara = portofele.filter((p) => !p.vehicle_id);
const litri = randuri.filter((r) => r.este_dt).reduce((s, r) => s + r.litri, 0);
console.log(`[tlx-qr] ${START}…${TODAY}: ${randuri.length} alimentări (${Math.round(litri)} l DT), ${portofele.length} QR, `
  + `${fara.length} fără mașină găsită: ${fara.map((p) => p.nume_fisier.split(' · ')[0]).join(', ') || '—'}`);

const JSON_OUT = args.find((a) => a.startsWith('--json='))?.slice(7);   // proba: payload-ul în fișier, fără scriere
if (JSON_OUT) { (await import('node:fs')).writeFileSync(JSON_OUT, JSON.stringify({ de: START, pana: TODAY, portofele, randuri })); console.log('[tlx-qr] payload →', JSON_OUT); }
if (!WRITE) { console.log('[tlx-qr] fără --write: nimic scris'); process.exit(0); }
const { data, error } = await tr.rpc('lde_fuel_tlx_sync', { p: { de: START, pana: TODAY, portofele, randuri } });
if (error) { console.error('[tlx-qr] lde_fuel_tlx_sync:', error.message); process.exit(1); }
console.log('[tlx-qr] scris:', JSON.stringify(data));
