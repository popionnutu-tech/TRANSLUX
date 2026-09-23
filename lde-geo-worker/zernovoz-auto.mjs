// ============================================================================
// LDE camioane — cursele ZERNOVOZURILOR puse automat, din GPS (ION-35).
//
// Ion, 23.09.2026: «la camioane modulul nu lucrează corect, nu identifică toate
// camioanele» → «rezolvă singur». Automatul cisternelor (camion-auto.mjs) lucra
// doar cu cisternele (D6), așa că zernovozurile — 7 camioane cu 1.000–3.000 km pe
// săptămână — n-aveau nicio cursă, iar în bandă arătau libere sau lipseau.
//
// Cisterna se recunoaște după punctul unde ÎNCARCĂ (Berdichev, Constanța). La
// zernovoz locul încărcării nu se vede în GPS: stă 1–4 zile la Bază Briceni și
// pleacă de acolo. Ce se vede clar, pe 60 de zile de opriri, e drumul: convoiul
// pleacă de la bază, trece vama la Albița, stă ore sau zile în portul de la Brăila
// ori la Constanța, apoi se întoarce. Deci cursa zernovozului e:
//  · fără cursă + a plecat de la o BAZĂ, e la ≥ PLECAT_BAZA_KM și nu s-a întors
//    PLECAT_MIN → SE CREEAZĂ cursa «cereale», «spre descărcare», din baza aceea,
//    cu ora plecării;
//  · «spre descărcare» + stă ≥ PRAG_DESCARCARE_CEREALE_MIN la un punct
//    «descarcare_cereale» → «la descărcare»;
//  · «la descărcare» + a plecat de acolo (aceeași dovadă ca la cisterne,
//    aPlecatDeLa) → «încheiată»;
//  · cursa pornită care stă iar ≥ LA_BAZA_MIN la o bază, după plecare → «încheiată»:
//    s-a întors fără ca descărcarea să fi fost văzută (alt port, Ucraina);
//  · cursa «planificată» de om + camionul a plecat de la bază → «spre descărcare».
// Drumul de întoarcere (marfa luată lângă București) nu e cursă: n-are punct sigur.
// Pragul de plecare e 50 km, nu 15 ca la cisterne: zernovozul se mută des între
// Briceni, Lipcani și Edineț fără marfă; până la Albița sunt peste 200 km.
// Nucleul e PUR, ca în camion-auto; I/O-ul stă în trip-live-worker.mjs.
// ============================================================================
import {
  aPlecatDeLa, distM, minuteLaPunct, pozitieProaspata, punctulUndeSta,
  PLECAT_MIN, STARI_DUPA_INCARCARE, ZILE_RECUPERARE, LOC_DESCARCARE_NECUNOSCUT,
} from './camion-auto.mjs';

export const KIND_DESCARCARE_CEREALE = 'descarcare_cereale';
/** Cât stă în port până e descărcare, nu trecere (mediana la Brăila: ore, la Constanța: 7 h). */
export const PRAG_DESCARCARE_CEREALE_MIN = 60;
/** A plecat de la bază cu marfă: atât de departe… */
export const PLECAT_BAZA_KM = 50;
/** …și cât trebuie să stea iar la bază ca drumul să se fi terminat. */
export const LA_BAZA_MIN = 120;
/** Cât de lungă e, orientativ, o cursă de cereale (unload_planned_at e NOT NULL). */
export const DURATA_CURSA_CEREALE_ZILE = 5;
export const MARFA_CEREALE = 'cereale';
/** Plecarea ținută minte mai demult de atât nu mai naște cursă: ar ieși una deja
 *  moartă, pe care cursaExpirata ar stinge-o la rularea următoare. */
export const PLECARE_MAX_ZILE = 7;

const iso = (ms) => new Date(ms).toISOString();
const candva = (ms) => iso(ms).slice(0, 16).replace('T', ' ');
const numePunct = (p) => p?.name ?? 'punct';
const adaugaNota = (cursa, text) => (cursa?.notes ? `${cursa.notes}\n${text}` : text);
const areCoordonate = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon));

