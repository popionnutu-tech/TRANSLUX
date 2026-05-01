'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

export interface PendingChange {
  id: string;
  stop_id: number;
  stop_name: string;
  direction: 'tur' | 'retur';
  old_time: string | null;
  new_time: string;
}

export interface ProposedReturSwap {
  /** dacă proposed_retur_disabled = true, înseamnă „fără retur" */
  proposed_retur_disabled: boolean;
  proposed_retur_uses_route_id: number | null;
  proposed_route_name: string | null;
  proposed_time: string | null;
  /** id-ul rutei care în prezent folosește slot-ul propus (cine pierde) */
  current_claimer_route_id: number | null;
  current_claimer_route_name: string | null;
}

export interface PendingSubmission {
  id: string;
  crm_route_id: number;
  route_name: string;
  time_chisinau: string | null;
  retur_same: boolean;
  retur_change_proposed: boolean;
  retur_swap: ProposedReturSwap | null;
  created_at: string;
  changes: PendingChange[];
}

export interface RouteStatus {
  crm_route_id: number;
  route_name: string;
  time_nord: string | null;
  time_chisinau: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'never';
  last_decided_at: string | null;
  last_pending_at: string | null;
}

export async function getRouteStatuses(): Promise<RouteStatus[]> {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') return [];
  const supabase = getSupabase();

  const { data: routes } = await supabase
    .from('crm_routes')
    .select('id, dest_to_ro, time_nord, time_chisinau')
    .eq('active', true)
    .eq('route_type', 'interurban')
    .order('id');

  const { data: subs } = await supabase
    .from('route_check_submissions')
    .select('crm_route_id, status, decided_at, created_at')
    .order('created_at', { ascending: false });

  const lastByRoute = new Map<number, { status: string; decided_at: string | null; created_at: string }[]>();
  for (const s of (subs || []) as any[]) {
    const arr = lastByRoute.get(s.crm_route_id) || [];
    arr.push(s);
    lastByRoute.set(s.crm_route_id, arr);
  }

  return (routes || []).map((r: any) => {
    const subList = lastByRoute.get(r.id) || [];
    const pending = subList.find((s) => s.status === 'pending');
    const lastDecided = subList.find((s) => s.status === 'approved' || s.status === 'rejected');
    let status: RouteStatus['status'] = 'never';
    if (pending) status = 'pending';
    else if (lastDecided) status = lastDecided.status as 'approved' | 'rejected';
    return {
      crm_route_id: r.id,
      route_name: r.dest_to_ro,
      time_nord: r.time_nord,
      time_chisinau: r.time_chisinau,
      status,
      last_decided_at: lastDecided?.decided_at || null,
      last_pending_at: pending?.created_at || null,
    };
  });
}

