// ============================================================================
// LDE Price worker — oglindește prețul motorinei din TLX în TRANSLUX.
// Citește TLX `prices` (fuel_type=diesel, service_role) → medie pe stații per
// valid_from → upsert în lde_diesel_price (TRANSLUX). Sursă unică litri→lei.
// Rulare: node --env-file=.env price-worker.mjs [nr_zile=120]
// ============================================================================
import { WebSocket as WS } from 'ws';
import { createClient } from '@supabase/supabase-js';
globalThis.WebSocket = globalThis.WebSocket || WS;

const DAYS = Number(process.argv.find(a => /^\d+$/.test(a)) || 120);
const tlx = createClient(process.env.TLX_SUPABASE_URL, process.env.TLX_SERVICE_KEY, { auth: { persistSession: false } });
const tr = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const since = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);
// Folosim prețurile ANRE (cu valid_from). Cele manuale au valid_from NULL în TLX → excluse intenționat (rare).
const { data, error } = await tlx
  .from('prices')
  .select('valid_from,price,station_id,created_at')
  .eq('fuel_type', 'diesel')
  .not('valid_from', 'is', null)
  .gte('valid_from', since);
if (error) { console.error('TLX prices citire:', error.message); process.exit(1); }
if (!data || !data.length) { console.error('TLX prices: 0 rânduri diesel'); process.exit(1); }

// O singură valoare per (stație, dată) = cel mai recent rând după created_at (TLX poate avea
// dubluri: ANRE auto + corecție). Apoi medie pe stații → o stație = o voce.
const latest = new Map(); // station|date -> { date, price, created_at }
for (const r of data) {
  const k = `${r.station_id}|${r.valid_from}`;
  const prev = latest.get(k);
  if (!prev || String(r.created_at) > String(prev.created_at)) {
    latest.set(k, { date: r.valid_from, price: Number(r.price), created_at: r.created_at });
  }
}
const byDate = new Map();
for (const v of latest.values()) { if (!byDate.has(v.date)) byDate.set(v.date, []); byDate.get(v.date).push(v.price); }
const rows = [...byDate.entries()].map(([valid_from, arr]) => ({
  valid_from,
  price_lei: Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100,
  source: 'tlx_prices',
  imported_at: new Date().toISOString(),
}));

const { error: e2 } = await tr.from('lde_diesel_price').upsert(rows, { onConflict: 'valid_from' });
if (e2) { console.error('scriere lde_diesel_price:', e2.message); process.exit(1); }

rows.sort((a, b) => b.valid_from.localeCompare(a.valid_from));
console.log(`Preț diesel sincronizat: ${rows.length} zile (din ${since}). Cel mai recent: ${rows[0].valid_from} = ${rows[0].price_lei} lei/l.`);
