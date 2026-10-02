'use server';

// Tab-ul «Bilete aparat» (Numărare): biletele bătute de șoferi din terminalul TIKI.
// Importul: browserul citește CSV-ul (ticketParse.ts) și trimite bucăți de 1000 de rânduri (~0,5 MB spre PostgREST,
// sub limita de 1 MB a unei acțiuni); apoi reconstruiește tabela de prețuri și, lună cu lună, deduce perechile și totalurile
// (migrarea 446). Doar ADMIN.

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { unpackRow, type PackedRow } from './bilete/ticketParse';
import type {
  TikiBatch, TikiMeta, TikiSummary, TikiDriverRow, TikiRouteRow, TikiPairRow, TikiMonthly,
  TikiCalitate, OrarRoute, TikiTendinta, TikiClienti, TikiOd, TikiOmisi, TikiRefacereStare, Piata,
  TikiComparatie, TikiRuta, TikiRutaPerechi, TikiSoferi, TikiRutaLuna,
} from './bilete/types';

type Res<T> = { data?: T; error?: string };

async function adminOnly(): Promise<{ email: string } | { error: string }> {
  const s = await verifySession();
  if (!s) return { error: 'Neautorizat' };
  if (s.role !== 'ADMIN') return { error: 'Acces interzis' };
  return { email: s.email };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(d).padStart(2, '0')}`;
}

// ─── Import ───

export async function createTikiBatch(meta: {
  file_name: string;
  rows_in_file: number;
  rows_excluded: Record<string, number>;
  rows_dup_in_file: number;
  date_min: string | null;
  date_max: string | null;
}): Promise<Res<number>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const { data, error } = await getSupabase()
    .from('tiki_import_batches')
    .insert({ ...meta, file_name: meta.file_name.slice(0, 300), uploaded_by: a.email })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { data: data.id as number };
}

export async function insertTikiChunk(batchId: number, packed: PackedRow[]): Promise<Res<number>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  if (!Array.isArray(packed) || packed.length === 0) return { data: 0 };
  if (packed.length > 5000) return { error: 'Bucată prea mare' };
  const rows = packed.map(p => {
    const r = unpackRow(p);
    return {
      ...r,
      pair_source: r.pair ? 'statii' : 'nedeterminat',
      import_batch_id: batchId,
    };
  });
  for (const r of rows) {
    if (!r.ticket_no || !DATE_RE.test(r.sale_date) || typeof r.price !== 'number') {
      return { error: `Rând invalid (bilet ${r.ticket_no || '?'})` };
    }
  }
  // Biletele deja importate (din alt fișier suprapus) se sar; întoarcem doar cele noi.
  // Cheia e ticket_key (număr + cursă + mașină + șofer + preț, migr. 448): numerele se refolosesc.
  const { data, error } = await getSupabase()
    .from('tiki_tickets')
    .upsert(rows, { onConflict: 'ticket_key', ignoreDuplicates: true })
    .select('ticket_no');
  if (error) return { error: error.message };
  return { data: data?.length ?? 0 };
}

export async function finalizeTikiBatch(
  batchId: number, sent: number, inserted: number, status: 'done' | 'failed',
): Promise<Res<true>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const { error } = await getSupabase()
    .from('tiki_import_batches')
    .update({ rows_sent: sent, rows_inserted: inserted, status })
    .eq('id', batchId);
  if (error) return { error: error.message };
  return { data: true };
}

/** După import: indicele zilelor + tabela preț → pereche, din toate biletele cu stații. */
export async function rebuildTikiPriceMap(): Promise<Res<{ zile_indice: number; chei: number }>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const { data, error } = await getSupabase().rpc('tiki_rebuild_price_map');
  if (error) return { error: error.message };
  return { data };
}

/** O lună: deduce perechile din preț și reface totalurile zilnice. */
export async function runTikiMonth(month: string): Promise<Res<{ deduse: number; randuri: number }>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  if (!MONTH_RE.test(month)) return { error: 'Lună invalidă' };
  const from = `${month}-01`;
  const to = lastDayOfMonth(month);
  const sb = getSupabase();
  const d = await sb.rpc('tiki_deduce_pairs', { p_from: from, p_to: to });
  if (d.error) return { error: d.error.message };
  const r = await sb.rpc('tiki_refresh_agg', { p_from: from, p_to: to });
  if (r.error) return { error: r.error.message };
  return { data: { deduse: d.data as number, randuri: r.data as number } };
}

export async function listTikiBatches(): Promise<Res<TikiBatch[]>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const { data, error } = await getSupabase()
    .from('tiki_import_batches')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(50);
  if (error) return { error: error.message };
  return { data: (data ?? []) as TikiBatch[] };
}

// ─── Rapoarte ───

function validRange(from: string, to: string): string | null {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return 'Perioadă invalidă';
  if (from > to) return 'Data de început e după data de sfârșit';
  return null;
}

const nz = (s: string | null | undefined) => (s && s.trim() ? s : null);

export async function getTikiMeta(): Promise<Res<TikiMeta>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const { data, error } = await getSupabase().rpc('get_tiki_meta');
  if (error) return { error: error.message };
  return { data: data as TikiMeta };
}

export async function getTikiRefacereStare(): Promise<Res<TikiRefacereStare>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const { data, error } = await getSupabase().rpc('get_tiki_refacere_stare');
  if (error) return { error: error.message };
  return { data: data as TikiRefacereStare };
}

export async function getTikiSummary(
  from: string, to: string, route?: string | null, driver?: string | null,
): Promise<Res<TikiSummary>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = validRange(from, to);
  if (bad) return { error: bad };
  const { data, error } = await getSupabase().rpc('get_tiki_summary', {
    p_from: from, p_to: to, p_route: nz(route), p_driver: nz(driver),
  });
  if (error) return { error: error.message };
  return { data: data as TikiSummary };
}

export async function getTikiDrivers(from: string, to: string, route?: string | null): Promise<Res<TikiDriverRow[]>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = validRange(from, to);
  if (bad) return { error: bad };
  const { data, error } = await getSupabase().rpc('get_tiki_drivers', { p_from: from, p_to: to, p_route: nz(route) });
  if (error) return { error: error.message };
  return { data: (data ?? []) as TikiDriverRow[] };
}

export async function getTikiRoutes(from: string, to: string, driver?: string | null): Promise<Res<TikiRouteRow[]>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = validRange(from, to);
  if (bad) return { error: bad };
  const { data, error } = await getSupabase().rpc('get_tiki_routes', { p_from: from, p_to: to, p_driver: nz(driver) });
  if (error) return { error: error.message };
  return { data: (data ?? []) as TikiRouteRow[] };
}

export async function getTikiPairs(
  from: string, to: string, route?: string | null, driver?: string | null,
): Promise<Res<TikiPairRow[]>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = validRange(from, to);
  if (bad) return { error: bad };
  const { data, error } = await getSupabase().rpc('get_tiki_pairs', {
    p_from: from, p_to: to, p_route: nz(route), p_driver: nz(driver),
  });
  if (error) return { error: error.message };
  return { data: (data ?? []) as TikiPairRow[] };
}

export async function getTikiMonthly(
  route?: string | null, driver?: string | null, pair?: string | null,
): Promise<Res<TikiMonthly>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const { data, error } = await getSupabase().rpc('get_tiki_monthly', {
    p_route: nz(route), p_driver: nz(driver), p_pair: nz(pair),
  });
  if (error) return { error: error.message };
  return { data: data as TikiMonthly };
}

// ─── ION-159: Orar · Față de anul trecut · Cine merge pe rută (pe ziua cursei, migr. 452) ───

const MAX_DAYS = 400;

function badRange(from: string, to: string): string | null {
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return 'Interval invalid';
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return days > MAX_DAYS ? `Interval prea lung (max ${MAX_DAYS} de zile)` : null;
}

export async function getTikiCalitate(from: string, to: string): Promise<Res<TikiCalitate>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = badRange(from, to);
  if (bad) return { error: bad };
  const { data, error } = await getSupabase().rpc('get_tiki_calitate', { p_from: from, p_to: to });
  if (error) return { error: error.message };
  return { data: data as TikiCalitate };
}

export async function getTikiOrar(from: string, to: string): Promise<Res<OrarRoute[]>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = badRange(from, to);
  if (bad) return { error: bad };
  const { data, error } = await getSupabase().rpc('get_tiki_orar', { p_from: from, p_to: to });
  if (error) return { error: error.message };
  return { data: (data ?? []) as OrarRoute[] };
}

export async function getTikiTendinta(): Promise<Res<TikiTendinta>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const { data, error } = await getSupabase().rpc('get_tiki_tendinta');
  if (error) return { error: error.message };
  return { data: data as TikiTendinta };
}

export async function getTikiClienti(from: string, to: string, route?: number | null): Promise<Res<TikiClienti>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = badRange(from, to);
  if (bad) return { error: bad };
  if (route != null && !Number.isInteger(route)) return { error: 'Rută invalidă' };
  const { data, error } = await getSupabase().rpc('get_tiki_clienti', { p_from: from, p_to: to, p_route: route ?? null });
  if (error) return { error: error.message };
  return { data: data as TikiClienti };
}

export async function getTikiOd(from: string, to: string, route?: number | null): Promise<Res<TikiOd>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = badRange(from, to);
  if (bad) return { error: bad };
  if (route != null && !Number.isInteger(route)) return { error: 'Rută invalidă' };
  const { data, error } = await getSupabase().rpc('get_tiki_od', { p_from: from, p_to: to, p_route: route ?? null });
  if (error) return { error: error.message };
  return { data: data as TikiOd };
}

export async function getTikiOmisi(from: string, to: string): Promise<Res<TikiOmisi>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = badRange(from, to);
  if (bad) return { error: bad };
  const { data, error } = await getSupabase().rpc('get_tiki_omisi', { p_from: from, p_to: to });
  if (error) return { error: error.message };
  return { data: data as TikiOmisi };
}

// ─── ION-171: «Piața» pe pereche (migr. 463) — doar luni încheiate, fără filtre de rută/șofer ───

export async function getPiata(from: string, to: string): Promise<Res<Piata>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = badRange(from, to);
  if (bad) return { error: bad };
  const { data, error } = await getSupabase().rpc('get_piata', { p_from: from, p_to: to });
  if (error) return { error: error.message };
  return { data: data as Piata };
}

// ─── ION-167: Comparație perioade, Rute, Șoferi (totaluri zilnice din migr. 466, ziua cursei) ───

export async function getTikiComparatie(aFrom: string, aTo: string, bFrom: string, bTo: string): Promise<Res<TikiComparatie>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = badRange(aFrom, aTo) ?? badRange(bFrom, bTo);
  if (bad) return { error: bad };
  const { data, error } = await getSupabase().rpc('get_tiki_comparatie', { a_from: aFrom, a_to: aTo, b_from: bFrom, b_to: bTo });
  if (error) return { error: error.message };
  return { data: data as TikiComparatie };
}

export async function getTikiRute(from: string, to: string): Promise<Res<TikiRuta[]>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = badRange(from, to);
  if (bad) return { error: bad };
  const { data, error } = await getSupabase().rpc('get_tiki_rute', { p_from: from, p_to: to });
  if (error) return { error: error.message };
  return { data: data as TikiRuta[] };
}

export async function getTikiRuteLunar(to: string): Promise<Res<TikiRutaLuna[]>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  if (!DATE_RE.test(to)) return { error: 'Dată invalidă' };
  const { data, error } = await getSupabase().rpc('get_tiki_rute_lunar', { p_to: to });
  if (error) return { error: error.message };
  return { data: data as TikiRutaLuna[] };
}

export async function getTikiRutaPerechi(from: string, to: string, route: number): Promise<Res<TikiRutaPerechi>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = badRange(from, to);
  if (bad) return { error: bad };
  if (!Number.isInteger(route)) return { error: 'Rută invalidă' };
  const { data, error } = await getSupabase().rpc('get_tiki_ruta_perechi', { p_from: from, p_to: to, p_route: route });
  if (error) return { error: error.message };
  return { data: data as TikiRutaPerechi };
}

export async function getTikiSoferi(from: string, to: string): Promise<Res<TikiSoferi>> {
  const a = await adminOnly();
  if ('error' in a) return a;
  const bad = badRange(from, to);
  if (bad) return { error: bad };
  const { data, error } = await getSupabase().rpc('get_tiki_soferi_v2', { p_from: from, p_to: to });
  if (error) return { error: error.message };
  return { data: data as TikiSoferi };
}
