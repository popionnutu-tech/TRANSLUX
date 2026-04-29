'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';

export interface RouteListItem {
  id: number;
  dest_to_ro: string;
  dest_from_ro: string;
  time_chisinau: string | null;
  time_nord: string | null;
  pending_count: number;
  last_status: 'approved' | 'rejected' | null;
}

export async function getInterurbanRoutes(): Promise<RouteListItem[]> {
  const supabase = getSupabase();

  const { data: routes } = await supabase
    .from('crm_routes')
    .select('id, dest_to_ro, dest_from_ro, time_chisinau, time_nord')
    .eq('active', true)
    .eq('route_type', 'interurban')
    .order('id');

  if (!routes) return [];
  const ids = routes.map((r: any) => r.id);

  const { data: subs } = await supabase
    .from('route_check_submissions')
    .select('crm_route_id, status, decided_at, created_at')
    .in('crm_route_id', ids)
    .order('created_at', { ascending: false });

  const pendingCount = new Map<number, number>();
  const lastDecided = new Map<number, { at: string; status: 'approved' | 'rejected' }>();
  for (const s of (subs || []) as any[]) {
    if (s.status === 'pending') {
      pendingCount.set(s.crm_route_id, (pendingCount.get(s.crm_route_id) || 0) + 1);
    } else if ((s.status === 'approved' || s.status === 'rejected') && !lastDecided.has(s.crm_route_id)) {
      lastDecided.set(s.crm_route_id, { at: s.decided_at || s.created_at, status: s.status });
    }
  }

  return routes.map((r: any) => ({
    id: r.id,
    dest_to_ro: r.dest_to_ro,
    dest_from_ro: r.dest_from_ro,
    time_chisinau: r.time_chisinau,
    time_nord: r.time_nord,
    pending_count: pendingCount.get(r.id) || 0,
    last_status: lastDecided.get(r.id)?.status || null,
  }));
}

export interface StopRow {
  id: number;
  name_ro: string;
  hour_from_chisinau: string | null;
  hour_from_nord: string | null;
}

export interface ReturOption {
  /**
   * id-ul rutei al cărei slot de retur îl reprezintă această opțiune (sursa).
   * Ruta A care „ia retur-ul B" va avea retur_uses_route_id = id-ul lui B.
   */
  source_route_id: number;
  source_route_name: string;
  time_chisinau: string | null;
  /**
   * id-ul rutei care folosește în prezent acest slot:
   * - id-ul propriu (sursa) dacă slot-ul este folosit „pe sine" și nu e dezactivat
   * - id-ul altei rute, dacă altcineva l-a luat
   * - null dacă slot-ul este liber
   */
  current_user_route_id: number | null;
  current_user_route_name: string | null;
}

export interface RouteDetail {
  id: number;
  dest_to_ro: string;
  dest_from_ro: string;
  time_chisinau: string | null;
  time_nord: string | null;
  /** id-ul rutei al cărei slot de retur este folosit acum (id-ul propriu = retur propriu) */
  effective_retur_route_id: number | null;
  retur_disabled: boolean;
  stops_tur: StopRow[];
  /** map: route_id → opririle acelei rute (sortate ASC pentru retur dacă DESC). */
  retur_stops_by_route: Record<number, StopRow[]>;
  /** toate slot-urile de retur disponibile, pentru picker */
  retur_options: ReturOption[];
}

