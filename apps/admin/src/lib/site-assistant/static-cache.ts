// Datele STATICE ale hărții «Acum» (ION-206). Ion, 03.10 («site ultrafast», punctul 6): linia rutei
// (route_shapes, migr. 392) și orele opririlor (crm_stop_fares) nu se schimbă de la un minut la altul,
// dar /acum le citea din bază la fiecare cerere — și la fiecare poll de 60 s al fiecărui client.
// Aici stau în Data Cache-ul Vercel (unstable_cache, 1 h), comun tuturor instanțelor: și instanța
// rece le primește gata. Cheia e lista de rute, sortată, ca aceeași direcție să lovească același rând.

import { unstable_cache } from 'next/cache';
import { createHash } from 'crypto';
import { getSupabase } from '@/lib/supabase';

export type LatLon = [number, number];
export interface ShapeStop { name: string; lat: number; lon: number; stop_order: number }
export interface ShapeRow {
  crm_route_id: number;
  shape: LatLon[];
  stops: ShapeStop[];
  /** Amprenta liniei: clientul cere /forme pe «id:v», răspunsul e immutable; linia refăcută = altă amprentă. */
  v: string;
}
export interface HourRow { crm_route_id: number; stop_order: number; hour_from_chisinau: string | null; hour_from_nord: string | null }

const TTL_S = 3600;
const norm = (ids: number[]) => [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);

export function shapeVersion(shape: unknown): string {
  return createHash('md5').update(JSON.stringify(shape)).digest('hex').slice(0, 10);
}

const loadShapes = unstable_cache(async (ids: number[]): Promise<ShapeRow[]> => {
  if (!ids.length) return [];
  const { data, error } = await getSupabase().from('route_shapes').select('crm_route_id, shape, stops').in('crm_route_id', ids);
  // Eroarea nu se pune în cache: aruncată, unstable_cache nu reține nimic.
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({
    crm_route_id: s.crm_route_id as number,
    shape: s.shape as LatLon[],
    stops: (s.stops ?? []) as ShapeStop[],
    v: shapeVersion(s.shape),
  }));
}, ['site-route-shapes'], { revalidate: TTL_S, tags: ['site-route-shapes'] });

const loadHours = unstable_cache(async (ids: number[]): Promise<HourRow[]> => {
  const out: HourRow[] = [];
  if (!ids.length) return out;
  // PostgREST dă cel mult 1000 de rânduri pe cerere (memoria «Supabase max rows 1000»): pe pagini —
  // cursele unei zile pe o direcție trec prin zeci de rute × ~41 de opriri (24.09, ruta 28 fără fereastră).
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase()
      .from('crm_stop_fares')
      .select('crm_route_id, stop_order, hour_from_chisinau, hour_from_nord')
      .in('crm_route_id', ids)
      .order('crm_route_id').order('stop_order')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as HourRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}, ['site-stop-hours'], { revalidate: TTL_S, tags: ['site-stop-hours'] });

/** Linia și opririle rutelor cerute, din cache (1 h). */
export const routeShapes = (ids: number[]): Promise<ShapeRow[]> => loadShapes(norm(ids));
/** Orele opririlor rutelor cerute (ambele sensuri), din cache (1 h). */
export const stopHours = (ids: number[]): Promise<HourRow[]> => loadHours(norm(ids));
