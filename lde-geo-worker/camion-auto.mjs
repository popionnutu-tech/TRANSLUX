// ============================================================================
// LDE camioane — stările puse automat, din GPS, cu dispecerul minimal
// (Ion, 10.09.2026: «scopul final este ca AI maximal să pună starea la auto și
// dispecerul minimal»). Spec: docs/specs/camioane-stari-automate.md.
//
// Nucleul PUR: primește camionul, cursa lui deschisă (sau nimic), unde stă acum
// (staționarea ținută minte între rulări), poziția live și punctele cu tip, și
// întoarce ce trebuie scris: staționarea nouă, cursa de creat, cursa de mutat,
// alertele. Fără rețea, fără BD — testabil direct (camion-auto.test.mjs).
// I/O-ul stă în trip-live-worker.mjs.
//
// Regulile, în ordinea drumului (doar cisterne — D6):
//  · fără cursă + stă ≥ P1(tip) la un punct «încărcare X» → SE CREEAZĂ cursa,
//    marfa X, «la încărcare» (D1: «creează cursa, iar ulterior dacă are mai
//    multe date — schimbă cursa»);
//  · «planificată»/«spre încărcare» + stă ≥ P1 la punctul de încărcare al
//    cursei (sau la orice punct «încărcare» potrivit mărfii) → «la încărcare»;
//  · «la încărcare» + a ieșit din rază, e la ≥ P2 km și nu s-a întors P3 min
//    → «spre descărcare» (manevrele de 9,6 km ale lui MOW214 nu sunt plecare);
//  · «spre descărcare»/«plin, așteaptă» + stă ≥ prag la un punct al cărui tip se
//    potrivește cu marfa SAU la punctul pus explicit pe cursă → «la descărcare»
//    (D4: biodieselul parcat la Briceni e tranzit, nu descărcare);
//  · «la descărcare» → «încheiată» vine din bonul TLX (trip-auto.mjs, D9).
// Punctele «tranzit acte», «vamă», «parcare» nu schimbă nimic.
// Manualul bate automatul: scrierea e optimistă pe starea citită, iar automatul
// nu merge niciodată înapoi și nu sare peste etape.
// ============================================================================
import { hav } from './km-core.mjs';

export const VITEZA_STA_KMH = 5.6;
export const POZITIE_VECHE_MIN = 30;
export const RAZA_MIN_M = 200;
export const RAZA_MAX_M = 2000;

/** Cât stă la punct până devine adevăr, pe tipul punctului (§8 din spec). */
export const PRAG_MIN = {
  incarcare_biodiesel: 120,   // mediana Berdichev 5,2 h; nicio trecere scurtă nu se apropie
  incarcare_diesel: 45,       // Constanța 83 min, Petromidia 29 min — pragul slab, de calibrat
  descarcare_biodiesel: 15,
  descarcare_diesel: 15,
  baza: 120,                  // Briceni: mediana tranzitului 9 min; descărcarea de diesel durează ore
};
/** A plecat de la încărcare: la cel puțin atâția km de punct… */
export const PLECAT_KM = 15;
/** …și fără să se fi întors atâtea minute. */
export const PLECAT_MIN = 60;
/** Cât ține, orientativ, o cursă pornită de automat (unload_planned_at e NOT NULL). */
export const DURATA_CURSA_ZILE = { biodiesel: 4, diesel: 2 };
export const CLIENT_IMPLICIT = 'Statii TLX';
export const LOC_DESCARCARE_NECUNOSCUT = 'se stabilește după GPS';

export const MARFA_DIN_KIND = { incarcare_biodiesel: 'biodiesel', incarcare_diesel: 'diesel' };
const KIND_INCARCARE = new Set(Object.keys(MARFA_DIN_KIND));

export const STARI_DESCHISE = ['planificata', 'spre_incarcare', 'la_incarcare', 'asteapta_descarcare', 'spre_descarcare', 'la_descarcare'];

