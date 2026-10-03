import 'server-only';
import { getSupabase } from '@/lib/supabase';
import type { PunctRand } from './puncte-reguli';

// Punctele de urcare active (ION-198): tot tabelul în memorie, o citire la 5 min pe instanță (are ~120 de rânduri).
// Site-ul cere de pe server, deci fără plafon pe IP (ar fi IP-ul Vercel, comun cu pagina biletului); o localitate
// necunoscută se rezolvă din memorie, fără drum la bază.

const TTL_MS = 5 * 60_000;
let cache: { la: number; rows: PunctRand[] } | null = null;
let inZbor: Promise<PunctRand[]> | null = null;

async function citeste(): Promise<PunctRand[]> {
  const db = getSupabase();
  const { data: p, error: e1 } = await db.from('interurban_puncte_urcare').select('id, localitate, nume_ro, nume_ru, lat, lon, rang').eq('activ', true);
  if (e1) throw new Error(`interurban_puncte_urcare: ${e1.message}`);
  const ids = (p || []).map((r: { id: number }) => r.id);
  const perechi = new Map<number, Array<[number, boolean]>>();
  if (ids.length) {
    const { data: q, error: e2 } = await db.from('interurban_puncte_urcare_rute').select('punct_id, crm_route_id, going_north').in('punct_id', ids);
    if (e2) throw new Error(`interurban_puncte_urcare_rute: ${e2.message}`);
    for (const r of (q || []) as Array<{ punct_id: number; crm_route_id: number; going_north: boolean }>) {
      if (!perechi.has(r.punct_id)) perechi.set(r.punct_id, []);
      perechi.get(r.punct_id)!.push([r.crm_route_id, r.going_north]);
    }
  }
  return (p || []).map((r: { id: number; localitate: string; nume_ro: string; nume_ru: string; lat: number | string; lon: number | string; rang: number }) => ({
    id: r.id, localitate: r.localitate, nume_ro: r.nume_ro, nume_ru: r.nume_ru, lat: Number(r.lat), lon: Number(r.lon), rang: r.rang,
    perechi: perechi.get(r.id) || [],
  }));
}

/** Toate punctele active (din memorie, reîmprospătate la 5 min). */
export async function puncteActive(): Promise<PunctRand[]> {
  if (cache && Date.now() - cache.la < TTL_MS) return cache.rows;
  if (!inZbor) inZbor = citeste().then((rows) => { cache = { la: Date.now(), rows }; return rows; }).finally(() => { inZbor = null; });
  return inZbor;
}

/** Localitatea unui punct după id, și dintre cele inactive; null = nu există. */
export async function localitateaPunctului(id: number): Promise<string | null> {
  const { data, error } = await getSupabase().from('interurban_puncte_urcare').select('localitate').eq('id', id).maybeSingle();
  if (error) throw new Error(`interurban_puncte_urcare: ${error.message}`);
  return data?.localitate ?? null;
}
