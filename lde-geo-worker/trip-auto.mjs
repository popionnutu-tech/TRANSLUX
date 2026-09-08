// ============================================================================
// LDE camioane — stările automate ale cursei (Ion, 08.09.2026).
// «Dacă mașina s-a încărcat la Constanța, a ajuns în Moldova și stă, stă, stă —
// e «la descărcare». Dacă descarcă la o stație TLX, luăm din TLX când s-a
// descărcat și închidem cursa. Dacă descarcă în altă parte (baza Briceni),
// închide dispecerul.»
//
// Nucleul PUR: primește cursa, poziția live și recepțiile din TLX, întoarce ce
// trebuie scris pe cursă (sau null). Fără rețea, fără BD — testabil direct
// (trip-auto.test.mjs). I/O-ul stă în trip-live-worker.mjs.
//
// Regulile (oglindite în apps/admin/src/lib/lde/camioane.ts — dacă se schimbă
// aici, se schimbă și acolo):
//  · GPS → «la_descarcare»: din la_incarcare / asteapta_descarcare / spre_descarcare,
//    când camionul STĂ (sub 5,6 km/h, ca peste tot în worker) în raza punctului de
//    descărcare, cu o poziție proaspătă, și rămâne acolo ≥ 15 minute (două
//    observări). Prima observare se ține în unload_seen_at; ieșirea din rază o șterge.
//  · TLX → «incheiata»: din orice stare cu marfa în camion (și la_descarcare),
//    când în TLX apare o recepție cu numărul camionului, la stația care stă pe
//    punctul de descărcare al cursei, în fereastra cursei. O recepție închide o
//    singură cursă. Punct fără stație TLX (bază, depozit) → nimic: rămâne omul.
// ============================================================================
import { hav } from './km-core.mjs';

export const VITEZA_STA_KMH = 5.6;
/** Cât stă în rază până devine «la descărcare»: sub atât e o trecere, o coadă la semafor. */
export const CONFIRMARE_MIN = 15;
/** O poziție mai veche de atât nu spune unde e camionul ACUM — nu decide nimic. */
export const POZITIE_VECHE_MIN = 30;
/** Raza punctului, plafonată ca în trip-worker: dispecerul n-are voie să facă
 *  «descărcare» dintr-un cerc de 20 km și nici să coboare sub distanța dintre două ping-uri. */
export const RAZA_MIN_M = 200;
export const RAZA_MAX_M = 2000;
/** Stația TLX «stă pe» punctul de descărcare dacă e la cel mult atât (sau raza punctului). */
export const POTRIVIRE_STATIE_M = 300;
/** Recepția poate fi înregistrată cu întârziere; fereastra de acceptare după descărcarea planificată. */
export const FEREASTRA_DUPA_PLAN_ZILE = 3;
/** Camionul poate ajunge devreme la stație. */
export const FEREASTRA_INAINTE_INCARCARE_MS = 3600e3;

export const STARI_GPS_LA_DESCARCARE = ['la_incarcare', 'asteapta_descarcare', 'spre_descarcare'];
export const STARI_TLX_INCHEIATA = [...STARI_GPS_LA_DESCARCARE, 'la_descarcare'];

export const normPlaca = (p) => (p || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

export function razaEfectiva(radiusM) {
  // Number(null) e 0, nu NaN — fără verificarea explicită punctul fără rază
  // primea 200 m în loc de cei 500 impliciți din bază.
  const r = radiusM == null ? 500 : Number(radiusM);
  return Math.min(RAZA_MAX_M, Math.max(RAZA_MIN_M, Number.isFinite(r) ? r : 500));
}

const areCoordonate = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon));
const distM = (a, b) => hav({ lat: Number(a.lat), lon: Number(a.lon) }, { lat: Number(b.lat), lon: Number(b.lon) }) * 1000;

/**
 * Decizia GPS pentru o cursă.
 * @param cursa { status, unload_seen_at, unloadPoint: { lat, lon, radius_m } | null }
 * @param pozitie { lat, lon, speed (km/h), at (ISO) } | null
 * @param acumMs
 * @returns null (nimic de scris) | { unload_seen_at } | { status:'la_descarcare', ... }
 */