export function razaEfectiva(radiusM) {
  const r = radiusM == null ? 500 : Number(radiusM);
  return Math.min(RAZA_MAX_M, Math.max(RAZA_MIN_M, Number.isFinite(r) ? r : 500));
}
const areCoordonate = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon));
export const distM = (a, b) => hav({ lat: Number(a.lat), lon: Number(a.lon) }, { lat: Number(b.lat), lon: Number(b.lon) }) * 1000;
const inRaza = (poz, p) => areCoordonate(p) && distM(poz, p) <= razaEfectiva(p.radius_m);
const norm = (s) => String(s ?? '').trim().toLowerCase();

/** Marfa se descarcă la un punct de tipul ăsta? (D4) */
export function descarcaAici(cargo, kind) {
  const m = norm(cargo);
  if (m === 'diesel' || m === 'benzina') return kind === 'descarcare_diesel' || kind === 'baza';
  if (m === 'biodiesel') return kind === 'descarcare_biodiesel';
  return false;
}
/** Marfa se încarcă la un punct de tipul ăsta? Fără marfă pe cursă: orice punct de încărcare. */
export function incarcaAici(cargo, kind) {
  if (!KIND_INCARCARE.has(kind)) return false;
  const m = norm(cargo);
  return !m || MARFA_DIN_KIND[kind] === m;
}

/** Poziția e proaspătă (sub 30 min, nu din viitor)? */
export function pozitieProaspata(pozitie, acumMs) {
  if (!pozitie || !areCoordonate(pozitie)) return false;
  const t = Date.parse(pozitie.at);
  if (!Number.isFinite(t)) return false;
  const varsta = acumMs - t;
  return varsta >= 0 && varsta <= POZITIE_VECHE_MIN * 60e3;
}

/** Punctul (cu tip) în raza căruia e poziția; cel mai apropiat dacă razele se suprapun. */
export function punctulUndeSta(pozitie, puncte) {
  let best = null;
  for (const p of puncte || []) {
    if (!p.kind || !inRaza(pozitie, p)) continue;
    const d = distM(pozitie, p);
    if (!best || d < best.d) best = { p, d };
  }
  return best ? best.p : null;
}

/**
 * Staționarea nouă după poziția de acum (pură). Rândul ține: unde stă acum
 * (point_id, since, last_seen_at) și de unde a plecat ultima dată (prev_*).
 * Intrarea în rază pornește numărătoarea; ieșirea o închide în prev_*.
 * Poziție veche → nu se atinge nimic (nu știm unde e).
 * @returns { stationare, schimbata: boolean }
 */
export function actualizeazaStationarea(stationare, punct, pozitie, acumMs) {
  const s = stationare ?? { point_id: null, since: null, last_seen_at: null, prev_point_id: null, prev_since: null, prev_until: null, last_lat: null, last_lng: null, last_at: null };
  if (!pozitieProaspata(pozitie, acumMs)) return { stationare: s, schimbata: false };
  const at = new Date(Date.parse(pozitie.at)).toISOString();
  const baza = { ...s, last_lat: Number(pozitie.lat), last_lng: Number(pozitie.lon), last_at: at };
  if (punct && s.point_id === punct.id) {
    return { stationare: { ...baza, last_seen_at: at }, schimbata: true };
  }
  // A ieșit din punctul vechi (sau a intrat direct în altul): cel vechi devine «ultimul».
  const iesit = s.point_id
    ? { prev_point_id: s.point_id, prev_since: s.since, prev_until: s.last_seen_at ?? s.since }
    : { prev_point_id: s.prev_point_id, prev_since: s.prev_since, prev_until: s.prev_until };
  if (punct) {
    return { stationare: { ...baza, ...iesit, point_id: punct.id, since: at, last_seen_at: at }, schimbata: true };
  }
  return { stationare: { ...baza, ...iesit, point_id: null, since: null, last_seen_at: null }, schimbata: true };
}

/** Sub o oră la punct nu e încărcare (aceeași regulă ca în admin, banda.ts). */
export const OPRIRE_INCARCARE_MIN = 60;
/** Cât de devreme față de ora planificată poate ajunge camionul la încărcare și tot să conteze. */
export const TOLERANTA_INCARCARE_MS = 24 * 3600e3;

