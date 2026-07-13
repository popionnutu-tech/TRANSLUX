'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { getDirectionOptions } from '@/lib/directions';
import { listZi, chisinauToday, allDirections } from '@/lib/atribuiri/core';

// Admin: (a) editor manager↔direcții (users.role=MANAGER_LDE + lde_manager_directions);
// (b) matricea de status per zi a atribuirilor (citește lde_atribuiri_zilnice).

export interface ManagerRow {
  id: string;
  label: string;
  telegram_id: number | null;
  active: boolean;
  directions: string[];
}

export interface MatrixRow {
  direction: string;
  label: string;
  total: number;
  fara_masina: number;
  confirmate: number;
  nepotriviri: number;
  fara_gps: number;
  modificate: number;
}

export interface AtribuiriAdminData {
  date: string;
  manageri: ManagerRow[];
  optiuni: Array<{ value: string; label: string }>;
  matrix: MatrixRow[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getAtribuiriAdmin(date?: string): Promise<AtribuiriAdminData> {
  requireRole(await verifySession(), 'ADMIN');
  const db = getSupabase();
  const day = date && DATE_RE.test(date) ? date : chisinauToday();

  const [{ data: users }, { data: mds }, optiuni, rows, dirLabels] = await Promise.all([
    db.from('users').select('id, name, username, telegram_id, active').eq('role', 'MANAGER_LDE').order('name'),
    db.from('lde_manager_directions').select('user_id, direction'),
    getDirectionOptions(),
    listZi(day, null),
    allDirections(),
  ]);

  const dirsByUser = new Map<string, string[]>();
  for (const m of mds ?? []) {
    dirsByUser.set(m.user_id as string, [...(dirsByUser.get(m.user_id as string) ?? []), m.direction as string]);
  }
  const manageri: ManagerRow[] = (users ?? []).map((u) => ({
    id: u.id as string,
    label: (u.name as string) || (u.username as string) || 'fără nume',
    telegram_id: u.telegram_id as number | null,
    active: !!u.active,
    directions: dirsByUser.get(u.id as string) ?? [],
  }));

  const labelOf = new Map(dirLabels.map((d) => [d.id, d.label]));
  const byDir = new Map<string, MatrixRow>();
  for (const r of rows) {
    const m = byDir.get(r.direction) ?? {
      direction: r.direction, label: labelOf.get(r.direction) ?? r.direction,
      total: 0, fara_masina: 0, confirmate: 0, nepotriviri: 0, fara_gps: 0, modificate: 0,
    };
    m.total++;
    if (!r.vehicle_id) m.fara_masina++;
    if (r.status === 'confirmat_auto' || r.status === 'confirmat_manual') m.confirmate++;
    if (r.status === 'nepotrivire') m.nepotriviri++;
    if (r.status === 'fara_date_gps') m.fara_gps++;
    if (r.status === 'modificat_proactiv' || r.status === 'modificat_reactiv') m.modificate++;
    byDir.set(r.direction, m);
  }

  return { date: day, manageri, optiuni, matrix: [...byDir.values()].sort((a, b) => a.label.localeCompare(b.label)) };
}

export async function saveManagerDirections(userId: string, directions: string[]): Promise<void> {
  requireRole(await verifySession(), 'ADMIN');
  const db = getSupabase();

  // doar userii cu rol MANAGER_LDE pot primi direcții
  const { data: target } = await db.from('users').select('role').eq('id', userId).maybeSingle();
  if (target?.role !== 'MANAGER_LDE') throw new Error('Utilizatorul nu are rolul MANAGER_LDE');

  // validare pe vocabularul real (uzine active + interurban/suburban)
  const valid = new Set((await allDirections()).map((d) => d.id));
  const clean = [...new Set(directions)].filter((d) => valid.has(d));

  const { error: delErr } = await db.from('lde_manager_directions').delete().eq('user_id', userId);
  if (delErr) throw new Error(delErr.message);
  if (clean.length) {
    const { error } = await db.from('lde_manager_directions')
      .insert(clean.map((direction) => ({ user_id: userId, direction })));
    if (error) throw new Error(error.message);
  }
}