/** Cursa nouă, pornită la plecarea de la `baza`. */
function cursaDinBaza({ camion, baza, plecatMs, status, unloadPoint = null, creatDe, nota }) {
  return {
    vehicle_id: camion.id,
    driver_id: camion.driverId ?? null,
    cargo: MARFA_CEREALE,
    client: null,
    load_point_id: baza.id,
    load_planned_at: iso(plecatMs),
    unload_point_id: unloadPoint?.id ?? null,
    unload_place: unloadPoint ? null : LOC_DESCARCARE_NECUNOSCUT,
    unload_planned_at: iso(plecatMs + DURATA_CURSA_CEREALE_ZILE * 86400e3),
    status,
    status_source: 'gps',
    status_changed_at: iso(plecatMs),
    created_by: creatDe,
    updated_by: creatDe,
    notes: nota,
  };
}

/**
 * Plecarea de la bază, după memoria staționării: ultimul punct părăsit e o bază,
 * camionul e acum la ≥ PLECAT_BAZA_KM de ea și n-a mai fost acolo de PLECAT_MIN.
 * @returns { baza, km, cand } | null
 */
export function plecareDeLaBaza({ stationare, pozitie, punct, puncteDupaId, acumMs }) {
  const baza = stationare?.prev_point_id ? puncteDupaId?.get(stationare.prev_point_id) : null;
  if (!baza || baza.kind !== 'baza') return null;
  const p = aPlecatDeLa({ pozitie, punct, reper: baza, stationare, deCand: stationare.prev_until, acumMs });
  if (!p.plecat || p.km < PLECAT_BAZA_KM || p.cand == null) return null;
  if (acumMs - p.cand > PLECARE_MAX_ZILE * 86400e3) return null;
  return { baza, km: p.km, cand: p.cand };
}

/**
 * Decizia pentru un zernovoz, într-o rulare. Aceeași intrare ca deciziaCamion.
 * @returns { creeaza, schimba: { cursaId, deLa, patch } | null, motiv }
 */
