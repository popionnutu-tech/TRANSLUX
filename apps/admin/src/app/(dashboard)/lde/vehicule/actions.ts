'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import type { LdeVehicleType, LdeOverrideReason } from '@translux/db';

export interface LdeVehicleNormRow {
  vehicle_id: string;
  plate_number: string;
  vehicle_type_id: string | null;
  type_name: string | null;
  norm_type: number | null;                 // norma tipului (COALESCE-able)
  measured: number | null;                  // override măsurat (camioane: gol/min)
  measured_loaded: number | null;           // doar camioane: încărcat (max interval)
  effective_norm: number | null;            // COALESCE(measured_loaded, measured, norm_type)
  in_repair: boolean;
  override_reason: LdeOverrideReason | null;
  override_notes: string | null;
  has_type: boolean;                         // false → DT inactiv pentru mașină
}

/** Tipurile de mașini pentru dropdown. */
export async function getVehicleTypes(): Promise<LdeVehicleType[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data, error } = await getSupabase()
    .from('lde_vehicle_types')
    .select('*')
    .order('display_name');
  if (error) throw new Error(error.message);
  return (data || []) as LdeVehicleType[];
}

/**
 * Toate vehiculele active + LEFT JOIN lde_vehicle_norms + lde_vehicle_types.
 * Norma efectivă = COALESCE(measured, type.norm_l_per_100km).
 * has_type=false → mașina nu are tip atribuit → DT nu poate calcula norma.
 */
export async function getVehicleNorms(): Promise<LdeVehicleNormRow[]> {
  requireRole(await verifySession(), 'ADMIN');

  const sb = getSupabase();

  // vehicles 1:0..1 lde_vehicle_norms, iar norms → lde_vehicle_types (pentru norma tipului).
  const { data, error } = await sb
    .from('vehicles')
    .select(
      'id, plate_number, lde_vehicle_norms ( vehicle_type_id, measured_consumption_l_per_100km, measured_consumption_l_per_100km_loaded, in_repair, override_reason, override_notes, lde_vehicle_types ( display_name, norm_l_per_100km ) )'
    )
    .eq('active', true)
    .order('plate_number');

  if (error) throw new Error(error.message);

  return (data || []).map((v: any): LdeVehicleNormRow => {
    const norm = Array.isArray(v.lde_vehicle_norms) ? v.lde_vehicle_norms[0] : v.lde_vehicle_norms;
    const type = norm
      ? Array.isArray(norm.lde_vehicle_types)
        ? norm.lde_vehicle_types[0]
        : norm.lde_vehicle_types
      : null;

    const vehicle_type_id: string | null = norm?.vehicle_type_id ?? null;
    const norm_type: number | null = type?.norm_l_per_100km ?? null;
    const measured: number | null = norm?.measured_consumption_l_per_100km ?? null;
    const measured_loaded: number | null = norm?.measured_consumption_l_per_100km_loaded ?? null;

    return {
      vehicle_id: v.id as string,
      plate_number: v.plate_number as string,
      vehicle_type_id,
      type_name: type?.display_name ?? null,
      norm_type,
      measured,
      measured_loaded,
      effective_norm: measured_loaded ?? measured ?? norm_type,
      in_repair: norm?.in_repair ?? false,
      override_reason: (norm?.override_reason ?? null) as LdeOverrideReason | null,
      override_notes: norm?.override_notes ?? null,
      has_type: !!vehicle_type_id,
    };
  });
}

/**
 * Atribuie tipul unei mașini (upsert lde_vehicle_norms).
 * measured rămâne ce era (sau NULL la creare) — atribuirea tipului NU șterge override-ul.
 */
export async function assignVehicleType(vehicle_id: string, vehicle_type_id: string) {
  requireRole(await verifySession(), 'ADMIN');
  if (!vehicle_id) throw new Error('vehicle_id este obligatoriu');
  if (!vehicle_type_id) throw new Error('vehicle_type_id este obligatoriu');

  const sb = getSupabase();
  const { error } = await sb
    .from('lde_vehicle_norms')
    .upsert(
      { vehicle_id, vehicle_type_id, updated_at: new Date().toISOString() },
      { onConflict: 'vehicle_id' }
    );
  if (error) throw new Error(error.message);
  revalidatePath('/lde/vehicule');
}

/**
 * Setează override-ul de consum măsurat + motivul.
 * Necesită ca mașina să aibă deja tip (rândul există) — altfel vehicle_type_id ar fi NULL (NOT NULL în 203).
 */
export async function setMeasuredOverride(
  vehicle_id: string,
  measured: number,
  override_reason: LdeOverrideReason | null,
  measured_loaded: number | null = null
) {
  requireRole(await verifySession(), 'ADMIN');
  if (!vehicle_id) throw new Error('vehicle_id este obligatoriu');
  if (!Number.isFinite(measured) || measured <= 0) {
    throw new Error('Consumul măsurat trebuie să fie un număr pozitiv');
  }
  if (measured_loaded != null && (!Number.isFinite(measured_loaded) || measured_loaded < measured)) {
    throw new Error('Consumul încărcat trebuie să fie ≥ consumul gol');
  }

  const sb = getSupabase();
  const { data: existing, error: selErr } = await sb
    .from('lde_vehicle_norms')
    .select('vehicle_id')
    .eq('vehicle_id', vehicle_id)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!existing) {
    throw new Error('Atribuie întâi un tip mașinii, apoi setează consumul măsurat.');
  }

  const { error } = await sb
    .from('lde_vehicle_norms')
    .update({
      measured_consumption_l_per_100km: measured,
      measured_consumption_l_per_100km_loaded: measured_loaded,
      override_reason,
      updated_at: new Date().toISOString(),
    })
    .eq('vehicle_id', vehicle_id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/vehicule');
}

/** Șterge override-ul (measured NULL) → mașina revine la norma tipului. */
export async function clearMeasured(vehicle_id: string) {
  requireRole(await verifySession(), 'ADMIN');
  if (!vehicle_id) throw new Error('vehicle_id este obligatoriu');

  const sb = getSupabase();
  const { error } = await sb
    .from('lde_vehicle_norms')
    .update({
      measured_consumption_l_per_100km: null,
      measured_consumption_l_per_100km_loaded: null,
      override_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('vehicle_id', vehicle_id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/vehicule');
}

/** Comută starea «în reparație». Necesită rând existent (tip atribuit). */
export async function toggleInRepair(vehicle_id: string, in_repair: boolean) {
  requireRole(await verifySession(), 'ADMIN');
  if (!vehicle_id) throw new Error('vehicle_id este obligatoriu');

  const sb = getSupabase();
  const { data: existing, error: selErr } = await sb
    .from('lde_vehicle_norms')
    .select('vehicle_id')
    .eq('vehicle_id', vehicle_id)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!existing) {
    throw new Error('Atribuie întâi un tip mașinii.');
  }

  const { error } = await sb
    .from('lde_vehicle_norms')
    .update({ in_repair, updated_at: new Date().toISOString() })
    .eq('vehicle_id', vehicle_id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/vehicule');
}