export async function getPendingSubmissions(): Promise<PendingSubmission[]> {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') return [];

  const supabase = getSupabase();
  const { data: subs } = await supabase
    .from('route_check_submissions')
    .select('id, crm_route_id, retur_same, retur_change_proposed, proposed_retur_uses_route_id, proposed_retur_disabled, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (!subs || subs.length === 0) return [];

  const subIds = subs.map((s: any) => s.id);
  const routeIds = [
    ...new Set(
      subs.flatMap((s: any) => [s.crm_route_id, s.proposed_retur_uses_route_id].filter((x: any) => x != null) as number[]),
    ),
  ];

  const [{ data: routes }, { data: changes }, { data: allRoutes }] = await Promise.all([
    supabase.from('crm_routes').select('id, dest_to_ro, time_chisinau, retur_uses_route_id, retur_disabled').in('id', routeIds.length ? routeIds : [-1]),
    supabase
      .from('route_check_stop_changes')
      .select('id, submission_id, stop_id, direction, old_time, new_time')
      .in('submission_id', subIds),
    supabase.from('crm_routes').select('id, dest_to_ro, retur_uses_route_id, retur_disabled').eq('active', true),
  ]);

  const stopIds = [...new Set((changes || []).map((c: any) => c.stop_id))];
  const { data: stops } = stopIds.length
    ? await supabase.from('crm_stop_fares').select('id, name_ro').in('id', stopIds)
    : { data: [] as any[] };

  const routeMap = new Map((routes || []).map((r: any) => [r.id, r]));
  const stopMap = new Map((stops || []).map((s: any) => [s.id, s.name_ro]));

  // Cine reclamă slot-ul fiecărei rute (în starea curentă)?
  const claimerByOwner = new Map<number, { id: number; name: string }>();
  for (const r of (allRoutes || []) as any[]) {
    if (r.retur_uses_route_id != null) {
      claimerByOwner.set(r.retur_uses_route_id, { id: r.id, name: r.dest_to_ro });
    }
  }
  // Sunt rute care își folosesc propriul slot:
  // Slot-ul rutei X este folosit de X însăși dacă: nimeni altcineva nu îl reclamă AND X.retur_disabled=false
  const ownerSelfUses = new Map<number, boolean>();
  for (const r of (allRoutes || []) as any[]) {
    const claimedByOther = claimerByOwner.has(r.id);
    ownerSelfUses.set(r.id, !claimedByOther && !r.retur_disabled && r.retur_uses_route_id == null);
  }

  const changesBySub = new Map<string, PendingChange[]>();
  for (const c of (changes || []) as any[]) {
    const arr = changesBySub.get(c.submission_id) || [];
    arr.push({
      id: c.id,
      stop_id: c.stop_id,
      stop_name: stopMap.get(c.stop_id) || `#${c.stop_id}`,
      direction: c.direction,
      old_time: c.old_time,
      new_time: c.new_time,
    });
    changesBySub.set(c.submission_id, arr);
  }

  return subs.map((s: any) => {
    const route = routeMap.get(s.crm_route_id);
    let retur_swap: ProposedReturSwap | null = null;
    if (s.retur_change_proposed) {
      const proposedSrc = s.proposed_retur_uses_route_id as number | null;
      let claimer: { id: number; name: string } | null = null;
      if (proposedSrc != null) {
        const ext = claimerByOwner.get(proposedSrc);
        if (ext) claimer = ext;
        else if (ownerSelfUses.get(proposedSrc)) {
          const r = routeMap.get(proposedSrc) as any;
          if (r) claimer = { id: r.id, name: r.dest_to_ro };
        }
      }
      const proposedRoute = proposedSrc != null ? (routeMap.get(proposedSrc) as any) : null;
      retur_swap = {
        proposed_retur_disabled: !!s.proposed_retur_disabled,
        proposed_retur_uses_route_id: proposedSrc,
        proposed_route_name: proposedRoute ? proposedRoute.dest_to_ro : null,
        proposed_time: proposedRoute ? proposedRoute.time_chisinau : null,
        current_claimer_route_id: claimer ? claimer.id : null,
        current_claimer_route_name: claimer ? claimer.name : null,
      };
    }

    return {
      id: s.id,
      crm_route_id: s.crm_route_id,
      route_name: (route as any)?.dest_to_ro || `Ruta ${s.crm_route_id}`,
      time_chisinau: (route as any)?.time_chisinau || null,
      retur_same: !!s.retur_same,
      retur_change_proposed: !!s.retur_change_proposed,
      retur_swap,
      created_at: s.created_at,
      changes: changesBySub.get(s.id) || [],
    };
  });
}

export async function approveSubmission(submissionId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') return { ok: false, error: 'Acces interzis.' };

  const supabase = getSupabase();
  const { data: sub } = await supabase
    .from('route_check_submissions')
    .select('id, status, crm_route_id, retur_change_proposed, proposed_retur_uses_route_id, proposed_retur_disabled')
    .eq('id', submissionId)
    .single();
  if (!sub) return { ok: false, error: 'Sesiune negăsită.' };
  if (sub.status !== 'pending') return { ok: false, error: 'Sesiunea nu este în așteptare.' };

  // 1) Aplicăm modificările de oră pe opriri
  const { data: changes } = await supabase
    .from('route_check_stop_changes')
    .select('stop_id, direction, new_time')
    .eq('submission_id', submissionId);

  for (const c of (changes || []) as any[]) {
    const field = c.direction === 'tur' ? 'hour_from_nord' : 'hour_from_chisinau';
    const { error: upErr } = await supabase
      .from('crm_stop_fares')
      .update({ [field]: c.new_time })
      .eq('id', c.stop_id);
    if (upErr) return { ok: false, error: `Eroare la oprire #${c.stop_id}: ${upErr.message}` };
  }

  // 2) Aplicăm swap-ul de retur, dacă a fost propus
  if (sub.retur_change_proposed) {
    const subjectRouteId = sub.crm_route_id as number;
    const proposedSrc = sub.proposed_retur_uses_route_id as number | null;
    const proposedDisabled = !!sub.proposed_retur_disabled;

    if (proposedDisabled) {
      // ruta A → fără retur; eliberează slot-ul propriu pentru alții
      const { error: e1 } = await supabase
        .from('crm_routes')
        .update({ retur_uses_route_id: null, retur_disabled: true })
        .eq('id', subjectRouteId);
      if (e1) return { ok: false, error: e1.message };
    } else if (proposedSrc != null) {
      // Cine în prezent folosește slot-ul proposedSrc?
      const { data: currentClaimer } = await supabase
        .from('crm_routes')
        .select('id')
        .eq('retur_uses_route_id', proposedSrc)
        .neq('id', subjectRouteId)
        .limit(1);

      // Dacă slot-ul este folosit de un alt Z (Z.retur_uses_route_id = proposedSrc), Z pierde retur.
      if (currentClaimer && currentClaimer.length > 0) {
        const zId = (currentClaimer[0] as any).id as number;
        const { error: ez } = await supabase
          .from('crm_routes')
          .update({ retur_uses_route_id: null, retur_disabled: true })
          .eq('id', zId);
        if (ez) return { ok: false, error: ez.message };
      } else {
        // Slot-ul este folosit „pe sine" de proposedSrc (default).
        // Dacă proposedSrc e diferit de subjectRouteId, proposedSrc pierde retur.
        if (proposedSrc !== subjectRouteId) {
          const { data: srcRow } = await supabase
            .from('crm_routes')
            .select('retur_disabled, retur_uses_route_id')
            .eq('id', proposedSrc)
            .single();
          const usesOwn = srcRow && !srcRow.retur_disabled && (srcRow.retur_uses_route_id == null);
          if (usesOwn) {
            const { error: edis } = await supabase
              .from('crm_routes')
              .update({ retur_disabled: true })
              .eq('id', proposedSrc);
            if (edis) return { ok: false, error: edis.message };
          }
        }
      }

      // Setăm subiectul: retur_uses_route_id = proposedSrc (sau null dacă e propriu)
      const newUsesId = proposedSrc === subjectRouteId ? null : proposedSrc;
      const { error: eA } = await supabase
        .from('crm_routes')
        .update({ retur_uses_route_id: newUsesId, retur_disabled: false })
        .eq('id', subjectRouteId);
      if (eA) return { ok: false, error: eA.message };
    }
  }

  // 3) Marcăm sesiunea aprobată
  const { error: subErr } = await supabase
    .from('route_check_submissions')
    .update({
      status: 'approved',
      decided_at: new Date().toISOString(),
      decided_by: session.id,
    })
    .eq('id', submissionId);
  if (subErr) return { ok: false, error: subErr.message };

  revalidatePath('/verificare-aprobari');
  revalidatePath('/verificare');
  return { ok: true };
}

export async function rejectSubmission(submissionId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') return { ok: false, error: 'Acces interzis.' };

  const supabase = getSupabase();
  const { error } = await supabase
    .from('route_check_submissions')
    .update({
      status: 'rejected',
      decided_at: new Date().toISOString(),
      decided_by: session.id,
      note: note || null,
    })
    .eq('id', submissionId)
    .eq('status', 'pending');
  if (error) return { ok: false, error: error.message };

  revalidatePath('/verificare-aprobari');
  return { ok: true };
}