export function deciziaZernovoz(input) {
  const { camion, cursa, ultimaCursa, stationare, punct, pozitie, puncteDupaId, acumMs = Date.now() } = input;
  const nimic = { creeaza: null, schimba: null, motiv: null };
  if (camion.fleetType !== 'zernovoz') return nimic;
  if (!pozitieProaspata(pozitie, acumMs)) return nimic;
  const minute = minuteLaPunct(stationare);
  const acum = iso(acumMs);
  const marca = { status_source: 'gps', status_changed_at: acum, updated_at: acum, updated_by: 'auto:gps', status_confirmed_at: null, status_confirmed_by: null };

  // ── Fără cursă: a plecat de la bază → cursa se naște ──
  if (!cursa) {
    const p = plecareDeLaBaza({ stationare, pozitie, punct, puncteDupaId, acumMs });
    if (!p) return nimic;
    // Plecarea asta a născut deja o cursă (poate închisă între timp): nu se reface.
    const ultima = Date.parse(ultimaCursa?.load_planned_at ?? '');
    if (Number.isFinite(ultima) && ultima >= p.cand - 3600e3) return nimic;
    return {
      creeaza: cursaDinBaza({
        camion, baza: p.baza, plecatMs: p.cand, status: 'spre_descarcare', creatDe: 'auto:gps',
        nota: `Cursă de cereale pornită automat: zernovozul a plecat de la «${numePunct(p.baza)}» pe ${candva(p.cand)} și e acum la ${Math.round(p.km)} km. Descărcarea se completează din GPS.`,
      }),
      schimba: null,
      motiv: `zernovoz plecat de la «${numePunct(p.baza)}», la ${Math.round(p.km)} km → cursă nouă cereale, spre descărcare`,
    };
  }

  // ── Planificată de om: camionul a plecat de la bază → spre descărcare ──
  if (cursa.status === 'planificata' || cursa.status === 'spre_incarcare') {
    const p = plecareDeLaBaza({ stationare, pozitie, punct, puncteDupaId, acumMs });
    if (!p) return nimic;
    // Plecarea de acum o săptămână nu e plecarea pentru cursa planificată mâine.
    const planificat = Date.parse(cursa.load_planned_at ?? '');
    if (Number.isFinite(planificat) && p.cand < planificat - 24 * 3600e3) return nimic;
    return {
      creeaza: null,
      schimba: { cursaId: cursa.id, deLa: cursa.status, patch: { status: 'spre_descarcare', ...marca, status_changed_at: iso(p.cand) } },
      motiv: `plecat de la «${numePunct(p.baza)}», la ${Math.round(p.km)} km → spre descărcare`,
    };
  }

  // ── Cursa pornită, iar camionul stă din nou la o bază: drumul s-a terminat ──
  const inceputStationare = Date.parse(stationare?.since ?? '');
  const plecareCursa = Date.parse(cursa.load_planned_at ?? '');
  if (punct?.kind === 'baza' && minute >= LA_BAZA_MIN && STARI_DUPA_INCARCARE.includes(cursa.status)
      && Number.isFinite(inceputStationare) && Number.isFinite(plecareCursa) && inceputStationare > plecareCursa) {
    return {
      creeaza: null,
      schimba: {
        cursaId: cursa.id,
        deLa: cursa.status,
        patch: {
          status: 'incheiata', ...marca, status_changed_at: iso(inceputStationare),
          notes: adaugaNota(cursa, `Încheiată automat: zernovozul s-a întors la «${numePunct(punct)}» pe ${candva(inceputStationare)}.`),
        },
      },
      motiv: `${Math.round(minute)} min la «${numePunct(punct)}» după plecare → încheiată`,
    };
  }

  // ── Spre descărcare: stă în port → la descărcare ──
  if (cursa.status === 'spre_descarcare' || cursa.status === 'asteapta_descarcare') {
    if (!punct) return nimic;
    const alCursei = cursa.unload_point_id && cursa.unload_point_id === punct.id;
    if (!alCursei && punct.kind !== KIND_DESCARCARE_CEREALE) return nimic;
    if (minute < PRAG_DESCARCARE_CEREALE_MIN) return nimic;
    const patch = { status: 'la_descarcare', ...marca, unload_seen_at: null };
    if (!cursa.unload_point_id) patch.unload_point_id = punct.id;
    return { creeaza: null, schimba: { cursaId: cursa.id, deLa: cursa.status, patch }, motiv: `${Math.round(minute)} min la «${numePunct(punct)}» → la descărcare` };
  }

  // ── La descărcare: a plecat din port → încheiată ──
  if (cursa.status === 'la_descarcare') {
    const unloadPoint = cursa.unloadPoint ?? (cursa.unload_point_id ? puncteDupaId?.get(cursa.unload_point_id) : null);
    const p = aPlecatDeLa({ pozitie, punct, reper: unloadPoint, stationare, deCand: cursa.status_changed_at, acumMs });
    if (!p.plecat) return nimic;
    return {
      creeaza: null,
      schimba: {
        cursaId: cursa.id,
        deLa: cursa.status,
        patch: {
          status: 'incheiata', ...marca, status_changed_at: iso(p.cand ?? acumMs),
          notes: adaugaNota(cursa, `Încheiată automat: a plecat de la «${numePunct(unloadPoint)}» pe ${candva(p.cand ?? acumMs)}.`),
        },
      },
      motiv: `la ${Math.round(p.km)} km de «${numePunct(unloadPoint)}», plecat de ≥ ${PLECAT_MIN} min → încheiată`,
    };
  }

  return nimic;
}

/**
 * Cursa de cereale nevăzută, reconstruită din urma GPS — aceleași reguli ca cele
 * vii, rejucate pe opriri. Se întoarce doar drumul care la capătul urmei încă nu
 * s-a terminat, și doar dacă e mai nou decât tot ce știe sistemul despre camion.
 * @param opriri [{ lat, lon, dwell_min, arrival_at, departure_at }] — orice ordine, ≥ 45 min
 * @returns { creeaza, motiv } | null
 */