export function deciziaGps(cursa, pozitie, acumMs = Date.now()) {
  if (!STARI_GPS_LA_DESCARCARE.includes(cursa.status)) return null;
  if (!areCoordonate(cursa.unloadPoint)) return null;
  if (!pozitie) return null;
  const t = Date.parse(pozitie.at);
  if (!Number.isFinite(t)) return null;
  // Poziție veche sau din viitor (ceas stricat): nu știm unde e camionul acum.
  const varsta = acumMs - t;
  if (varsta < 0 || varsta > POZITIE_VECHE_MIN * 60e3) return null;

  const inRaza = distM(pozitie, cursa.unloadPoint) <= razaEfectiva(cursa.unloadPoint.radius_m);
  const sta = Number(pozitie.speed ?? 0) < VITEZA_STA_KMH;

  if (!inRaza || !sta) {
    // A plecat sau se mișcă: prima observare nu mai e valabilă.
    return cursa.unload_seen_at ? { unload_seen_at: null } : null;
  }
  const primaVedere = cursa.unload_seen_at ? Date.parse(cursa.unload_seen_at) : NaN;
  if (!Number.isFinite(primaVedere) || primaVedere > t) {
    return { unload_seen_at: new Date(t).toISOString() };
  }
  if (t - primaVedere < CONFIRMARE_MIN * 60e3) return null;
  return {
    status: 'la_descarcare',
    status_source: 'gps',
    status_changed_at: new Date(acumMs).toISOString(),
    updated_at: new Date(acumMs).toISOString(),
    updated_by: 'auto:gps',
  };
}

/** Stația TLX care stă pe punctul de descărcare (cea mai apropiată, în toleranță) sau null. */
export function statiaPunctului(punct, statii) {
  if (!areCoordonate(punct)) return null;
  const toleranta = Math.max(POTRIVIRE_STATIE_M, razaEfectiva(punct.radius_m));
  let best = null;
  for (const s of statii || []) {
    if (!areCoordonate(s)) continue;
    const d = distM(punct, s);
    if (d <= toleranta && (!best || d < best.d)) best = { s, d };
  }
  return best ? best.s : null;
}

/** Momentul descărcării din recepție: unloaded_at (dacă e), altfel când a fost scrisă. */
export function momentulReceptiei(r) {
  const t = Date.parse(r.unloaded_at || r.created_at || '');
  return Number.isFinite(t) ? t : null;
}

/**
 * Decizia TLX pentru o cursă.
 * @param cursa { id, status, plate, load_planned_at, unload_planned_at, unloadPoint }
 * @param receptii [{ id, station_id, nr_auto, volume, unloaded_at, created_at, is_deleted }]
 * @param statii [{ id, lat, lon }]  (stations din TLX, lng→lon făcut de apelant)
 * @param folosite Set de fuel_receipts.id deja legate de alte curse
 * @returns null | { status:'incheiata', status_source:'tlx', tlx_receipt_id, tlx_receipt_at, tlx_receipt_liters, ... }
 */
export function deciziaTlx(cursa, receptii, statii, folosite = new Set(), acumMs = Date.now()) {
  if (!STARI_TLX_INCHEIATA.includes(cursa.status)) return null;
  const statie = statiaPunctului(cursa.unloadPoint, statii);
  if (!statie) return null; // descarcă în altă parte decât la o stație TLX — rămâne dispecerul
  const placa = normPlaca(cursa.plate);
  if (!placa) return null;
  const deLa = Date.parse(cursa.load_planned_at) - FEREASTRA_INAINTE_INCARCARE_MS;
  const panaLa = Date.parse(cursa.unload_planned_at) + FEREASTRA_DUPA_PLAN_ZILE * 86400e3;
  if (!Number.isFinite(deLa) || !Number.isFinite(panaLa)) return null;

  let aleasa = null;
  let aleasaT = Infinity;
  for (const r of receptii || []) {
    if (r.is_deleted) continue;
    if (folosite.has(r.id)) continue;
    if (r.station_id !== statie.id) continue;
    if (normPlaca(r.nr_auto) !== placa) continue;
    const t = momentulReceptiei(r);
    if (t === null || t < deLa || t > panaLa) continue;
    if (t < aleasaT) { aleasa = r; aleasaT = t; }
  }
  if (!aleasa) return null;
  const acum = new Date(acumMs).toISOString();
  return {
    status: 'incheiata',
    status_source: 'tlx',
    status_changed_at: acum,
    updated_at: acum,
    updated_by: 'auto:tlx',
    tlx_receipt_id: aleasa.id,
    tlx_receipt_at: new Date(aleasaT).toISOString(),
    tlx_receipt_liters: aleasa.volume == null ? null : Number(aleasa.volume),
  };
}
