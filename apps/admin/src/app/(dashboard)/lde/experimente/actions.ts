'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { chisinauDayBounds } from '@/lib/chisinau-time';
import { inclusiveDays } from '@translux/db';
import type {
  LdeExperiment,
  LdeExperimentRouteKind,
  LdeExperimentDecision,
  Vehicle,
} from '@translux/db';

// ============================================================================
// LDE — Experimente (§6): baseline → test → comparație cost → decizie.
// I/O + agregare (GPS km + fuel litri/lei pe vehicle_ids în perioadă, batch fără N+1).
// Comparația PURĂ (cost/zi, litri/100km, economie/lună, verdict) trăiește în
// @translux/db (lde-experiment-calc); aici doar persistăm snapshot-urile.
// ============================================================================

const VALID_ROUTE_KINDS: LdeExperimentRouteKind[] = [
  'uzina_factory',
  'interurban_v2',
  'suburban',
  'vehicle_set',
];

export interface ExperimentRow extends LdeExperiment {}

export interface ExperimentsData {
  experiments: ExperimentRow[];
  vehicles: Vehicle[];
}

// ── Listă experimente + vehicule active (pentru formularul de creare) ──
export async function getExperiments(): Promise<ExperimentsData> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const [{ data: experiments, error: eErr }, { data: vehicles, error: vErr }] = await Promise.all([
    sb.from('lde_experiments').select('*').order('created_at', { ascending: false }),
    sb.from('vehicles').select('*').eq('active', true).order('plate_number'),
  ]);
  if (eErr) throw new Error(eErr.message);
  if (vErr) throw new Error(vErr.message);

  return {
    experiments: (experiments || []) as ExperimentRow[],
    vehicles: (vehicles || []) as Vehicle[],
  };
}

export interface CreateExperimentInput {
  name: string;
  hypothesis?: string | null;
  route_kind: LdeExperimentRouteKind;
  route_id?: string | null;
  vehicle_ids: string[];
  baseline_from: string; // YYYY-MM-DD
  baseline_to: string;   // YYYY-MM-DD
  notes?: string | null;
}