/**
 * Oprirea din istoric (lde_gps_stops) care dovedește încărcarea: în raza punctului
 * (cel puțin 1 km), ≥ 60 min, nu mai devreme de o zi față de ora planificată. Cea mai
 * veche câștigă — e momentul încărcării.
 * @param opriri [{ lat, lon, dwell_min, arrival_at, departure_at }]
 */
export function oprireaDeIncarcare(opriri, loadPoint, loadPlannedAt) {
  const t = Date.parse(loadPlannedAt ?? '');
  if (!Number.isFinite(t) || !areCoordonate(loadPoint)) return null;
  const razaM = Math.max(1000, razaEfectiva(loadPoint.radius_m));
  return (opriri || [])
    .filter((o) => Number(o.dwell_min) >= OPRIRE_INCARCARE_MIN
      && Date.parse(o.arrival_at) >= t - TOLERANTA_INCARCARE_MS
      && areCoordonate(o) && distM(o, loadPoint) <= razaM)
    .sort((a, b) => Date.parse(a.arrival_at) - Date.parse(b.arrival_at))[0] ?? null;
}

/** Câte minute stă camionul la punctul curent, după staționare. */
export function minuteLaPunct(stationare) {
  if (!stationare?.point_id || !stationare.since || !stationare.last_seen_at) return 0;
  return Math.max(0, (Date.parse(stationare.last_seen_at) - Date.parse(stationare.since)) / 60e3);
}

const iso = (ms) => new Date(ms).toISOString();

/**
 * Decizia pentru un camion, într-o rulare.
 * @param input {
 *   camion: { id, plate, fleetType, driverId },
 *   cursa: { id, status, cargo, load_point_id, unload_point_id, load_planned_at, status_changed_at, loadPoint, unloadPoint } | null,
 *   ultimaCursa: { load_point_id, load_planned_at, status } | null   — cea mai recentă cursă, orice stare (ca să nu recreăm ce tocmai s-a închis)
 *   stationare: rândul ACTUALIZAT (după actualizeazaStationarea),
 *   punct: punctul unde stă acum (cu kind) | null,
 *   pozitie: { lat, lon, speed, at } | null,
 *   puncteDupaId: Map id → punct,
 *   acumMs }
 * @returns { creeaza: {...} | null, schimba: { cursaId, deLa, patch } | null, motiv: string | null }
 */
