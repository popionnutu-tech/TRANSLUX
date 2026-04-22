'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const AUDIT_ROLES = ['ADMIN', 'ADMIN_CAMERE'] as const;

// SavedEntry will be imported from ./actions in Tasks 4/5 when save/load actions are added.

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

  const updates: any = {
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
  // CASCADE pe short_passengers via FK
  const { error: delErr } = await sb
    .from('counting_audit_entries')
    .delete()
    .eq('session_id', sessionId);
  if (delErr) return { error: delErr.message };

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

  revalidatePath('/numarare');
  return {};
}
