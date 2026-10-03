// Precalculul orei estimate de pe harta «Acum» (ION-206, migr. 490). Ion, 03.10: a doua cerere pe
// o instanță rece nu mai are voie să dureze 5 s. Ritmul fiecărei rute (computePace: 14 zile de
// lde_gps_stops), ritmul flotei și trecerile pe opriri (fetchPasses) se calculează AICI, noaptea,
// cu aceleași funcții din bus-eta.ts, și se scriu în site_eta_cache; /acum doar citește
// (preloadEtaCache). Rutele = cele cu linie în route_shapes (singurele desenate pe hartă).
//
// Chemat de /api/cron/site-eta-cache (cron pe VPS, după lanțul nopții — stop-times.mjs scrie
// trecerile de ieri până la ~03:20). Bugetul de timp oprește bucla înainte de maxDuration;
// ce n-a încăput se ia la rularea următoare, fiindcă rutele cele mai vechi din tabelă trec primele.

import { getSupabase } from '@/lib/supabase';
import { computePace, etaKeys, fetchPasses } from './bus-eta';

export interface PrecalcReport {
  rute: number;
  scrise: number;
  sarite: number[];
  ms: number;
  dry: boolean;
}

interface Row { key: string; value: unknown; computed_at: string }

export async function precalcEtaCache(opts: { bugetMs: number; dry?: boolean }): Promise<PrecalcReport> {
  const t0 = Date.now();
  const sb = getSupabase();
  const dry = !!opts.dry;
  const { data: shapes, error } = await sb.from('route_shapes').select('crm_route_id');
  if (error) throw new Error(`route_shapes: ${error.message}`);
  const ids = [...new Set((shapes ?? []).map((r) => Number(r.crm_route_id)).filter((n) => Number.isInteger(n)))];

  // Cele mai vechi (sau lipsă) primele: dacă bugetul se termină, nu rămân mereu aceleași rute în urmă.
  const age = new Map<number, number>();
  const { data: have } = await sb.from('site_eta_cache').select('key, computed_at').like('key', 'pace:r%');
  for (const h of have ?? []) {
    const id = Number(String(h.key).slice('pace:r'.length));
    if (Number.isInteger(id)) age.set(id, Date.parse(h.computed_at as string));
  }
  ids.sort((a, b) => (age.get(a) ?? 0) - (age.get(b) ?? 0) || a - b);

  const pending: Row[] = [];
  let scrise = 0;
  const flush = async () => {
    if (!pending.length) return;
    if (!dry) {
      const { error: e } = await sb.from('site_eta_cache').upsert(pending, { onConflict: 'key' });
      if (e) throw new Error(`site_eta_cache: ${e.message}`);
    }
    scrise += pending.length;
    pending.length = 0;
  };

  // Flota întâi: e rezerva tuturor rutelor cu istoric prea puțin.
  pending.push({ key: etaKeys.pace(null), value: { pace: await computePace(null) }, computed_at: new Date().toISOString() });
  await flush();

  const sarite: number[] = [];
  for (const id of ids) {
    if (Date.now() - t0 > opts.bugetMs) { sarite.push(id); continue; }
    const [pace, nord, sud] = await Promise.all([computePace(id), fetchPasses(id, true), fetchPasses(id, false)]);
    const at = new Date().toISOString();
    pending.push(
      { key: etaKeys.pace(id), value: { pace }, computed_at: at },
      { key: etaKeys.passes(id, true), value: { rows: nord }, computed_at: at },
      { key: etaKeys.passes(id, false), value: { rows: sud }, computed_at: at },
    );
    if (pending.length >= 12) await flush();
  }
  await flush();
  return { rute: ids.length, scrise, sarite, ms: Date.now() - t0, dry };
}