export async function createExperiment(input: CreateExperimentInput): Promise<void> {
  const session = requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const name = input.name.trim();
  if (!name) throw new Error('Numele experimentului este obligatoriu');
  if (!VALID_ROUTE_KINDS.includes(input.route_kind)) throw new Error('Tip de experiment invalid');
  const vehicleIds = (input.vehicle_ids || []).filter(Boolean);
  if (vehicleIds.length === 0) throw new Error('Selectează cel puțin un vehicul de monitorizat');
  if (!input.baseline_from || !input.baseline_to) throw new Error('Perioada baseline este obligatorie');
  if (inclusiveDays(input.baseline_from, input.baseline_to) <= 0) {
    throw new Error('Perioada baseline invalidă (data de sfârșit trebuie să fie ≥ data de început)');
  }

  const { error } = await sb.from('lde_experiments').insert({
    name,
    hypothesis: input.hypothesis?.trim() || null,
    route_kind: input.route_kind,
    route_id: input.route_id?.trim() || null,
    vehicle_ids: vehicleIds,
    baseline_from: input.baseline_from,
    baseline_to: input.baseline_to,
    status: 'baseline',
    notes: input.notes?.trim() || null,
    created_by_admin_id: session.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/lde/experimente');
}

// Agregă km (GPS) + litri & lei (Benzol + numerar) pe un set de vehicule într-o
// perioadă [fromDate, toDate] inclusiv. Batch: 3 query-uri (.in vehicle_ids), sumat în JS.
interface Aggregate {
  litri: number;
  lei: number;
  km: number;
}
async function aggregatePeriod(
  sb: ReturnType<typeof getSupabase>,
  vehicleIds: string[],
  fromDate: string,
  toDate: string,
): Promise<Aggregate> {
  if (vehicleIds.length === 0) return { litri: 0, lei: 0, km: 0 };
  // Benzol + numerar sunt timestamptz → zile locale Chișinău (convenția unică LDE), toată ultima zi inclusiv.
  const fromISO = chisinauDayBounds(fromDate).fromIso;
  const toISO = new Date(new Date(chisinauDayBounds(toDate).toIso).getTime() - 1).toISOString();

  const [{ data: gps }, { data: fuel }, { data: cash }] = await Promise.all([
    sb
      .from('lde_vehicle_gps_daily')
      .select('km_total')
      .in('vehicle_id', vehicleIds)
      .gte('date', fromDate)
      .lte('date', toDate),
    sb
      .from('lde_fuel_alimentari')
      .select('litri, suma_lei')
      .in('vehicle_id', vehicleIds)
      .gte('alimentat_at', fromISO)
      .lte('alimentat_at', toISO),
    sb
      .from('lde_fuel_alimentari_cash')
      .select('litri, suma_lei')
      .in('vehicle_id', vehicleIds)
      .gte('alimentat_at', fromISO)
      .lte('alimentat_at', toISO),
  ]);

  const km = (gps || []).reduce((acc, r: any) => acc + Number(r.km_total || 0), 0);
  const litri =
    (fuel || []).reduce((acc, r: any) => acc + Number(r.litri || 0), 0) +
    (cash || []).reduce((acc, r: any) => acc + Number(r.litri || 0), 0);
  const lei =
    (fuel || []).reduce((acc, r: any) => acc + Number(r.suma_lei || 0), 0) +
    (cash || []).reduce((acc, r: any) => acc + Number(r.suma_lei || 0), 0);

  return {
    km: Math.round(km * 100) / 100,
    litri: Math.round(litri * 100) / 100,
    lei: Math.round(lei * 100) / 100,
  };
}

// Ia experimentul + validează că are vehicule și perioadă; întoarce rândul.
async function loadExperiment(sb: ReturnType<typeof getSupabase>, id: string): Promise<LdeExperiment> {
  const { data, error } = await sb.from('lde_experiments').select('*').eq('id', id).single();
  if (error || !data) throw new Error('Experimentul nu a fost găsit');
  return data as LdeExperiment;
}

// ── Închide baseline: agregă perioada baseline → salvează snapshot + status='test' ──
export async function snapshotBaseline(id: string): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const exp = await loadExperiment(sb, id);

  if (exp.status !== 'baseline') throw new Error('Baseline-ul se poate închide doar din faza «Baseline»');
  if (!exp.baseline_from || !exp.baseline_to) throw new Error('Perioada baseline lipsește');

  const agg = await aggregatePeriod(sb, exp.vehicle_ids || [], exp.baseline_from, exp.baseline_to);
  const { error } = await sb
    .from('lde_experiments')
    .update({
      baseline_litri: agg.litri,
      baseline_lei: agg.lei,
      baseline_km: agg.km,
      status: 'test', // baseline închis → gata de start test
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/experimente');
}

// ── Start test: setează test_from (status rămâne 'test') ──
export async function startTest(id: string, test_from: string): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const exp = await loadExperiment(sb, id);

  if (exp.status !== 'test') throw new Error('Testul se pornește doar după închiderea baseline-ului');
  if (!test_from) throw new Error('Data de început a testului este obligatorie');

  const { error } = await sb.from('lde_experiments').update({ test_from }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/experimente');
}

// ── Închide test: setează test_to = azi, agregă perioada test → snapshot + status='done' ──
export async function snapshotTestAndFinish(id: string): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const exp = await loadExperiment(sb, id);

  if (exp.status !== 'test') throw new Error('Testul se poate închide doar din faza «În test»');
  if (!exp.test_from) throw new Error('Testul nu a fost pornit (lipsește data de început)');

  const test_to = new Date().toISOString().slice(0, 10); // azi (UTC)
  if (inclusiveDays(exp.test_from, test_to) <= 0) {
    throw new Error('Perioada de test invalidă (data de azi e înainte de începutul testului)');
  }

  const agg = await aggregatePeriod(sb, exp.vehicle_ids || [], exp.test_from, test_to);
  const { error } = await sb
    .from('lde_experiments')
    .update({
      test_to,
      test_litri: agg.litri,
      test_lei: agg.lei,
      test_km: agg.km,
      status: 'done',
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/experimente');
}

// ── Decizie finală: implement | cancel (doar pe experimente finalizate) ──
export async function setDecision(id: string, decision: LdeExperimentDecision): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const exp = await loadExperiment(sb, id);
  if (exp.status !== 'done') throw new Error('Decizia se poate lua doar după finalizarea testului');
  if (decision !== 'implement' && decision !== 'cancel') throw new Error('Decizie invalidă');

  const { error } = await sb.from('lde_experiments').update({ decision }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/experimente');
}

export async function deleteExperiment(id: string): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const { error } = await getSupabase().from('lde_experiments').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/experimente');
}
