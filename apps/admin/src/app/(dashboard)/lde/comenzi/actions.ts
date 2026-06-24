'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import type {
  LdeExtraOrder,
  LdeExtraOrderType,
  LdeSchoolPeriod,
} from '@translux/db';

const PATH = '/lde/comenzi';

export interface ExtraOrderRow extends LdeExtraOrder {
  driver_name: string;
}

export interface DriverOption {
  id: string;
  full_name: string;
}

// ── Comenzi suplimentare pe lună (cu nume șofer, fără N+1) ──
export async function getExtraOrders(month: string): Promise<ExtraOrderRow[]> {
  requireRole(await verifySession(), 'ADMIN');
  const monthStart = month + '-01';
  const start = new Date(monthStart + 'T00:00:00Z');
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const endStr = end.toISOString().slice(0, 10);

  const { data } = await getSupabase()
    .from('lde_extra_orders')
    .select('*, drivers(full_name)')
    .gte('work_date', monthStart)
    .lte('work_date', endStr)
    .order('work_date', { ascending: false });

  return ((data || []) as any[]).map((r) => ({
    ...r,
    driver_name: r.drivers?.full_name ?? '—',
  })) as ExtraOrderRow[];
}

export async function createExtraOrder(data: {
  driver_id: string;
  work_date: string;
  order_type: LdeExtraOrderType;
  amount_lei: number;
  notes?: string;
}): Promise<void> {
  const session = requireRole(await verifySession(), 'ADMIN');
  if (!data.driver_id) throw new Error('Selectați șoferul');
  if (!data.work_date) throw new Error('Selectați data');
  if (!(data.amount_lei > 0)) throw new Error('Suma trebuie să fie pozitivă');

  const { error } = await getSupabase().from('lde_extra_orders').insert({
    driver_id: data.driver_id,
    work_date: data.work_date,
    order_type: data.order_type,
    amount_lei: data.amount_lei,
    notes: data.notes?.trim() || null,
    entered_by_admin_id: session.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}

export async function deleteExtraOrder(id: string): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const { error } = await getSupabase().from('lde_extra_orders').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
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

// ── Perioade școlare ──
export async function getSchoolPeriods(): Promise<LdeSchoolPeriod[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase()
    .from('lde_school_periods')
    .select('*')
    .order('period_month', { ascending: false });
  return (data || []) as LdeSchoolPeriod[];
}

export async function setSchoolPeriod(
  period_month: string,
  is_active: boolean,
  rate_per_day_lei: number,
): Promise<void> {
  const session = requireRole(await verifySession(), 'ADMIN');
  if (!period_month) throw new Error('Selectați luna');
  if (!(rate_per_day_lei >= 0)) throw new Error('Rata/zi trebuie să fie pozitivă');

  const monthStart = period_month.length === 7 ? period_month + '-01' : period_month;

  const { error } = await getSupabase()
    .from('lde_school_periods')
    .upsert(
      {
        period_month: monthStart,
        is_active,
        rate_per_day_lei,
        set_by_admin_id: session.id,
        set_at: new Date().toISOString(),
      },
      { onConflict: 'period_month' },
    );
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}