export function recupereazaZernovozDinIstoric({ camion, opriri, puncte, ultimaCursa, acumMs = Date.now() }) {
  if (camion?.fleetType !== 'zernovoz') return null;
  const deLa = acumMs - ZILE_RECUPERARE * 86400e3;
  const sortate = (opriri || [])
    .filter((o) => areCoordonate(o) && Number.isFinite(Date.parse(o.arrival_at)) && Date.parse(o.arrival_at) >= deLa)
    .sort((a, b) => Date.parse(a.arrival_at) - Date.parse(b.arrival_at));

  let bazaLasata = null;   // { baza, plecat } — ultima ședere lungă la o bază
  let faza = null;
  for (const o of sortate) {
    const p = punctulUndeSta(o, puncte);
    const dwell = Number(o.dwell_min) || 0;
    if (p?.kind === 'baza' && dwell >= LA_BAZA_MIN) {
      faza = null;                                   // întors la bază: drumul dinainte s-a terminat
      bazaLasata = { baza: p, plecat: Date.parse(o.departure_at ?? '') || Date.parse(o.arrival_at) };
      continue;
    }
    if (!faza) {
      if (bazaLasata && distM(o, bazaLasata.baza) >= PLECAT_BAZA_KM * 1000) {
        faza = { baza: bazaLasata.baza, plecat: bazaLasata.plecat, status: 'spre_descarcare', port: null };
        bazaLasata = null;
      } else continue;
    }
    if (faza.status === 'spre_descarcare' && p?.kind === KIND_DESCARCARE_CEREALE && dwell >= PRAG_DESCARCARE_CEREALE_MIN) {
      faza.status = 'la_descarcare';
      faza.port = p;
      faza.inPort = Date.parse(o.arrival_at);
      continue;
    }
    // A descărcat și s-a oprit departe de port: drumul de cereale s-a încheiat.
    if (faza.status === 'la_descarcare' && p?.id !== faza.port.id && distM(o, faza.port) >= 15000) faza = null;
  }
  if (!faza) return null;

  const stieDeja = Math.max(
    Date.parse(ultimaCursa?.load_planned_at ?? '') || -Infinity,
    Date.parse(ultimaCursa?.status_changed_at ?? '') || -Infinity,
  );
  if (Number.isFinite(stieDeja) && faza.plecat <= stieDeja) return null;

  const unde = faza.port ? `, descărcare la «${faza.port.name}»` : '';
  const creeaza = cursaDinBaza({
    camion, baza: faza.baza, plecatMs: faza.plecat, status: faza.status, unloadPoint: faza.port, creatDe: 'auto:istoric',
    nota: `Cursă de cereale recuperată din urma GPS: zernovozul a plecat de la «${faza.baza.name}» pe ${candva(faza.plecat)}${unde}, iar sistemul n-a văzut-o la timp. De aici o duce mai departe poziția live.`,
  });
  if (faza.port && Number.isFinite(faza.inPort)) creeaza.status_changed_at = iso(faza.inPort);
  return {
    creeaza,
    motiv: `urma GPS: plecat de la «${faza.baza.name}» pe ${candva(faza.plecat)} → cursă recuperată cereale, ${faza.status}`,
  };
}

/** Câte opriri lungi în porturile de cereale fac dintr-un camion fără tip un zernovoz. */
export const OPRIRI_PENTRU_ZERNOVOZ = 2;

/**
 * Zernovozurile văzute de GPS, pentru camioanele fără tip — oglinda lui
 * cisterneDinOpriri. QDQ357, QDQ364, QDQ419 și YJX724 merg în convoi cu
 * zernovozurile la Brăila, dar n-au tip, deci niciun automat nu le vedea.
 * Camionul care a stat și la un punct de încărcare carburant rămâne al regulii de
 * cisterne: acolo dovada e mai tare, iar un tip greșit e mai rău decât niciunul.
 * @returns { zernovozeNoi: [{ vehicleId, plate, opriri }] }
 */
export function zernovozeDinOpriri(opriri, puncte, vehicule, profiluri) {
  const porturi = (puncte || []).filter((p) => p.kind === KIND_DESCARCARE_CEREALE && areCoordonate(p));
  const incarcari = (puncte || []).filter((p) => (p.kind === 'incarcare_diesel' || p.kind === 'incarcare_biodiesel') && areCoordonate(p));
  const inRaza = (o, p) => distM(o, p) <= Math.max(1000, Number(p.radius_m) || 1000);
  const laPort = new Map();
  const laIncarcare = new Set();
  for (const o of opriri || []) {
    if (!areCoordonate(o)) continue;
    const dwell = Number(o.dwell_min) || 0;
    if (dwell >= PRAG_DESCARCARE_CEREALE_MIN && porturi.some((p) => inRaza(o, p))) {
      laPort.set(o.vehicle_id, (laPort.get(o.vehicle_id) ?? 0) + 1);
    }
    if (dwell >= 45 && incarcari.some((p) => inRaza(o, p))) laIncarcare.add(o.vehicle_id);
  }
  const cuTip = new Set((profiluri || []).filter((p) => p.fleet_type).map((p) => p.vehicle_id));
  const zernovozeNoi = [];
  for (const v of vehicule || []) {
    const n = laPort.get(v.id) ?? 0;
    if (n < OPRIRI_PENTRU_ZERNOVOZ || cuTip.has(v.id) || laIncarcare.has(v.id)) continue;
    zernovozeNoi.push({ vehicleId: v.id, plate: v.plate_number, opriri: n });
  }
  return { zernovozeNoi };
}
