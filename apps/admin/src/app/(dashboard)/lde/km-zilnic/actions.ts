'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type KmZiRow = {
  vehicle_id: string;
  plate_number: string;
  km_total: number;
  km_patched: number;
  km_check: number | null;
  gps_points: number | null;
  suspect: boolean;
  suspect_reason: string | null;
};

export type KmZiDirectie = {
  directie: string;
  km_total: number;
  masini: number;
  suspecte: number;
  rows: KmZiRow[];
};

export type KmZilnic = {
  date: string;
  km_flota: number;
  masini_total: number;
  suspecte_total: number;
  directii: KmZiDirectie[];
};

type GpsJoinRow = {
  vehicle_id: string;
  km_total: number | null;
  km_patched: number | null;
  km_check: number | null;
  gps_points: number | null;
  suspect: boolean | null;
  suspect_reason: string | null;
  vehicles: { plate_number: string; directions: string[] | null } | null;
};

/** Km zilnic per direcție/mașină (default = ieri), cu zilele suspecte marcate de worker. */
export async function getKmZilnic(date?: string): Promise<KmZilnic> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const day = date ?? yesterdayIso();

  const { data, error } = await sb
    .from('lde_vehicle_gps_daily')
    .select(
      'vehicle_id, km_total, km_patched, km_check, gps_points, suspect, suspect_reason, vehicles ( plate_number, directions )'
    )
    .eq('date', day);

  if (error) {
    return { date: day, km_flota: 0, masini_total: 0, suspecte_total: 0, directii: [] };
  }

  const byDir = new Map<string, KmZiDirectie>();
  let kmFlota = 0;
  let suspecteTotal = 0;

  for (const raw of (data ?? []) as unknown as GpsJoinRow[]) {
    const row: KmZiRow = {
      vehicle_id: raw.vehicle_id,
      plate_number: raw.vehicles?.plate_number ?? '?',
      km_total: Number(raw.km_total ?? 0),
      km_patched: Number(raw.km_patched ?? 0),
      km_check: raw.km_check == null ? null : Number(raw.km_check),
      gps_points: raw.gps_points,
      suspect: raw.suspect === true,
      suspect_reason: raw.suspect_reason,
    };
    const directie = raw.vehicles?.directions?.[0] ?? 'Fără direcție';
    if (!byDir.has(directie)) {
      byDir.set(directie, { directie, km_total: 0, masini: 0, suspecte: 0, rows: [] });
    }
    const g = byDir.get(directie)!;
    g.rows.push(row);
    g.km_total += row.km_total;
    g.masini += 1;
    if (row.suspect) g.suspecte += 1;
    kmFlota += row.km_total;
    if (row.suspect) suspecteTotal += 1;
  }

  const directii = [...byDir.values()].sort((a, b) => b.km_total - a.km_total);
  for (const g of directii) {
    g.rows.sort((a, b) => (a.suspect === b.suspect ? b.km_total - a.km_total : a.suspect ? -1 : 1));
    g.km_total = Math.round(g.km_total);
  }

  return {
    date: day,
    km_flota: Math.round(kmFlota),
    masini_total: (data ?? []).length,
    suspecte_total: suspecteTotal,
    directii,
  };
}
