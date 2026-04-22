'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import type { SavedEntry } from './actions';
import type { ComparisonInput } from './comparison';

const AUDIT_ROLES = ['ADMIN', 'ADMIN_CAMERE'] as const;

/**
 * Blochează sesiunea pentru audit. Doar ADMIN/ADMIN_CAMERE.
 * Returnează eroare dacă sesiunea NU este 'completed' sau dacă alt admin audită acum.
 */
export async function lockAudit(sessionId: string): Promise<{ error?: string }> {
  let session;
  try { session = requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();

  const { data: row, error: fetchErr } = await sb
    .from('counting_sessions')
    .select('id, status, audit_status, audit_locked_by, audit_operator_id')
    .eq('id', sessionId)
    .single();

  if (fetchErr || !row) return { error: 'Sesiune inexistentă' };
  if (row.status !== 'completed') return { error: 'Cursa trebuie să fie finalizată de operator înainte de audit' };
  if (row.audit_locked_by && row.audit_locked_by !== session.id) {
    return { error: 'Audit în desfășurare de alt admin' };
  }

  const updates: {
    audit_locked_by: string;
    audit_locked_at: string;
    audit_operator_id?: string;
    audit_status?: 'new';
  } = {
    audit_locked_by: session.id,
    audit_locked_at: new Date().toISOString(),
  };
  if (!row.audit_operator_id) updates.audit_operator_id = session.id;
  if (!row.audit_status) updates.audit_status = 'new';

  const { error: updErr } = await sb.from('counting_sessions').update(updates).eq('id', sessionId);
  if (updErr) return { error: updErr.message };

  revalidatePath('/numarare');
  return {};
}

/**
 * Eliberează blocajul audit (fără a reseta progresul).
 */
export async function unlockAudit(sessionId: string): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();
  const { error } = await sb
    .from('counting_sessions')
    .update({ audit_locked_by: null, audit_locked_at: null })
    .eq('id', sessionId);

  if (error) return { error: error.message };
  revalidatePath('/numarare');
  return {};
}

/**
 * Resetează auditul complet — șterge entries, resetează totaluri și status.
 * Folosit pentru "Refă audit".
 */
export async function resetAudit(sessionId: string): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();

  // Update first: if this fails, nothing is lost. If the later delete fails,
  // the session shows "no audit" and orphan entries are harmless (overwritten on next audit).
  const { error: updErr } = await sb
    .from('counting_sessions')
    .update({
      audit_status: null,
      audit_tur_total_lei: null,
      audit_retur_total_lei: null,
      audit_tur_single_lei: null,
      audit_retur_single_lei: null,
      audit_locked_by: null,
      audit_locked_at: null,
    })
    .eq('id', sessionId);
  if (updErr) return { error: updErr.message };

  // CASCADE pe short_passengers via FK
  const { error: delErr } = await sb
    .from('counting_audit_entries')
    .delete()
    .eq('session_id', sessionId);
  if (delErr) return { error: delErr.message };

  revalidatePath('/numarare');
  return {};
}

/**
 * Salvează o direcție (tur sau retur) de audit interurban.
 * Șterge entries vechi pentru acea direcție înainte de inserare.
 * Updatează audit_status: tur → 'tur_done', retur → 'completed'.
 */