export function deciziaCamion(input) {
  const { camion, cursa, ultimaCursa, stationare, punct, pozitie, puncteDupaId, acumMs = Date.now() } = input;
  const nimic = { creeaza: null, schimba: null, motiv: null };
  if (camion.fleetType !== 'cisterna') return nimic;              // D6
  // Poziția veche nu spune unde e camionul ACUM: tot ce se judecă după locul de
  // acum tace. Istoricul opririlor (pornirea la rece) nu are nevoie de ea.
  const proaspata = pozitieProaspata(pozitie, acumMs);
  const minute = proaspata ? minuteLaPunct(stationare) : 0;
  const acum = iso(acumMs);
  // Fiecare stare nouă pusă de automat așteaptă confirmarea dispecerului (migr. 336).
  const marca = { status_source: 'gps', status_changed_at: acum, updated_at: acum, updated_by: 'auto:gps', status_confirmed_at: null, status_confirmed_by: null };
  const numePunct = (p) => p?.name ?? 'punct';

  // ── Fără cursă deschisă: stă la încărcare destul → cursa se naște (D1) ──
  if (!cursa) {
    if (!proaspata || !punct || !incarcaAici(null, punct.kind)) return nimic;
    if (minute < PRAG_MIN[punct.kind]) return nimic;
    // Cursa care tocmai s-a închis la același punct, în aceeași staționare, nu se reface.
    if (ultimaCursa && ultimaCursa.load_point_id === punct.id
        && Date.parse(ultimaCursa.load_planned_at) >= Date.parse(stationare.since) - 3600e3) return nimic;
    const marfa = MARFA_DIN_KIND[punct.kind];
    const inceput = Date.parse(stationare.since);
    return {
      creeaza: {
        vehicle_id: camion.id,
        driver_id: camion.driverId ?? null,
        cargo: marfa,
        client: CLIENT_IMPLICIT,
        load_point_id: punct.id,
        load_planned_at: iso(inceput),
        unload_point_id: null,
        unload_place: LOC_DESCARCARE_NECUNOSCUT,
        unload_planned_at: iso(inceput + DURATA_CURSA_ZILE[marfa] * 86400e3),
        status: 'la_incarcare',
        status_source: 'gps',
        status_changed_at: acum,
        created_by: 'auto:gps',
        updated_by: 'auto:gps',
        notes: `Cursă pornită automat: camionul stă de ${Math.round(minute)} min la «${numePunct(punct)}». Descărcarea se completează din GPS sau din bonul TLX.`,
      },
      schimba: null,
      motiv: `fără cursă, ${Math.round(minute)} min la «${numePunct(punct)}» → cursă nouă ${marfa}, la încărcare`,
    };
  }

  // ── Planificată / spre încărcare: stă la încărcare → la încărcare ──
  if (cursa.status === 'planificata' || cursa.status === 'spre_incarcare') {
    // Stă la un punct de încărcare (al cursei sau potrivit mărfii): numără minutele.
    // Stă la ALT fel de punct (la bază, la descărcare): nu spune nimic despre
    // încărcare — se trece la istoric. ANT344 stătea la Bacioi de 5 zile, după ce
    // încărcase la Constanța, și rămânea «planificată» fiindcă returnam de aici.
    const laIncarcare = proaspata && punct && ((cursa.load_point_id && cursa.load_point_id === punct.id) || incarcaAici(cursa.cargo, punct.kind));
    if (laIncarcare) {
      const prag = PRAG_MIN[punct.kind] ?? PRAG_MIN.incarcare_diesel;
      if (minute < prag) return nimic;
      const patch = { status: 'la_incarcare', ...marca };
      if (!cursa.load_point_id) patch.load_point_id = punct.id;
      if (!norm(cursa.cargo) && MARFA_DIN_KIND[punct.kind]) patch.cargo = MARFA_DIN_KIND[punct.kind];
      return { creeaza: null, schimba: { cursaId: cursa.id, deLa: cursa.status, patch }, motiv: `${Math.round(minute)} min la «${numePunct(punct)}» → la încărcare` };
    }
    // Nu e la niciun punct, dar ISTORICUL opririlor (lde_gps_stops) îl arată stând la
    // încărcare după ora planificată: a încărcat înainte ca automatul să-l vadă
    // (pornirea la rece — MOW214, IIC263, LJN080 pe 10.09 erau de zile pe drum cu
    // cursa «planificată»). Starea se pune cu ora plecării de la punct; ticul următor
    // îl duce «spre descărcare».
    const loadPoint = cursa.loadPoint ?? (cursa.load_point_id ? puncteDupaId?.get(cursa.load_point_id) : null);
    const oprire = oprireaDeIncarcare(input.opriri ?? [], loadPoint, cursa.load_planned_at);
    if (!oprire) return nimic;
    const plecat = Date.parse(oprire.departure_at ?? '');
    const patch = { status: 'la_incarcare', ...marca, status_changed_at: Number.isFinite(plecat) ? iso(plecat) : acum };
    return {
      creeaza: null,
      schimba: { cursaId: cursa.id, deLa: cursa.status, patch },
      motiv: `istoric: ${Math.round(oprire.dwell_min)} min la «${numePunct(loadPoint)}» pe ${String(oprire.arrival_at).slice(0, 10)} → la încărcare (plecat ${String(oprire.departure_at ?? '').slice(0, 16)})`,
    };
  }

  // ── La încărcare: a plecat departe și nu s-a întors → spre descărcare ──
  if (cursa.status === 'la_incarcare') {
    if (!proaspata) return nimic;
    const loadPoint = cursa.loadPoint ?? (cursa.load_point_id ? puncteDupaId?.get(cursa.load_point_id) : null);
    if (!areCoordonate(loadPoint)) return nimic;
    if (punct && punct.id === loadPoint.id) return nimic;
    const km = distM(pozitie, loadPoint) / 1000;
    if (km < PLECAT_KM) return nimic;
    // Ultima dată văzut la încărcare: din staționare dacă a plecat de acolo, altfel de când e «la încărcare».
    const vazut = stationare?.prev_point_id === loadPoint.id && stationare.prev_until
      ? Date.parse(stationare.prev_until)
      : Date.parse(cursa.status_changed_at ?? '');
    if (Number.isFinite(vazut) && acumMs - vazut < PLECAT_MIN * 60e3) return nimic;
    return {
      creeaza: null,
      schimba: { cursaId: cursa.id, deLa: cursa.status, patch: { status: 'spre_descarcare', ...marca } },
      motiv: `la ${Math.round(km)} km de «${numePunct(loadPoint)}», plecat de ≥ ${PLECAT_MIN} min → spre descărcare`,
    };
  }

  // ── Spre descărcare / plin: stă la un punct potrivit mărfii → la descărcare (D4) ──
  if (cursa.status === 'spre_descarcare' || cursa.status === 'asteapta_descarcare') {
    if (!proaspata || !punct) return nimic;
    const alCursei = cursa.unload_point_id && cursa.unload_point_id === punct.id;
    if (!alCursei && !descarcaAici(cursa.cargo, punct.kind)) return nimic;
    // Punctul explicit al cursei se confirmă în 15 min chiar dacă e «bază»; Briceni fără cursă explicită cere 2 h.
    const prag = alCursei ? Math.min(PRAG_MIN[punct.kind] ?? 15, 15) : (PRAG_MIN[punct.kind] ?? 15);
    if (minute < prag) return nimic;
    const patch = { status: 'la_descarcare', ...marca, unload_seen_at: null };
    if (!cursa.unload_point_id) patch.unload_point_id = punct.id;
    return { creeaza: null, schimba: { cursaId: cursa.id, deLa: cursa.status, patch }, motiv: `${Math.round(minute)} min la «${numePunct(punct)}» → la descărcare` };
  }

  return nimic;
}

