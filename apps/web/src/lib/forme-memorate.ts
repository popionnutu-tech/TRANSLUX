// Liniile rutelor pe hartă, ținute și pe telefon (ION-277, «Telegram ultrafast» P9): cheia e «id:amprentă» (vine de la
// /acum, ION-206), deci o linie schimbată are altă cheie — nu se arată niciodată o linie veche. Câte cel mult MAX_FORME,
// cele mai noi; fără ele harta merge oricum (le cere de la /forme). Pur, testat (stocarea se injectează).

export const CHEIE_FORME = 'translux_forme_v1';
export const MAX_FORME = 40;

type LatLon = [number, number];
export interface Stocare { get(k: string): string | null; set(k: string, v: string): void }

/** Liniile memorate, validate (perechi de numere); orice gunoi → gol. */
export function citesteForme(st: Stocare): Map<string, LatLon[]> {
  try {
    const o = JSON.parse(st.get(CHEIE_FORME) ?? '{}') as Record<string, unknown>;
    const out = new Map<string, LatLon[]>();
    for (const [k, v] of Object.entries(o)) {
      if (!/^\d+:[\w-]+$/.test(k) || !Array.isArray(v)) continue;
      if (v.every((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number')) out.set(k, v as LatLon[]);
    }
    return out;
  } catch { return new Map(); }
}

/** Scrie ultimele MAX_FORME linii (ordinea de inserare a Map-ului = cele mai noi la coadă). */
export function scrieForme(st: Stocare, forme: Map<string, LatLon[]>): void {
  try {
    const ultime = [...forme.entries()].slice(-MAX_FORME);
    st.set(CHEIE_FORME, JSON.stringify(Object.fromEntries(ultime)));
  } catch { /* plin / privat */ }
}