export async function saveAuditDirection(
  sessionId: string,
  direction: 'tur' | 'retur',
  entries: {
    stopOrder: number;
    stopNameRo: string;
    kmFromStart: number;
    totalPassengers: number;
    alighted: number;
    shortPassengers: {
      boardedStopOrder: number;
      boardedStopNameRo: string;
      kmDistance: number;
      passengerCount: number;
      amountLei: number;
    }[];
  }[],
  totalLei: number,
  totalLeiSingle: number,
): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();

  // Șterge entries vechi pentru această direcție
  const { data: oldEntries } = await sb
    .from('counting_audit_entries')
    .select('id')
    .eq('session_id', sessionId)
    .eq('direction', direction);

  if (oldEntries && oldEntries.length > 0) {
    const oldIds = oldEntries.map((e: any) => e.id);
    await sb.from('counting_audit_short_passengers').delete().in('entry_id', oldIds);
    await sb.from('counting_audit_entries').delete().eq('session_id', sessionId).eq('direction', direction);
  }

  // Inserează noile entries
  for (const entry of entries) {
    const { data: inserted, error: eErr } = await sb
      .from('counting_audit_entries')
      .insert({
        session_id: sessionId,
        direction,
        stop_order: entry.stopOrder,
        stop_name_ro: entry.stopNameRo,
        km_from_start: entry.kmFromStart,
        total_passengers: entry.totalPassengers,
        alighted: entry.alighted,
      })
      .select('id')
      .single();

    if (eErr) return { error: eErr.message };

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
        .from('counting_audit_short_passengers')
        .insert(shorts);
      if (spErr) return { error: spErr.message };
    }
  }

  const updateFields: {
    audit_last_edited_at: string;
    audit_locked_by: null;
    audit_locked_at: null;
    audit_tur_total_lei?: number;
    audit_tur_single_lei?: number;
    audit_retur_total_lei?: number;
    audit_retur_single_lei?: number;
    audit_status: 'tur_done' | 'completed';
  } = {
    audit_last_edited_at: new Date().toISOString(),
    audit_locked_by: null,
    audit_locked_at: null,
    audit_status: direction === 'tur' ? 'tur_done' : 'completed',
  };
  if (direction === 'tur') {
    updateFields.audit_tur_total_lei = totalLei;
    updateFields.audit_tur_single_lei = totalLeiSingle;
  } else {
    updateFields.audit_retur_total_lei = totalLei;
    updateFields.audit_retur_single_lei = totalLeiSingle;
  }

  const { error: updErr } = await sb.from('counting_sessions').update(updateFields).eq('id', sessionId);
  if (updErr) return { error: updErr.message };

  revalidatePath('/numarare');
  return {};
}

/**
 * Încarcă entries de audit pentru continuarea numărării (dacă admin a salvat tur dar nu retur).
 */