/**
 * Alertele pentru dispecer (D7), din ce se vede acum. Cheia oprește repetarea:
 * aceeași alertă pentru aceeași cursă/zi se scrie o singură dată.
 * @returns [{ fel, cheie, mesaj, trip_id }]
 */
export function alerteCamion({ camion, cursa, stationare, punct, pozitie, acumMs = Date.now() }) {
  const out = [];
  if (camion.fleetType !== 'cisterna') return out;
  const zi = iso(acumMs).slice(0, 10);
  // La descărcare de peste 6 h fără bon TLX: ori bonul întârzie, ori descarcă în altă parte.
  if (cursa?.status === 'la_descarcare' && cursa.status_changed_at) {
    const ore = (acumMs - Date.parse(cursa.status_changed_at)) / 3600e3;
    if (ore >= 6) {
      out.push({ fel: 'descarcare_fara_bon', cheie: `descarcare_fara_bon|${cursa.id}`, trip_id: cursa.id,
        mesaj: `${camion.plate}: la descărcare de ${Math.round(ore)} h fără bon TLX (${cursa.cargo ?? 'marfă'}${cursa.unloadPoint?.name ? `, ${cursa.unloadPoint.name}` : ''}). Închide cursa sau verifică bonul.` });
    }
  }
  // Poziția GPS a amuțit de peste 12 h cu marfa în camion: nu știm unde e.
  if (cursa && ['la_incarcare', 'spre_descarcare', 'asteapta_descarcare'].includes(cursa.status) && pozitie) {
    const t = Date.parse(pozitie.at);
    if (Number.isFinite(t) && acumMs - t >= 12 * 3600e3) {
      out.push({ fel: 'gps_mut', cheie: `gps_mut|${cursa.id}|${zi}`, trip_id: cursa.id,
        mesaj: `${camion.plate}: plin cu ${cursa.cargo ?? 'marfă'}, iar GPS-ul tace de ${Math.round((acumMs - t) / 3600e3)} h (ultima poziție ${pozitie.at.slice(0, 16).replace('T', ' ')}).` });
    }
  }
  void stationare; void punct;
  return out;
}
