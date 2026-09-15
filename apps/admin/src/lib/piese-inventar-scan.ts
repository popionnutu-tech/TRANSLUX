import { getSupabase } from './supabase';
import type { Autor } from './audit';

// Inventarierea prin scanare (migr. 351-353). Ecranul vechi de numărare ține foaia în memoria paginii:
// închizi fila, pierzi numărătoarea. Aici starea stă în bază, fiindcă Eduard începe pe terminal și termină
// la calculator — „сохраняя инвентаризацию на терминале, повторно открывать можно в компьютере".

export type ScanLine = {
  part_id: number; name: string; article: string;
  location_label: string; counted: number; stoc_program: number; unit: string;
};
export type MissingLine = Omit<ScanLine, 'counted'>;

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export async function openSession(warehouseId: number, autor: Autor): Promise<number> {
  return check(await getSupabase().rpc('piese_inv_session_open', {
    p_wh: warehouseId, p_admin: autor.adminId, p_actor: autor.label,
  })) as unknown as number;
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

export async function commitSession(sessionId: number, zeroPartIds: number[], autor: Autor) {
  return check(await getSupabase().rpc('piese_inv_commit', {
    p_session: sessionId, p_extra: zeroPartIds, p_admin: autor.adminId, p_actor: autor.label,
  })) as unknown as { doc_id: number; diffs: number; adrese: number; pozitii: number; zerouri: number };
}

export async function cancelSession(sessionId: number): Promise<void> {
  check(await getSupabase().rpc('piese_inv_cancel', { p_session: sessionId }));
}

// Piesa după codul scanat. Spre deosebire de `locatePart` (ecranul „unde stă piesa"), aici NU există
// potrivire aproximativă: la numărare, un cod necunoscut care nimerește „cea mai apropiată" piesă ar
// adăuga bucăți la articolul greșit, iar diferența ar apărea abia peste luni, ca furt. Exact sau nimic.
export async function partByCode(code: string) {
  const c = code.trim();
  if (!c) return null;
  const sb = getSupabase();
  const hit = check(await sb.from('piese_part_barcodes').select('part_id').ilike('barcode', c).limit(1).maybeSingle());
  let id = hit ? (hit as { part_id: number }).part_id : null;
  if (id == null) {
    // Codul de articol e a doua cheie exactă: multe piese vechi n-au primit niciodată cod de bare, iar
    // omul le tastează articolul de pe eticheta de raft.
    const byArt = check(await sb.from('piese_catalog_rows').select('id').eq('article_code', c).limit(1).maybeSingle());
    id = byArt ? (byArt as { id: number }).id : null;
  }
  if (id == null) return null;
  const p = check(await sb.from('piese_catalog_rows')
    .select('id, name_long, name_ro, article_code, unit, active').eq('id', id).maybeSingle()) as
    { id: number; name_long: string; name_ro: string | null; article_code: string | null; unit: string | null; active: boolean } | null;
  if (!p || !p.active) return null;
  return {
    id: p.id,
    name: (p.name_ro && p.name_ro.trim()) || p.name_long,
    article: p.article_code || '',
    unit: p.unit || 'buc',
  };
}
