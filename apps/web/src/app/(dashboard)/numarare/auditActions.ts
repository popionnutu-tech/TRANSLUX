'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import type { SavedEntry } from './actions';

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

  await sb.from('counting_sessions').update(updateFields).eq('id', sessionId);

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
