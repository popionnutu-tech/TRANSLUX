'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import {
  computeReceptieValue,
  type LdeBillingModel,
  type LdeUzinaBilling,
  type LdeReceptieAct,
  type LdeUzina,
} from '@translux/db';

const VALID_MODELS: LdeBillingModel[] = ['per_cursa', 'per_pasager', 'per_km', 'fix_saptamanal'];

// ── Tarife uzine + lista uzine (pentru cele fără tarif) ──
export interface BillingView {
  uzine: Pick<LdeUzina, 'id' | 'display_name'>[];
  billing: LdeUzinaBilling[];
}

export async function getBilling(): Promise<BillingView> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const [{ data: uzine }, { data: billing }] = await Promise.all([
    sb.from('lde_uzine').select('id, display_name').order('display_name'),
    sb.from('lde_uzina_billing').select('*'),
  ]);

  return {
    uzine: (uzine || []) as Pick<LdeUzina, 'id' | 'display_name'>[],
    billing: (billing || []) as LdeUzinaBilling[],
  };
}

export async function setBilling(
  uzina_id: string,
  billing_model: LdeBillingModel,
  rate_lei: number,
): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  if (!VALID_MODELS.includes(billing_model)) throw new Error('Model de facturare invalid');
  if (!Number.isFinite(rate_lei) || rate_lei < 0) throw new Error('Tariful trebuie să fie un număr ≥ 0');

  const { error } = await getSupabase()
    .from('lde_uzina_billing')
    .upsert(
      { uzina_id, billing_model, rate_lei, updated_at: new Date().toISOString() },
      { onConflict: 'uzina_id' },
    );
  if (error) throw new Error(error.message);
  revalidatePath('/lde/acte');
}

// ── Listare acte (cu nume uzină), cele mai recente primele ──
export interface ActeRow extends LdeReceptieAct {
  uzina_name: string;
}

export async function getActe(uzina_id?: string, limit = 20): Promise<ActeRow[]> {
  requireRole(await verifySession(), 'ADMIN');
  let q = getSupabase()
    .from('lde_receptie_acts')
    .select('*, lde_uzine(display_name)')
    .order('week_from', { ascending: false })
    .limit(limit);
  if (uzina_id) q = q.eq('uzina_id', uzina_id);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data || []).map((r: any) => ({
    ...r,
    uzina_name: r.lde_uzine?.display_name ?? r.uzina_id,
  })) as ActeRow[];
}

// ── Generare act săptămânal (batch-fetch, fără N+1; idempotent pe uzina_id+week_from) ──
export async function generateAct(
  uzina_id: string,
  week_from: string,
): Promise<{ act_id: string; total_km: number; total_curse: number; total_passengers: number; total_value_lei: number; has_gps: boolean }> {
  const session = requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  // Săptămâna [week_from, week_from + 6]
  const start = new Date(week_from + 'T00:00:00Z');
  const endDate = new Date(start);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const week_to = endDate.toISOString().slice(0, 10);

  // 1. Tariful uzinei (snapshot la generare)
  const { data: billingRow } = await sb
    .from('lde_uzina_billing')
    .select('billing_model, rate_lei')
    .eq('uzina_id', uzina_id)
    .maybeSingle();
  if (!billingRow) throw new Error('Setați mai întâi tariful pentru această uzină.');
  const billing_model = billingRow.billing_model as LdeBillingModel;
  const rate_lei = Number(billingRow.rate_lei);

  // 2. Cursele active ale uzinei (total_curse + ids pentru shifts)
  const { data: routes } = await sb
    .from('lde_factory_routes')
    .select('id')
    .eq('uzina_id', uzina_id)
    .eq('active', true);
  const routeIds = (routes || []).map((r: any) => r.id);
  const total_curse = routeIds.length;

  // 3. Schimburile acestor curse → total_passengers + shift ids (pentru vehicule)
  let total_passengers = 0;
  let shiftIds: string[] = [];
  if (routeIds.length > 0) {
    const { data: shifts } = await sb
      .from('lde_factory_route_shifts')
      .select('id, passengers_count')
      .in('route_id', routeIds);
    total_passengers = (shifts || []).reduce((s: number, x: any) => s + Number(x.passengers_count || 0), 0);
    shiftIds = (shifts || []).map((x: any) => x.id);
  }

  // 4. Vehiculele uzinei (distinct) via factory_route_vehicles → shifts → routes
  let vehicleIds: string[] = [];
  if (shiftIds.length > 0) {
    const { data: rv } = await sb
      .from('lde_factory_route_vehicles')
      .select('vehicle_id')
      .in('route_shift_id', shiftIds);
    vehicleIds = [...new Set((rv || []).map((x: any) => x.vehicle_id))];
  }

  // 5. GPS-ul săptămânii pentru aceste vehicule → total_km (single query)
  let total_km = 0;
  if (vehicleIds.length > 0) {
    const { data: gps } = await sb
      .from('lde_vehicle_gps_daily')
      .select('km_total')
      .gte('date', week_from)
      .lte('date', week_to)
      .in('vehicle_id', vehicleIds);
    total_km = (gps || []).reduce((s: number, x: any) => s + Number(x.km_total || 0), 0);
  }
  total_km = Math.round(total_km * 100) / 100;

  // 6. Valoarea (motor PUR)
  const total_value_lei = computeReceptieValue(
    { billing_model, rate_lei },
    { km: total_km, curse: total_curse, passengers: total_passengers },
  );

  // 7. Upsert idempotent pe (uzina_id, week_from) — re-generarea recalculează draftul.
  const { data: act, error } = await sb
    .from('lde_receptie_acts')
    .upsert(
      {
        uzina_id,
        week_from,
        week_to,
        total_km,
        total_curse,
        total_passengers,
        total_value_lei,
        billing_model,
        rate_lei,
        status: 'draft',
        generated_at: new Date().toISOString(),
        generated_by_admin_id: session.id,
      },
      { onConflict: 'uzina_id,week_from' },
    )
    .select('id')
    .single();
  if (error || !act) throw new Error(error?.message || 'Eroare la generarea actului');

  revalidatePath('/lde/acte');
  return {
    act_id: act.id,
    total_km,
    total_curse,
    total_passengers,
    total_value_lei,
    has_gps: vehicleIds.length > 0 && total_km > 0,
  };
}

export async function markActSent(id: string): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const { error } = await getSupabase()
    .from('lde_receptie_acts')
    .update({ status: 'trimis' })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/acte');
}

export async function deleteAct(id: string): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const { error } = await getSupabase().from('lde_receptie_acts').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/acte');
}
