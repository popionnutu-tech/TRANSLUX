import 'server-only';
import { getSupabase } from './supabase';
import type { Autor } from './audit';

// Inventarierea prin scanare (migr. 351-354, 356-357). Ecranul vechi de numărare ține foaia în memoria
// paginii: închizi fila, pierzi numărătoarea. Aici starea stă în bază, fiindcă Eduard începe pe terminal și
// termină la calculator — „сохраняя инвентаризацию на терминале, повторно открывать можно в компьютере".

export type ScanLine = {
  part_id: number; name: string; article: string;
  location_label: string; counted: number; stoc_program: number; unit: string;
};
export type MissingLine = Omit<ScanLine, 'counted'>;
export type PartMatch = { id: number; name: string; article: string; unit: string; via: 'barcode' | 'article' };

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export async function openSession(warehouseId: number, autor: Autor): Promise<number> {
  return check(await getSupabase().rpc('piese_inv_session_open', {
    p_wh: warehouseId, p_admin: autor.adminId, p_actor: autor.label,
  })) as unknown as number;
}

// Proprietarul și depozitul unei sesiuni. Stă AICI, nu în fișierul de acțiuni: e singurul loc din modul
// unde un `actions.ts` interoga Supabase direct, iar celelalte unsprezece trec toate prin `lib/`.
export async function sessionOwner(sessionId: number): Promise<{ warehouseId: number; adminId: string | null }> {
  const data = check(await getSupabase().from('piese_inventory_sessions')
    .select('warehouse_id, admin_id').eq('id', sessionId).maybeSingle()) as
    { warehouse_id: number; admin_id: string | null } | null;
  if (!data) throw new Error('Numărătoarea nu există sau nu e a ta.');
  return { warehouseId: data.warehouse_id, adminId: data.admin_id };
}

// `qty` null = „încă una" (+1). O valoare = cantitate absolută, pentru corecția manuală.
export async function scan(sessionId: number, partId: number, location: string, qty: number | null) {
  return check(await getSupabase().rpc('piese_inv_scan', {
    p_session: sessionId, p_part: partId, p_location: location, p_qty: qty,
  })) as unknown as { part_id: number; qty: number; location: string };
}

export async function unscan(sessionId: number, partId: number): Promise<void> {
  check(await getSupabase().rpc('piese_inv_unscan', { p_session: sessionId, p_part: partId }));
}

export async function sessionLines(sessionId: number): Promise<ScanLine[]> {
  return (check(await getSupabase().rpc('piese_inv_lines', { p_session: sessionId })) as ScanLine[]) || [];
}

export async function sessionMissing(sessionId: number): Promise<MissingLine[]> {
  return (check(await getSupabase().rpc('piese_inv_missing', { p_session: sessionId })) as MissingLine[]) || [];
}

export async function commitSession(sessionId: number, zeroPartIds: number[], autor: Autor, force = false) {
  return check(await getSupabase().rpc('piese_inv_commit', {
    p_session: sessionId, p_extra: zeroPartIds, p_admin: autor.adminId, p_actor: autor.label, p_force: force,
  })) as unknown as {
    doc_id: number; diffs: number; adrese: number; pozitii: number; zerouri: number; miscate: number;
  };
}

export async function cancelSession(sessionId: number): Promise<void> {
  check(await getSupabase().rpc('piese_inv_cancel', { p_session: sessionId }));
}

// Piesele care corespund codului scanat, prin RPC (migr. 356).
//
// NU e o căutare: la numărare, un cod care nimerește „cea mai apropiată" piesă ar adăuga bucăți la
// articolul greșit, iar diferența ar ieși peste luni, ca lipsă inexplicabilă. Trei motive pentru care
// varianta din aplicație (`.ilike` + `.eq` + `.limit(1)`) nu era bună:
//   1. în `ilike`, `%` și `_` sunt jokeri, iar codul venea nefiltrat de la scaner — un cod cu `_` putea
//      potrivi codul altei piese de aceeași lungime;
//   2. `ilike` nu poate folosi `idx_ppbc_code_ci` (btree pe `lower(barcode)`), deci fiecare bip scana
//      toate cele ~9400 de coduri; acum e index scan;
//   3. `article_code` NU e unic — azi 161 de coduri sunt purtate de mai multe piese active — iar
//      `.limit(1)` fără ordonare alegea arbitrar între ele.
// De aceea funcția întoarce TOATE potrivirile: mai mult de una înseamnă „întreabă omul", nu „ghicește".
export async function partsByCode(code: string): Promise<PartMatch[]> {
  const c = (code || '').trim();
  if (!c) return [];
  return (check(await getSupabase().rpc('piese_part_by_code', { p_code: c })) as PartMatch[]) || [];
}