export async function loadAuditEntries(
  sessionId: string,
  direction: 'tur' | 'retur',
): Promise<SavedEntry[]> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return []; }

  const sb = getSupabase();
  const { data: entries } = await sb
    .from('counting_audit_entries')
    .select(`
      id, stop_order, stop_name_ro, km_from_start, total_passengers, alighted,
      counting_audit_short_passengers(id, boarded_stop_order, boarded_stop_name_ro, km_distance, passenger_count, amount_lei)
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
    alighted: e.alighted ?? 0,
    shortPassengers: (e.counting_audit_short_passengers || []).map((sp: any) => ({
      id: sp.id,
      boardedStopOrder: sp.boarded_stop_order,
      boardedStopNameRo: sp.boarded_stop_name_ro,
      kmDistance: Number(sp.km_distance),
      passengerCount: sp.passenger_count,
      amountLei: sp.amount_lei ? Number(sp.amount_lei) : null,
    })),
  }));
}

/**
 * Salvează un ciclu suburban de audit. Șterge entries anterioare pentru acest (session, schedule, cycle).
 */
export async function saveSuburbanAuditCycle(
  sessionId: string,
  scheduleId: number,
  direction: 'tur' | 'retur',
  cycleNumber: number,
  entries: {
    stopOrder: number;
    stopNameRo: string;
    kmFromStart: number;
    totalPassengers: number;
    alighted: number;
  }[],
  totalLei: number,
  altDriverId?: string | null,
  altVehicleId?: string | null,
): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return { error: 'Acces interzis' }; }
  const sb = getSupabase();

  await sb
    .from('counting_audit_entries')
    .delete()
    .eq('session_id', sessionId)
    .eq('schedule_id', scheduleId)
    .eq('cycle_number', cycleNumber);

  for (const entry of entries) {
    const { error } = await sb.from('counting_audit_entries').insert({
      session_id: sessionId,
      direction,
      schedule_id: scheduleId,
      cycle_number: cycleNumber,
      stop_order: entry.stopOrder,
      stop_name_ro: entry.stopNameRo,
      km_from_start: entry.kmFromStart,
      total_passengers: entry.totalPassengers,
      alighted: entry.alighted,
      alt_driver_id: altDriverId || null,
      alt_vehicle_id: altVehicleId || null,
    });
    if (error) return { error: error.message };
  }

  // Pentru suburban, marcăm status și păstrăm totalul raportat per call.
  // Totalul final se recalculează când ambele direcții au cel puțin un ciclu.
  const updateFields: {
    audit_last_edited_at: string;
    audit_locked_by: null;
    audit_locked_at: null;
    audit_status: 'tur_done' | 'completed';
    audit_tur_total_lei?: number;
    audit_retur_total_lei?: number;
  } = {
    audit_last_edited_at: new Date().toISOString(),
    audit_locked_by: null,
    audit_locked_at: null,
    audit_status: direction === 'retur' ? 'completed' : 'tur_done',
  };
  if (direction === 'tur') {
    updateFields.audit_tur_total_lei = totalLei;
  } else {
    updateFields.audit_retur_total_lei = totalLei;
  }

  const { error: updErr } = await sb.from('counting_sessions').update(updateFields).eq('id', sessionId);
  if (updErr) return { error: updErr.message };

  revalidatePath('/numarare');
  return {};
}

export interface SuburbanAuditEntry {
  scheduleId: number | null;
  cycleNumber: number | null;
  direction: 'tur' | 'retur';
  stopOrder: number;
  stopNameRo: string;
  kmFromStart: number;
  totalPassengers: number;
  alighted: number;
  altDriverId: string | null;
  altVehicleId: string | null;
}

export async function loadSuburbanAuditEntries(sessionId: string): Promise<SuburbanAuditEntry[]> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return []; }
  const sb = getSupabase();
  const { data } = await sb
    .from('counting_audit_entries')
    .select('schedule_id, cycle_number, direction, stop_order, stop_name_ro, km_from_start, total_passengers, alighted, alt_driver_id, alt_vehicle_id')
    .eq('session_id', sessionId)
    .order('cycle_number')
    .order('stop_order');
  return (data || []).map((e: any) => ({
    scheduleId: e.schedule_id,
    cycleNumber: e.cycle_number,
    direction: e.direction,
    stopOrder: e.stop_order,
    stopNameRo: e.stop_name_ro,
    kmFromStart: Number(e.km_from_start),
    totalPassengers: e.total_passengers,
    alighted: e.alighted ?? 0,
    altDriverId: e.alt_driver_id || null,
    altVehicleId: e.alt_vehicle_id || null,
  }));
}

export interface AuditComparison {
  sessionId: string;
  routeType: 'interurban' | 'suburban';
  tur: { operator: ComparisonInput[]; audit: ComparisonInput[] };
  retur: { operator: ComparisonInput[]; audit: ComparisonInput[] };
  // Pentru suburban, grouping pe (schedule_id, cycle_number) — gestionat client-side.
  suburbanGroups?: {
    scheduleId: number;
    cycleNumber: number;
    direction: 'tur' | 'retur';
    operator: ComparisonInput[];
    audit: ComparisonInput[];
  }[];
  totals: {
    operatorTur: number | null;
    operatorRetur: number | null;
    auditTur: number | null;
    auditRetur: number | null;
  };
}

/**
 * Încarcă datele operator + audit pentru afișarea comparației.
 * Pentru interurban: grupare pe direcție.
 * Pentru suburban: returnează grupuri (schedule_id, cycle_number).
 */
export async function getAuditComparison(sessionId: string): Promise<{ data?: AuditComparison; error?: string }> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();

  const { data: sess, error: sessErr } = await sb
    .from('counting_sessions')
    .select(`
      id, crm_route_id,
      tur_total_lei, retur_total_lei, audit_tur_total_lei, audit_retur_total_lei,
      crm_routes!inner(route_type)
    `)
    .eq('id', sessionId)
    .single();

  if (sessErr) return { error: sessErr.message };
  if (!sess) return { error: 'Sesiune inexistentă' };
  const crmRoutesJoin = (sess as any).crm_routes;
  const routeType = (Array.isArray(crmRoutesJoin) ? crmRoutesJoin[0]?.route_type : crmRoutesJoin?.route_type) || 'interurban';

  // Încarcă entries operator + audit
  const [opRes, auRes] = await Promise.all([
    sb.from('counting_entries')
      .select(`
        direction, stop_order, stop_name_ro, total_passengers, alighted, schedule_id, cycle_number,
        counting_short_passengers(passenger_count)
      `)
      .eq('session_id', sessionId),
    sb.from('counting_audit_entries')
      .select(`
        direction, stop_order, stop_name_ro, total_passengers, alighted, schedule_id, cycle_number,
        counting_audit_short_passengers(passenger_count)
      `)
      .eq('session_id', sessionId),
  ]);

  type Row = any;
  function toCI(r: Row, shortsKey: 'counting_short_passengers' | 'counting_audit_short_passengers'): ComparisonInput {
    const shorts = (r[shortsKey] || []) as { passenger_count: number }[];
    const shortSum = shorts.reduce((s, sp) => s + (sp.passenger_count || 0), 0);
    return {
      stopOrder: r.stop_order,
      stopNameRo: r.stop_name_ro,
      totalPassengers: r.total_passengers || 0,
      alighted: r.alighted || 0,
      shortSum,
    };
  }

  const opRows = (opRes.data || []) as Row[];
  const auRows = (auRes.data || []) as Row[];

  if (routeType === 'suburban') {
    const groupMap = new Map<string, {
      scheduleId: number;
      cycleNumber: number;
      direction: 'tur' | 'retur';
      operator: ComparisonInput[];
      audit: ComparisonInput[];
    }>();
    const keyOf = (r: Row) => `${r.schedule_id}|${r.cycle_number}|${r.direction}`;
    for (const r of opRows) {
      if (!r.schedule_id) continue;
      const k = keyOf(r);
      if (!groupMap.has(k)) groupMap.set(k, { scheduleId: r.schedule_id, cycleNumber: r.cycle_number, direction: r.direction, operator: [], audit: [] });
      groupMap.get(k)!.operator.push(toCI(r, 'counting_short_passengers'));
    }
    for (const r of auRows) {
      if (!r.schedule_id) continue;
      const k = keyOf(r);
      if (!groupMap.has(k)) groupMap.set(k, { scheduleId: r.schedule_id, cycleNumber: r.cycle_number, direction: r.direction, operator: [], audit: [] });
      groupMap.get(k)!.audit.push(toCI(r, 'counting_audit_short_passengers'));
    }

    return {
      data: {
        sessionId,
        routeType: 'suburban',
        tur: { operator: [], audit: [] },
        retur: { operator: [], audit: [] },
        suburbanGroups: Array.from(groupMap.values()).sort((a, b) =>
          a.direction.localeCompare(b.direction) || a.scheduleId - b.scheduleId || a.cycleNumber - b.cycleNumber
        ),
        totals: {
          operatorTur: (sess as any).tur_total_lei ?? null,
          operatorRetur: (sess as any).retur_total_lei ?? null,
          auditTur: (sess as any).audit_tur_total_lei ?? null,
          auditRetur: (sess as any).audit_retur_total_lei ?? null,
        },
      },
    };
  }

  const turOp = opRows.filter(r => r.direction === 'tur').map(r => toCI(r, 'counting_short_passengers'));
  const returOp = opRows.filter(r => r.direction === 'retur').map(r => toCI(r, 'counting_short_passengers'));
  const turAu = auRows.filter(r => r.direction === 'tur').map(r => toCI(r, 'counting_audit_short_passengers'));
  const returAu = auRows.filter(r => r.direction === 'retur').map(r => toCI(r, 'counting_audit_short_passengers'));

  return {
    data: {
      sessionId,
      routeType: 'interurban',
      tur: { operator: turOp, audit: turAu },
      retur: { operator: returOp, audit: returAu },
      totals: {
        operatorTur: (sess as any).tur_total_lei ?? null,
        operatorRetur: (sess as any).retur_total_lei ?? null,
        auditTur: (sess as any).audit_tur_total_lei ?? null,
        auditRetur: (sess as any).audit_retur_total_lei ?? null,
      },
    },
  };
}
