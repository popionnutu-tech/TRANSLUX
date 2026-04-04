'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// ─── Типы ───

export interface RouteForCounting {
  crm_route_id: number;
  dest_to_ro: string;
  time_chisinau: string;
  time_nord: string;
  driver_name: string | null;
  vehicle_plate: string | null;
  session_id: string | null;
  session_status: string | null;
  locked_by_email: string | null;
  locked_by_id: string | null;
  double_tariff: boolean;
  tur_total_lei: number | null;
  retur_total_lei: number | null;
}

export interface RouteStop {
  stopOrder: number;
  nameRo: string;
  kmFromStart: number;
}

export interface SavedEntry {
  id: string;
  stopOrder: number;
  stopNameRo: string;
  kmFromStart: number;
  totalPassengers: number;
  shortPassengers: {
    id: string;
    boardedStopOrder: number;
    boardedStopNameRo: string;
    kmDistance: number;
    passengerCount: number;
    amountLei: number | null;
  }[];
}

export interface TariffConfig {
  ratePerKmLong: number;
  ratePerKmShort: number;
  doubleTariffEnabled: boolean;
}

// ─── Загрузка данных ───

export async function getRoutesForDate(date: string): Promise<{ data?: RouteForCounting[]; error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };

  const sb = getSupabase();

  // Берём assignments на дату с join на routes, drivers, vehicles
  const { data: assignments, error: aErr } = await sb
    .from('daily_assignments')
    .select(`
      crm_route_id,
      crm_routes!daily_assignments_crm_route_id_fkey(id, dest_to_ro, time_chisinau, time_nord, active),
      drivers(full_name),
      vehicles!daily_assignments_vehicle_id_fkey(plate_number)
    `)
    .eq('assignment_date', date)
    .eq('crm_routes.active', true);

  if (aErr) return { error: aErr.message };

  // Берём существующие сессии подсчёта на эту дату
  const { data: sessions } = await sb
    .from('counting_sessions')
    .select('crm_route_id, id, status, locked_by, locked_at, double_tariff, tur_total_lei, retur_total_lei, locker:admin_accounts!counting_sessions_locked_by_fkey(email)')
    .eq('assignment_date', date);

  const sessionMap = new Map<number, any>();
  for (const s of sessions || []) {
    sessionMap.set(s.crm_route_id, s);
  }

  const routes: RouteForCounting[] = (assignments || []).map((a: any) => {
    const s = sessionMap.get(a.crm_route_id);
    return {
      crm_route_id: a.crm_route_id,
      dest_to_ro: a.crm_routes.dest_to_ro,
      time_chisinau: a.crm_routes.time_chisinau,
      time_nord: a.crm_routes.time_nord,
      driver_name: a.drivers?.full_name || null,
      vehicle_plate: a.vehicles?.plate_number || null,
      session_id: s?.id || null,
      session_status: s?.status || null,
      locked_by_email: s?.locker?.email || null,
      locked_by_id: s?.locked_by || null,
      double_tariff: s?.double_tariff || false,
      tur_total_lei: s?.tur_total_lei || null,
      retur_total_lei: s?.retur_total_lei || null,
    };
  });

  // Сортируем по времени отправления из Кишинёва
  routes.sort((a, b) => a.time_chisinau.localeCompare(b.time_chisinau));

  return { data: routes };
}

export async function getRouteStops(crmRouteId: number, direction: 'tur' | 'retur'): Promise<RouteStop[]> {
  const session = await verifySession();
  if (!session) return [];

  const sb = getSupabase();
  // Tur = de la Nord → Chișinău, sortăm după km_from_nord
  // Retur = de la Chișinău → Nord, sortăm după km_from_chisinau
  const orderCol = direction === 'tur' ? 'km_from_nord' : 'km_from_chisinau';

  const { data } = await sb
    .from('crm_stop_prices')
    .select('name_ro, km_from_chisinau, km_from_nord')
    .eq('crm_route_id', crmRouteId)
    .order(orderCol, { ascending: true });

  if (!data || data.length === 0) return [];

  return data.map((row: any, idx: number) => ({
    stopOrder: idx + 1,
    nameRo: row.name_ro,
    kmFromStart: direction === 'tur'
      ? Number(row.km_from_nord || 0)
      : Number(row.km_from_chisinau || 0),
  }));
}

export async function getTariffConfig(): Promise<TariffConfig> {
  const sb = getSupabase();
  const { data } = await sb
    .from('app_config')
    .select('key, value')
    .in('key', ['rate_per_km_long', 'rate_per_km_short']);

  const config: Record<string, string> = {};
  for (const row of data || []) {
    config[row.key] = row.value;
  }

  return {
    ratePerKmLong: parseFloat(config['rate_per_km_long'] || '0.94'),
    ratePerKmShort: parseFloat(config['rate_per_km_short'] || '0.94'),
    doubleTariffEnabled: false, // per-session, not global
  };
}

// ─── Locking ───

