// Nomenclatorul rutelor pentru mini app-ul șoferului (ION-273, «Telegram ultrafast» P4): rute, opriri și coordonate ținute în
// memoria instanței PE RUTĂ, cu TTL. Pe rută, nu tot nomenclatorul: `crm_stop_fares` are peste 1 000 de rânduri, iar PostgREST
// dă cel mult 1 000 pe cerere (memoria `supabase-max-rows-1000`) — o încărcare «totală» ar pierde opriri fără nicio eroare.
// Pur (încărcătorul și ceasul se injectează), testat în sofer-nomenclator.test.ts.

export interface RutaRand { id: number; dest_from_ro: string; dest_to_ro: string; time_nord: string | null; time_chisinau: string | null }
export interface OprireRand { crm_route_id: number; stop_order: number; name_ro: string | null; hour_from_nord: string | null; hour_from_chisinau: string | null }
export interface NomenclatorRuta { ruta: RutaRand | null; opriri: OprireRand[]; coord: Map<number, { lat: number; lon: number }> }

export type IncarcaNomenclator = (ids: number[]) => Promise<Map<number, NomenclatorRuta>>;

export const NOMENCLATOR_TTL_MS = 10 * 60_000;

export function nomenclatorGol(): NomenclatorRuta {
  return { ruta: null, opriri: [], coord: new Map() };
}

export function creeazaCacheNomenclator(incarca: IncarcaNomenclator, ttlMs = NOMENCLATOR_TTL_MS, acum: () => number = () => Date.now()) {
  const cache = new Map<number, { la: number; n: NomenclatorRuta }>();
  return {
    /** Nomenclatorul rutelor cerute; se încarcă DOAR rutele lipsă sau expirate, într-o singură cerere `in(ids)`. */
    async pentru(ids: number[]): Promise<Map<number, NomenclatorRuta>> {
      const unice = [...new Set(ids)];
      const t = acum();
      const lipsa = unice.filter((id) => { const c = cache.get(id); return !c || t - c.la > ttlMs; });
      if (lipsa.length) {
        const noi = await incarca(lipsa);
        for (const id of lipsa) cache.set(id, { la: t, n: noi.get(id) ?? nomenclatorGol() });
      }
      return new Map(unice.map((id) => [id, cache.get(id)?.n ?? nomenclatorGol()]));
    },
    goleste() { cache.clear(); },
    marime() { return cache.size; },
  };
}
