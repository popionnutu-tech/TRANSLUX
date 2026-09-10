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

/** Țara punctului e Moldova? (Ion, 08.09: «închiderea automată e posibilă doar
 *  în Moldova; de fapt descărcarea de diesel se închide doar în Moldova».)
 *  Se acceptă «Moldova», «Republica Moldova», «MD», cu sau fără diacritice. */
export function inMoldova(punct) {
  const tara = String(punct?.country ?? '').trim().toLowerCase();
  return tara === 'md' || tara.includes('moldova');
}

/** Marfa e diesel (nu biodiesel, nu cereale)? Codurile vin din formularul cursei. */
export const esteDiesel = (cargo) => String(cargo ?? '').trim().toLowerCase() === 'diesel';

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
 * @param cursa { status, cargo, unload_seen_at, unloadPoint: { lat, lon, radius_m, country } | null }
 * @param pozitie { lat, lon, speed (km/h), at (ISO) } | null
 * @param acumMs
 * @returns null (nimic de scris) | { unload_seen_at } | { status:'la_descarcare', ... }
 */
export function deciziaGps(cursa, pozitie, acumMs = Date.now()) {
  if (!STARI_GPS_LA_DESCARCARE.includes(cursa.status)) return null;
  if (!areCoordonate(cursa.unloadPoint)) return null;
  // Dieselul se descarcă doar în Moldova: o cisternă cu motorină oprită la
  // Constanța sau în vamă nu e «la descărcare». Biodieselul (Ruse, Sofia) trece.
  if (esteDiesel(cursa.cargo) && !inMoldova(cursa.unloadPoint)) return null;
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

/** Recepția poate fi scrisă înainte ca ceasul nostru să ajungă la data ei (fus, ora 12 implicită). */
export const FEREASTRA_DUPA_ACUM_MS = 86400e3;

/**
 * Momentul descărcării din recepție — DATA DOCUMENTULUI, nu momentul introducerii
 * (Ion, 10.09: «noi ne uităm după data descărcării, că bonul recepție poate să fie
 * introdus azi pe alaltăieri»): unloaded_at (ora exactă), altfel delivery_date la
 * prânz, ora Chișinău; created_at rămâne ultima scăpare pentru înregistrările vechi.
 */
export function momentulReceptiei(r) {
  let t = Date.parse(r.unloaded_at || '');
  if (!Number.isFinite(t) && r.delivery_date) t = Date.parse(`${String(r.delivery_date).slice(0, 10)}T12:00:00+03:00`);
  if (!Number.isFinite(t)) t = Date.parse(r.created_at || '');
  return Number.isFinite(t) ? t : null;
}

/** Punctul din nomenclator pe care stă stația (invers față de statiaPunctului), sau null. */
export function punctulStatiei(statie, puncte) {
  if (!areCoordonate(statie)) return null;
  let best = null;
  for (const p of puncte || []) {
    if (!areCoordonate(p)) continue;
    const d = distM(statie, p);
    if (d <= Math.max(POTRIVIRE_STATIE_M, razaEfectiva(p.radius_m)) && (!best || d < best.d)) best = { p, d };
  }
  return best ? best.p : null;
}

/**
 * Decizia TLX pentru o cursă.
 * @param cursa { id, status, plate, load_planned_at, unloadPoint: { …, country } | null }
 *   unloadPoint null = cursa pornită de automat, descărcarea încă necunoscută: orice stație TLX o închide
 *   și îi pune punctul (D1, D3).
 * @param receptii [{ id, station_id, nr_auto, volume, unloaded_at, delivery_date, created_at, is_deleted }]
 * @param statii [{ id, lat, lon }]  (stations din TLX, lng→lon făcut de apelant)
 * @param folosite Set de fuel_receipts.id deja legate de alte curse
 * @param puncte [{ id, lat, lon, radius_m }] din nomenclator, pentru completarea punctului lipsă
 * Fereastra (D9): de la încărcare (−1 h) până la acum (+1 zi) — NU după unload_planned_at,
 * care e decorativ (cursele se introduc retroactiv cu ore implicite).
 * @returns null | { status:'incheiata', status_source:'tlx', tlx_receipt_id, tlx_receipt_at, tlx_receipt_liters, unload_point_id?, ... }
 */
export function deciziaTlx(cursa, receptii, statii, folosite = new Set(), acumMs = Date.now(), puncte = []) {
  if (!STARI_TLX_INCHEIATA.includes(cursa.status)) return null;
  let statie = null;
  if (cursa.unloadPoint) {
    // Închiderea automată e posibilă DOAR în Moldova (stațiile TLX sunt toate aici;
    // regula stă și în cod, nu doar în geografie).
    if (!inMoldova(cursa.unloadPoint)) return null;
    statie = statiaPunctului(cursa.unloadPoint, statii);
    if (!statie) return null; // descarcă în altă parte decât la o stație TLX — rămâne dispecerul
  }
  const placa = normPlaca(cursa.plate);
  if (!placa) return null;
  const deLa = Date.parse(cursa.load_planned_at) - FEREASTRA_INAINTE_INCARCARE_MS;
  const panaLa = acumMs + FEREASTRA_DUPA_ACUM_MS;
  if (!Number.isFinite(deLa)) return null;
  const statiiDupaId = new Map((statii || []).map((s) => [s.id, s]));

  let aleasa = null;
  let aleasaT = Infinity;
  for (const r of receptii || []) {
    if (r.is_deleted) continue;
    if (folosite.has(r.id)) continue;
    if (statie ? r.station_id !== statie.id : !statiiDupaId.has(r.station_id)) continue;
    if (normPlaca(r.nr_auto) !== placa) continue;
    const t = momentulReceptiei(r);
    if (t === null || t < deLa || t > panaLa) continue;
    if (t < aleasaT) { aleasa = r; aleasaT = t; }
  }
  if (!aleasa) return null;
  const acum = new Date(acumMs).toISOString();
  const out = {
    status: 'incheiata',
    status_source: 'tlx',
    status_changed_at: acum,
    updated_at: acum,
    updated_by: 'auto:tlx',
    status_confirmed_at: null,
    status_confirmed_by: null,
    tlx_receipt_id: aleasa.id,
    tlx_receipt_at: new Date(aleasaT).toISOString(),
    tlx_receipt_liters: aleasa.volume == null ? null : Number(aleasa.volume),
  };
  if (!cursa.unloadPoint) {
    const p = punctulStatiei(statiiDupaId.get(aleasa.station_id), puncte);
    if (p) out.unload_point_id = p.id;
  }
  return out;
}

// ── Tipul camionului din recepțiile TLX (Ion, 08.09: «automat, auto care au
// descărcări în ultimele 1–2 luni la TLX să se fixeze ca cisterne») ──
export const ZILE_CISTERNA_DIN_TLX = 60;

/**
 * Ce trebuie scris ca flota TRANSLUX să reflecte cine a descărcat carburant la TLX.
 * @param receptii  [{ nr_auto, unloaded_at, created_at, is_deleted }] din TLX
 * @param vehicule  [{ id, plate_number, directions }] din TRANSLUX (active)
 * @param profiluri [{ vehicle_id, fleet_type }] din lde_truck_profile
 * @returns { cisterneNoi: [{ vehicleId, plate }], directiiDeAdaugat: [{ vehicleId, plate, directions }],
 *            conflicte: [{ plate, fleetType }], necunoscute: [plăcuțe din TLX fără mașină în TRANSLUX] }
 * Un «zernovoz» cu recepții de carburant NU se răstoarnă automat — e un conflict
 * de spus omului, nu o decizie de luat noaptea: dispecerul a pus tipul cu mâna.
 */
export function planCisterneDinTlx(receptii, vehicule, profiluri, acumMs = Date.now()) {
  const deLa = acumMs - ZILE_CISTERNA_DIN_TLX * 86400e3;
  const placiCuDescarcari = new Set();
  for (const r of receptii || []) {
    if (r.is_deleted) continue;
    const t = momentulReceptiei(r);
    if (t === null || t < deLa || t > acumMs + 86400e3) continue;
    const p = normPlaca(r.nr_auto);
    if (p) placiCuDescarcari.add(p);
  }
  const vehDupaPlaca = new Map((vehicule || []).map((v) => [normPlaca(v.plate_number), v]));
  const profilDupaVehicul = new Map((profiluri || []).map((p) => [p.vehicle_id, p.fleet_type]));

  const cisterneNoi = [];
  const directiiDeAdaugat = [];
  const conflicte = [];
  const necunoscute = [];
  for (const placa of [...placiCuDescarcari].sort()) {
    const v = vehDupaPlaca.get(placa);
    if (!v) { necunoscute.push(placa); continue; }
    const tip = profilDupaVehicul.get(v.id) ?? null;
    if (tip === null) cisterneNoi.push({ vehicleId: v.id, plate: v.plate_number });
    else if (tip !== 'cisterna') conflicte.push({ plate: v.plate_number, fleetType: tip });
    const directii = Array.isArray(v.directions) ? v.directions : [];
    if (!directii.includes('camioane')) {
      directiiDeAdaugat.push({ vehicleId: v.id, plate: v.plate_number, directions: [...directii, 'camioane'] });
    }
  }
  return { cisterneNoi, directiiDeAdaugat, conflicte, necunoscute };
}