export async function lockRoute(
  crmRouteId: number,
  date: string,
): Promise<{ sessionId?: string; error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };

  const sb = getSupabase();

  // Upsert сессию
  const { data, error } = await sb
    .from('counting_sessions')
    .upsert({
      crm_route_id: crmRouteId,
      assignment_date: date,
      operator_id: session.id,
      locked_by: session.id,
      locked_at: new Date().toISOString(),
      status: 'new',
    }, { onConflict: 'crm_route_id,assignment_date' })
    .select('id, status, locked_by')
    .single();

  if (error) {
    // Возможно уже заблокирована другим
    const { data: existing } = await sb
      .from('counting_sessions')
      .select('id, locked_by, locked_at, status')
      .eq('crm_route_id', crmRouteId)
      .eq('assignment_date', date)
      .single();

    if (existing && existing.locked_by && existing.locked_by !== session.id) {
      // Проверяем timeout 15 минут
      const lockedAt = new Date(existing.locked_at).getTime();
      const now = Date.now();
      if (now - lockedAt < 15 * 60 * 1000) {
        return { error: 'Cursă blocată de alt operator' };
      }
      // Timeout — перехватываем блокировку
      const { data: updated } = await sb
        .from('counting_sessions')
        .update({ locked_by: session.id, locked_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('id')
        .single();
      return { sessionId: updated?.id };
    }

    return { sessionId: existing?.id };
  }

  return { sessionId: data.id };
}

export async function unlockRoute(sessionId: string): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };

  const sb = getSupabase();
  await sb
    .from('counting_sessions')
    .update({ locked_by: null, locked_at: null })
    .eq('id', sessionId);

  revalidatePath('/numarare');
  return {};
}

// ─── Сохранение данных ───

export async function saveDirection(
  sessionId: string,
  direction: 'tur' | 'retur',
  entries: {
    stopOrder: number;
    stopNameRo: string;
    kmFromStart: number;
    totalPassengers: number;
    shortPassengers: {
      boardedStopOrder: number;
      boardedStopNameRo: string;
      kmDistance: number;
      passengerCount: number;
      amountLei: number;
    }[];
  }[],
  totalLei: number,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };

  const sb = getSupabase();

  // Удаляем старые entries для этого direction
  const { data: oldEntries } = await sb
    .from('counting_entries')
    .select('id')
    .eq('session_id', sessionId)
    .eq('direction', direction);

  if (oldEntries && oldEntries.length > 0) {
    const oldIds = oldEntries.map((e: any) => e.id);
    await sb.from('counting_short_passengers').delete().in('entry_id', oldIds);
    await sb.from('counting_entries').delete().eq('session_id', sessionId).eq('direction', direction);
  }

  // Вставляем новые entries
  for (const entry of entries) {
    const { data: inserted, error: eErr } = await sb
      .from('counting_entries')
      .insert({
        session_id: sessionId,
        direction,
        stop_order: entry.stopOrder,
        stop_name_ro: entry.stopNameRo,
        km_from_start: entry.kmFromStart,
        total_passengers: entry.totalPassengers,
      })
      .select('id')
      .single();

    if (eErr) return { error: eErr.message };

    // Вставляем short passengers
    if (entry.shortPassengers.length > 0) {
      const shorts = entry.shortPassengers.map(sp => ({
        entry_id: inserted!.id,
        boarded_stop_order: sp.boardedStopOrder,
        boarded_stop_name_ro: sp.boardedStopNameRo,
        km_distance: sp.kmDistance,
        passenger_count: sp.passengerCount,
        amount_lei: sp.amountLei,
      }));
      const { error: spErr } = await sb
        .from('counting_short_passengers')
        .insert(shorts);
      if (spErr) return { error: spErr.message };
    }
  }

  // Обновляем статус и сумму
  const updateFields: any = {};
  if (direction === 'tur') {
    updateFields.tur_total_lei = totalLei;
    updateFields.status = 'tur_done';
  } else {
    updateFields.retur_total_lei = totalLei;
    updateFields.status = 'completed';
  }
  updateFields.locked_by = null;
  updateFields.locked_at = null;

  await sb.from('counting_sessions').update(updateFields).eq('id', sessionId);

  revalidatePath('/numarare');
  return {};
}

export async function loadSavedEntries(
  sessionId: string,
  direction: 'tur' | 'retur',
): Promise<SavedEntry[]> {
  const session = await verifySession();
  if (!session) return [];

  const sb = getSupabase();
  const { data: entries } = await sb
    .from('counting_entries')
    .select(`
      id, stop_order, stop_name_ro, km_from_start, total_passengers,
      counting_short_passengers(id, boarded_stop_order, boarded_stop_name_ro, km_distance, passenger_count, amount_lei)
    `)
    .eq('session_id', sessionId)
    .eq('direction', direction)
    .order('stop_order');

  return (entries || []).map((e: any) => ({
    id: e.id,
    stopOrder: e.stop_order,
    stopNameRo: e.stop_name_ro,
    kmFromStart: Number(e.km_from_start),
    totalPassengers: e.total_passengers,
    shortPassengers: (e.counting_short_passengers || []).map((sp: any) => ({
      id: sp.id,
      boardedStopOrder: sp.boarded_stop_order,
      boardedStopNameRo: sp.boarded_stop_name_ro,
      kmDistance: Number(sp.km_distance),
      passengerCount: sp.passenger_count,
      amountLei: sp.amount_lei ? Number(sp.amount_lei) : null,
    })),
  }));
}

// ─── Admin camere: toggle tarif dublu ───

export async function toggleDoubleTariff(
  sessionId: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'ADMIN_CAMERE')) {
    return { error: 'Acces interzis' };
  }

  const sb = getSupabase();
  await sb.from('counting_sessions').update({ double_tariff: enabled }).eq('id', sessionId);
  revalidatePath('/numarare');
  return {};
}

// ─── Admin camere: deblocare forțată ───

export async function forceUnlock(sessionId: string): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'ADMIN_CAMERE')) {
    return { error: 'Acces interzis' };
  }

  return unlockRoute(sessionId);
}