export async function getRouteDetail(routeId: number): Promise<RouteDetail | null> {
  const supabase = getSupabase();
  const { data: route } = await supabase
    .from('crm_routes')
    .select('id, dest_to_ro, dest_from_ro, time_chisinau, time_nord, active, retur_uses_route_id, retur_disabled')
    .eq('id', routeId)
    .single();
  if (!route || !route.active) return null;

  // Toate rutele interurbane active — pentru picker.
  const { data: allRoutes } = await supabase
    .from('crm_routes')
    .select('id, dest_to_ro, time_chisinau, retur_uses_route_id, retur_disabled')
    .eq('active', true)
    .eq('route_type', 'interurban')
    .order('id');

  const allList = (allRoutes || []) as any[];

  // Cine folosește slot-ul rutei X? — verificăm dacă există o altă rută care îl reclamă.
  const claimerByOwnerId = new Map<number, { id: number; name: string }>();
  for (const r of allList) {
    if (r.retur_uses_route_id != null) {
      const owner = r.retur_uses_route_id as number;
      claimerByOwnerId.set(owner, { id: r.id, name: r.dest_to_ro });
    }
  }

  const retur_options: ReturOption[] = allList.map((r: any) => {
    const ownClaimer = claimerByOwnerId.get(r.id);
    let current_user_route_id: number | null = null;
    let current_user_route_name: string | null = null;
    if (ownClaimer) {
      current_user_route_id = ownClaimer.id;
      current_user_route_name = ownClaimer.name;
    } else if (!r.retur_disabled && r.retur_uses_route_id == null) {
      current_user_route_id = r.id;
      current_user_route_name = r.dest_to_ro;
    } else {
      current_user_route_id = null;
      current_user_route_name = null;
    }
    return {
      source_route_id: r.id,
      source_route_name: r.dest_to_ro,
      time_chisinau: r.time_chisinau,
      current_user_route_id,
      current_user_route_name,
    };
  });

  // Slot-ul efectiv de retur al rutei A:
  //  - dacă A.retur_disabled → nu are retur
  //  - altfel, sursa = A.retur_uses_route_id sau A.id
  const effective_retur_route_id =
    route.retur_disabled
      ? null
      : (route.retur_uses_route_id != null ? route.retur_uses_route_id : route.id);

  // Aducem opririle pentru tur (proprii) + opririle pentru toate slot-urile de retur
  // posibile (toate cele 28 de rute), ca operatorul să poată comuta între ele
  // fără request suplimentar.
  const allRouteIds = allList.map((r: any) => r.id);
  const stopRouteIds = Array.from(new Set([route.id, ...allRouteIds]));

  const { data: stops } = await supabase
    .from('crm_stop_fares')
    .select('id, crm_route_id, name_ro, hour_from_chisinau, hour_from_nord')
    .in('crm_route_id', stopRouteIds);

  const allStops = ((stops || []) as any[]);
  const stops_tur = allStops
    .filter((s) => s.crm_route_id === route.id)
    .sort((a, b) => a.id - b.id);

  const retur_stops_by_route: Record<number, StopRow[]> = {};
  for (const rid of allRouteIds) {
    retur_stops_by_route[rid] = allStops
      .filter((s) => s.crm_route_id === rid)
      .sort((a, b) => b.id - a.id);
  }

  return {
    id: route.id,
    dest_to_ro: route.dest_to_ro,
    dest_from_ro: route.dest_from_ro,
    time_chisinau: route.time_chisinau,
    time_nord: route.time_nord,
    effective_retur_route_id,
    retur_disabled: !!route.retur_disabled,
    stops_tur,
    retur_stops_by_route,
    retur_options,
  };
}

export interface SubmittedChange {
  stop_id: number;
  direction: 'tur' | 'retur';
  old_time: string | null;
  new_time: string;
}

export async function submitRouteCheck(input: {
  route_id: number;
  retur_same: boolean;
  changes: SubmittedChange[];
  /** id-ul rutei al cărei slot de retur este propus (NULL = „fără retur") */
  proposed_retur_uses_route_id?: number | null;
  /** Operatorul a propus o schimbare la sursa retur-ului */
  retur_change_proposed?: boolean;
  note?: string;
}): Promise<void> {
  const supabase = getSupabase();

  const validChanges = (input.changes || []).filter(
    (c) => c && c.new_time && c.new_time !== c.old_time
  );

  const proposed_retur_disabled =
    input.retur_change_proposed && input.proposed_retur_uses_route_id == null;

  const { data: sub, error: subErr } = await supabase
    .from('route_check_submissions')
    .insert({
      crm_route_id: input.route_id,
      retur_same: input.retur_same,
      status: 'pending',
      note: input.note || null,
      retur_change_proposed: !!input.retur_change_proposed,
      proposed_retur_uses_route_id: input.retur_change_proposed
        ? (input.proposed_retur_uses_route_id ?? null)
        : null,
      proposed_retur_disabled: input.retur_change_proposed ? proposed_retur_disabled : null,
    })
    .select('id')
    .single();
  if (subErr || !sub) throw new Error(subErr?.message || 'Nu s-a putut salva sesiunea.');

  if (validChanges.length > 0) {
    const rows = validChanges.map((c) => ({
      submission_id: sub.id,
      stop_id: c.stop_id,
      direction: c.direction,
      old_time: c.old_time,
      new_time: c.new_time,
    }));
    const { error: chErr } = await supabase.from('route_check_stop_changes').insert(rows);
    if (chErr) throw new Error(chErr.message);
  }

  revalidatePath('/verificare');
  revalidatePath('/verificare-aprobari');
  redirect('/verificare/multumim');
}
