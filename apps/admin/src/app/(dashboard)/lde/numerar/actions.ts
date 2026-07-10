'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { chisinauMonthBounds } from '@/lib/chisinau-time';
import type { LdeFuelAlimentariCash } from '@translux/db';

const PATH = '/lde/numerar';

export interface CashFuelRow extends LdeFuelAlimentariCash {
  vehicle_plate: string;
  driver_name: string | null;
}

export interface VehicleOption {
  id: string;
  plate_number: string;
}

export interface DriverOption {
  id: string;
  full_name: string;
}

// ── Lista alimentărilor numerar pe lună (cu plăcuță + nume șofer, fără N+1) ──
export async function getCashFuel(month: string): Promise<CashFuelRow[]> {
  requireRole(await verifySession(), 'ADMIN');
  // luna în ora Chișinăului (convenția unică LDE)
  const { startISO, nextMonthStartISO } = chisinauMonthBounds(month + '-01');

  const { data, error } = await getSupabase()
    .from('lde_fuel_alimentari_cash')
    .select('*, vehicles!inner ( plate_number ), drivers ( full_name )')
    .gte('alimentat_at', startISO)
    .lt('alimentat_at', nextMonthStartISO)
    .order('alimentat_at', { ascending: false });

  if (error) return [];

  return ((data || []) as any[]).map((r) => ({
    ...r,
    vehicle_plate: r.vehicles?.plate_number ?? '—',
    driver_name: r.drivers?.full_name ?? null,
  })) as CashFuelRow[];
}

// ── Count per mașină în lună (pentru pattern numerar_des: >1/lună) ──
export async function getCashCountByVehicle(month: string): Promise<Record<string, number>> {
  requireRole(await verifySession(), 'ADMIN');
  const { startISO, nextMonthStartISO } = chisinauMonthBounds(month + '-01');

  const { data, error } = await getSupabase()
    .from('lde_fuel_alimentari_cash')
    .select('vehicle_id')
    .gte('alimentat_at', startISO)
    .lt('alimentat_at', nextMonthStartISO);

  if (error) return {};

  const counts: Record<string, number> = {};
  for (const r of (data || []) as Array<{ vehicle_id: string }>) {
    counts[r.vehicle_id] = (counts[r.vehicle_id] ?? 0) + 1;
  }
  return counts;
}

// ── Mașini active pentru dropdown ──
export async function getVehiclesForSelect(): Promise<VehicleOption[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase()
    .from('vehicles')
    .select('id, plate_number')
    .eq('active', true)
    .order('plate_number');
  return (data || []) as VehicleOption[];
}

// ── Șoferi activi pentru dropdown ──
export async function getDriversForSelect(): Promise<DriverOption[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase()
    .from('drivers')
    .select('id, full_name')
    .eq('active', true)
    .order('full_name');
  return (data || []) as DriverOption[];
}

// ── Adăugare manuală (fără OCR — ocr_source_file/ocr_confidence = null) ──
export async function createCashFuel(data: {
  vehicle_id: string;
  driver_id?: string;
  alimentat_at: string;
  litri: number;
  suma_lei: number;
  statie: string;
  notes?: string;
}): Promise<void> {
  const session = requireRole(await verifySession(), 'ADMIN');
  if (!data.vehicle_id) throw new Error('Selectați mașina');
  if (!data.alimentat_at) throw new Error('Selectați data și ora');
  if (!(data.litri > 0)) throw new Error('Litrii trebuie să fie pozitivi');
  if (!(data.suma_lei > 0)) throw new Error('Suma trebuie să fie pozitivă');
  if (!data.statie?.trim()) throw new Error('Indicați stația');

  const { error } = await getSupabase().from('lde_fuel_alimentari_cash').insert({
    vehicle_id: data.vehicle_id,
    driver_id: data.driver_id || null,
    alimentat_at: new Date(data.alimentat_at).toISOString(),
    litri: data.litri,
    suma_lei: data.suma_lei,
    statie: data.statie.trim(),
    ocr_source_file: null,
    ocr_confidence: null,
    entered_by_admin_id: session.id,
    notes: data.notes?.trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}

export async function deleteCashFuel(id: string): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const { error } = await getSupabase().from('lde_fuel_alimentari_cash').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}
