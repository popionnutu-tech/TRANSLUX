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
//    (D4: biodieselul parcat la Briceni e tranzit, nu descărcare); dacă punctul e
//    o BAZĂ → «plin, așteaptă descărcarea»: la bază cisterna e tot plină până
//    apare bonul TLX (Ion, 10.09, ANT344 la Bacioi);
//  · «la descărcare» → «încheiată» vine din bonul TLX (trip-auto.mjs, D9) SAU,
//    când bon nu există, din plecarea de la punctul de descărcare (vezi mai jos).
// Punctele «tranzit acte», «vamă», «parcare» nu schimbă nimic.
//
// Închiderea fără dispecer (Ion, 21.09.2026: «hai să facem sistema fără el să
// lucreze»). Până aici cursa se termina doar cu bonul TLX sau cu mâna omului, iar
// omul s-a oprit pe 11.09: 13 camioane au rămas agățate de cursa lor, automatul
// n-a mai putut deschide alta și banda a înghețat pe 9–11 septembrie. Trei ieșiri
// noi, toate pe aceeași dovadă — camionul a PLECAT și nu s-a întors:
//  · «la descărcare» + la ≥ PLECAT_KM de punctul de descărcare, de ≥ PLECAT_MIN
//    → «încheiată», cu ora plecării reale. Bonul TLX rămâne calea dintâi (el dă
//    și litrii); GPS-ul prinde ce n-are bon: biodieselul din Bulgaria, descărcarea
//    la bază, bonul care nu mai vine.
//  · «plin, așteaptă descărcarea» + a plecat de la bază după ce a trecut fereastra
//    bonului (ORE_BON_LA_BAZA) → «încheiată». Cisterna plină nu pleacă de la bază
//    decât goală; dar pleacă după ore, nu după minute, iar bonul poate întârzia.
//  · ORICE stare de după încărcare + stă ≥ prag la un punct de ÎNCĂRCARE care nu e
//    cel al etapei curente → cursa veche se încheie la ora la care a început
//    staționarea, iar cursa nouă se naște pe loc. Asta e ieșirea care nu cere
//    nimănui nimic: ANT344 a stat 12 h la Berdichev pe 17–18.09 cu cursa lui
//    spunând «la descărcare la Bacioi» din 16.09. Poarta e ORE_INTRE_INCARCARI:
//    întoarcerea la punct în aceeași zi e tranzit sau acte, nu marfă nouă
//    (LJN076 s-a întors la Berdichev după 21 h, în mijlocul cursei lui).
// Cursa pe care automatul n-a văzut-o se recuperează din urma GPS (recupereazaDinIstoric,
// Ion, 21.09: «recuperează și cursele din istoricul GPS»): aceleași reguli, dar rejucate
// pe opriri în loc de poziția de acum, și se scrie doar drumul care încă nu s-a terminat.
// Cursa pe care nimic n-a mai mișcat-o (cursaExpirata) se stinge după EXPIRA_ZILE
// — plasa de sub toate celelalte, și singura care se uită și la camioanele care
// nu-s cisterne (zernovozul RWN169 cu «el amu la Romanie» din 10.09).
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
/** Cât ține fereastra bonului TLX la bază: sub atât, cisterna care pleacă poate fi
 *  tot plină (a mutat-o cineva în curte, s-a dus la cântar). Peste — a descărcat. */
export const ORE_BON_LA_BAZA = 6;
/** Cursa pe care nimic n-a mai mișcat-o atâtea zile după ora descărcării e moartă, nu în drum. */
export const EXPIRA_ZILE = 10;
/** Două încărcări ale aceluiași camion nu se pot atinge mai des de atât: întoarcerea
 *  la punct în mijlocul cursei e tranzit sau acte, nu marfă nouă. */
export const ORE_INTRE_INCARCARI = 24;
/** Stările în care marfa e deja în camion: de aici o încărcare nouă înseamnă o cursă nouă. */
export const STARI_DUPA_INCARCARE = ['la_incarcare', 'spre_descarcare', 'asteapta_descarcare', 'la_descarcare'];
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
const iso = (ms) => new Date(ms).toISOString();
/** Nota nouă se adaugă la ce scria pe cursă, nu o înlocuiește: ce a scris dispecerul rămâne. */
const adaugaNota = (cursa, text) => (cursa?.notes ? `${cursa.notes}
${text}` : text);
const candva = (ms) => iso(ms).slice(0, 16).replace('T', ' ');

/** Marfa se descarcă la un punct de tipul ăsta? (D4) */
export function descarcaAici(cargo, kind) {
  const m = norm(cargo);
  if (m === 'diesel' || m === 'benzina') return kind === 'descarcare_diesel' || kind === 'baza';
  if (m === 'biodiesel') return kind === 'descarcare_biodiesel';
  return false;
}
/** Marfa a cărei descărcare se dovedește cu bon TLX: la bază rămâne «plin» până apare bonul. */
export function plinLaBaza(cargo) {
  const m = norm(cargo);
  return m === 'diesel' || m === 'benzina';
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

/**
 * Camionul a plecat de la `reper` și nu s-a întors? Dovada e aceeași oriunde se
 * judecă o plecare (de la încărcare, de la descărcare, de la bază): nu mai stă
 * acolo, e la ≥ PLECAT_KM ACUM și au trecut ≥ PLECAT_MIN de când a fost văzut
 * ultima dată la punct. Ora plecării vine din memoria staționării (prev_until)
 * dacă ea și-o amintește, altfel din `deCand` — de obicei ora intrării în stare.
 * Manevrele de 9,6 km ale lui MOW214 nu sunt plecare.
 * @returns { plecat: boolean, km: number, cand: number | null }
 */
export function aPlecatDeLa({ pozitie, punct, reper, stationare, deCand, acumMs }) {
  const nu = { plecat: false, km: 0, cand: null };
  if (!areCoordonate(reper) || !areCoordonate(pozitie)) return nu;
  if (punct && punct.id === reper.id) return nu;
  const km = distM(pozitie, reper) / 1000;
  if (km < PLECAT_KM) return nu;
  const dinStationare = stationare?.prev_point_id === reper.id && stationare.prev_until
    ? Date.parse(stationare.prev_until)
    : NaN;
  const cand = Number.isFinite(dinStationare) ? dinStationare : Date.parse(deCand ?? '');
  if (Number.isFinite(cand) && acumMs - cand < PLECAT_MIN * 60e3) return nu;
  return { plecat: true, km, cand: Number.isFinite(cand) ? cand : null };
}

/**
 * Cursa pe care nimic n-a mai mișcat-o e moartă, nu în drum (Ion, 21.09). Se uită
 * la ORICE cursă deschisă, și la camioanele care nu-s cisterne — acolo automatul
 * n-are nicio altă regulă, deci nimeni n-ar închide-o niciodată (RWN169, zernovoz,
 * «planificată» din 10.09 cu «el amu la Romanie»).
 * Moartă = a trecut ora descărcării cu ≥ EXPIRA_ZILE ȘI nimeni (om sau automat)
 * nu i-a atins starea tot atâtea zile. Ora încheierii e ultima mișcare știută, ca
 * să nu apară în istoric o cursă terminată azi.
 * @param cursa { id, status, status_changed_at, unload_planned_at, notes }
 * @returns { patch, motiv } | null
 */
export function cursaExpirata(cursa, acumMs = Date.now()) {
  if (!cursa || !STARI_DESCHISE.includes(cursa.status)) return null;
  const desc = Date.parse(cursa.unload_planned_at ?? '');
  if (!Number.isFinite(desc)) return null;
  const atinsa = Date.parse(cursa.status_changed_at ?? '');
  const ultima = Number.isFinite(atinsa) ? Math.max(desc, atinsa) : desc;
  const zile = (acumMs - ultima) / 86400e3;
  if (zile < EXPIRA_ZILE) return null;
  const acum = iso(acumMs);
  const nota = `Încheiată automat pe ${acum.slice(0, 10)}: ora descărcării a trecut de ${Math.floor(zile)} zile și nimic n-a mai mișcat cursa.`;
  return {
    patch: {
      status: 'incheiata',
      status_source: 'gps',
      status_changed_at: iso(ultima),
      updated_at: acum,
      updated_by: 'auto:expirat',
      status_confirmed_at: null,
      status_confirmed_by: null,
      notes: cursa.notes ? `${cursa.notes}\n${nota}` : nota,
    },
    motiv: `nemișcată de ${Math.floor(zile)} zile după ora descărcării → încheiată`,
  };
}

/** Cât înapoi se caută în urma GPS cursa pe care sistemul n-a văzut-o. */
export const ZILE_RECUPERARE = 12;

/**
 * Cursa nevăzută, reconstruită din urma GPS (Ion, 21.09: «recuperează și cursele
 * din istoricul GPS»; «poate un auto s-a încărcat cu bio»).
 *
 * Automatul vede doar ce se întâmplă cât timp el rulează: camionul care a încărcat
 * înainte ca el să existe, sau în timp ce cursa veche îl ținea agățat, n-are cursă
 * și n-o va avea niciodată — ANT344 a încărcat biodiesel la Berdichev pe 17–18.09
 * și RWN193 pe 18–20.09, iar în bandă nu se vede nimic.
 *
 * Se rejoacă opririle cu ACELEAȘI praguri ca regulile vii, în ordinea drumului, și
 * se întoarce DOAR cursa care la capătul urmei încă nu s-a terminat. Drumul dus
 * până la capăt (a încărcat, a descărcat, a plecat) e istorie: cursele acelea au
 * fost deja închise, iar a le reface ar umple banda cu ce nu mai e.
 *
 * Starea recuperată e cea pe care o DOVEDEȘTE urma; de acolo o duce mai departe
 * automatul viu, cu poziția de acum.
 *
 * @param opriri [{ lat, lon, dwell_min, arrival_at, departure_at }] — orice ordine
 * @param puncte [{ id, name, lat, lon, radius_m, kind }]
 * @param ultimaCursa cea mai recentă cursă a camionului, orice stare, sau null
 * @returns { creeaza, motiv } | null
 */
export function recupereazaDinIstoric({ camion, opriri, puncte, ultimaCursa, acumMs = Date.now() }) {
  if (camion?.fleetType !== 'cisterna') return null;
  const deLa = acumMs - ZILE_RECUPERARE * 86400e3;
  const sortate = (opriri || [])
    .filter((o) => areCoordonate(o) && Number.isFinite(Date.parse(o.arrival_at)) && Date.parse(o.arrival_at) >= deLa)
    .sort((a, b) => Date.parse(a.arrival_at) - Date.parse(b.arrival_at));

  let faza = null;
  for (const o of sortate) {
    const p = punctulUndeSta(o, puncte);
    if (!p) continue;                                   // oprire departe de orice punct: nu spune nimic
    const dwell = Number(o.dwell_min) || 0;
    const prag = PRAG_MIN[p.kind] ?? 15;

    // Încărcarea începe un drum nou și îl șterge pe cel dinainte: dacă vechiul
    // n-a fost închis, măcar s-a terminat aici — camionul nu încarcă peste marfă.
    if (incarcaAici(null, p.kind) && dwell >= prag) {
      if (faza?.status === 'la_incarcare' && faza.loadPointId === p.id) {
        faza.plecatDeLaIncarcare = o.departure_at ?? faza.plecatDeLaIncarcare;   // aceeași ședere, tăiată în bucăți
      } else {
        faza = {
          cargo: MARFA_DIN_KIND[p.kind], loadPointId: p.id, loadPointName: p.name,
          incarcatLa: o.arrival_at, plecatDeLaIncarcare: o.departure_at ?? null,
          status: 'la_incarcare', unloadPointId: null, unloadPointName: null,
        };
      }
      continue;
    }
    if (!faza) continue;

    // Oprire scurtă la ACELAȘI punct de încărcare: urma taie o ședere lungă în
    // bucăți (ANT344 la Berdichev: 282 min, 489 min, apoi 89 min sub prag, apoi
    // 130 min). Fără verificarea asta, bucata scurtă trecea drept plecare, iar cea
    // de după rescria ora încărcării — 18.09 07:54 în loc de 17.09 16:18.
    if (faza.status === 'la_incarcare' && p.id === faza.loadPointId) {
      faza.plecatDeLaIncarcare = o.departure_at ?? faza.plecatDeLaIncarcare;
      continue;
    }
    // Orice oprire la ALT punct după încărcare dovedește plecarea.
    if (faza.status === 'la_incarcare') faza.status = 'spre_descarcare';

    if (faza.status === 'spre_descarcare' || faza.status === 'asteapta_descarcare') {
      if (descarcaAici(faza.cargo, p.kind) && dwell >= prag) {
        faza.unloadPointId = p.id;
        faza.unloadPointName = p.name;
        // La bază, carburantul TLX e tot în cisternă până apare bonul (D4).
        faza.status = p.kind === 'baza' && plinLaBaza(faza.cargo) ? 'asteapta_descarcare' : 'la_descarcare';
      }
      continue;
    }
    // A descărcat și s-a oprit în altă parte: drumul s-a încheiat, nu mai e de recuperat.
    if (faza.status === 'la_descarcare' && p.id !== faza.unloadPointId) faza = null;
  }

  if (!faza) return null;

  // Ce sistemul știe deja nu se reface. Cursa recuperată trebuie să fie mai nouă
  // decât tot ce s-a scris vreodată pentru camionul ăsta: altfel am reînvia drumul
  // pe care tocmai l-a închis bonul TLX, automatul sau omul.
  const stieDeja = Math.max(
    Date.parse(ultimaCursa?.load_planned_at ?? '') || -Infinity,
    Date.parse(ultimaCursa?.status_changed_at ?? '') || -Infinity,
  );
  const plecat = Date.parse(faza.plecatDeLaIncarcare ?? '') || Date.parse(faza.incarcatLa);
  if (Number.isFinite(stieDeja) && plecat <= stieDeja) return null;

  const inceput = Date.parse(faza.incarcatLa);
  const acum = iso(acumMs);
  const unde = faza.unloadPointName ? `, descărcare la «${faza.unloadPointName}»` : '';
  return {
    creeaza: {
      vehicle_id: camion.id,
      driver_id: camion.driverId ?? null,
      cargo: faza.cargo,
      client: CLIENT_IMPLICIT,
      load_point_id: faza.loadPointId,
      load_planned_at: iso(inceput),
      unload_point_id: faza.unloadPointId,
      unload_place: faza.unloadPointId ? null : LOC_DESCARCARE_NECUNOSCUT,
      unload_planned_at: iso(inceput + DURATA_CURSA_ZILE[faza.cargo] * 86400e3),
      status: faza.status,
      status_source: 'gps',
      status_changed_at: iso(plecat),
      created_by: 'auto:istoric',
      updated_by: 'auto:istoric',
      notes: `Cursă recuperată din urma GPS: camionul a încărcat la «${faza.loadPointName}» pe ${candva(inceput)}${unde}, iar sistemul n-a văzut-o la timp. Starea vine din opriri; de aici o duce mai departe poziția live.`,
    },
    motiv: `urma GPS: încărcat la «${faza.loadPointName}» pe ${candva(inceput)} → cursă recuperată ${faza.cargo}, ${faza.status}`,
  };
}

/** Cât trebuie să stea pe loc într-o zi ca ziua aceea să fie stat, nu lucrat. */
export const ORE_STAT_PE_ZI = 20;
/** Câte zile la rând fac din stat o stare, nu o pauză. */
export const ZILE_STAT = 3;

/**
 * Zilele în care camionul a stat, din urma GPS (Ion, 21.09: camionul care stă zile
 * întregi fără cursă să nu mai apară «liber» în bandă).
 *
 * GPS-ul dovedește că mașina nu s-a mișcat — NU și de ce. De aceea rezultatul se
 * scrie ca «odihnă», starea neutră, niciodată ca «reparație»: aia ar fi o
 * presupunere despre ce se întâmplă în curte. Dacă mașina chiar e în service,
 * omul schimbă starea și automatul nu se mai atinge de ziua aceea.
 *
 * O zi e stată dacă are o oprire de cel puțin ORE_STAT_PE_ZI; se întorc doar
 * zilele care fac parte dintr-un șir de cel puțin ZILE_STAT la rând, ca sâmbăta
 * la bază să nu devină stare. Ziua de azi nu se judecă — n-a trecut încă.
 *
 * Ziua în care camionul AVEA o cursă nu e niciodată odihnă, oricât ar fi stat pe
 * loc: cisterna plină care așteaptă descărcarea la bază stă zile în șir și tot în
 * cursă e (KYK742, plin cu diesel la Bacioi din 10.09). Zilele acelea se scot
 * înainte de a căuta șiruri, altfel o zi de odihnă lipită de două de așteptare ar
 * trece drept șir.
 *
 * @param opriri [{ date: 'YYYY-MM-DD', dwell_min }]
 * @param azi 'YYYY-MM-DD' (ora Chișinăului, ca în lde_gps_stops)
 * @param zileCuCursa Set cu datele în care camionul avea o cursă
 * @returns string[] datele, crescător
 */
export function zileDeStat(opriri, azi, zileCuCursa = new Set()) {
  const cellMaiLung = new Map();
  for (const o of opriri || []) {
    const zi = String(o.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(zi) || zi >= azi || zileCuCursa.has(zi)) continue;
    const dwell = Number(o.dwell_min) || 0;
    if (dwell > (cellMaiLung.get(zi) ?? 0)) cellMaiLung.set(zi, dwell);
  }
  const state = [...cellMaiLung.entries()]
    .filter(([, dwell]) => dwell >= ORE_STAT_PE_ZI * 60)
    .map(([zi]) => zi)
    .sort();

  // Doar șirurile de zile lipite: o zi ruptă în mijlocul lucrului nu e o stare.
  const out = [];
  let sir = [];
  const ziuaUrmatoare = (zi) => {
    const d = new Date(`${zi}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  for (const zi of state) {
    if (sir.length === 0 || ziuaUrmatoare(sir[sir.length - 1]) === zi) sir.push(zi);
    else { if (sir.length >= ZILE_STAT) out.push(...sir); sir = [zi]; }
  }
  if (sir.length >= ZILE_STAT) out.push(...sir);
  return out;
}

/**
 * Zilele acoperite de o cursă, de la încărcare până la ultima urmă a ei. Cursa
 * anulată nu acoperă nimic — n-a existat.
 * @param curse [{ load_planned_at, unload_planned_at, status_changed_at, status }]
 * @returns Set cu date 'YYYY-MM-DD'
 */
export function zileCuCursa(curse) {
  const out = new Set();
  for (const c of curse || []) {
    if (c?.status === 'anulata') continue;
    const de = Date.parse(c?.load_planned_at ?? '');
    if (!Number.isFinite(de)) continue;
    const pana = Math.max(de,
      Date.parse(c?.unload_planned_at ?? '') || de,
      Date.parse(c?.status_changed_at ?? '') || de);
    // Cursele lungi nu sunt nelimitate; plafonul oprește un rând stricat să umple memoria.
    for (let t = de, n = 0; t <= pana && n < 120; t += 86400e3, n++) out.add(iso(t).slice(0, 10));
    out.add(iso(pana).slice(0, 10));
  }
  return out;
}

/** Câte opriri lungi la puncte de încărcare fac dintr-un camion o cisternă. */
export const OPRIRI_PENTRU_CISTERNA = 2;

/**
 * Cisternele văzute de GPS, pentru camioanele fără tip (Ion, 21.09).
 *
 * Până acum tipul venea DOAR din recepțiile TLX (truck-profile-sync), iar o
 * cisternă care duce numai biodiesel în Bulgaria nu apare niciodată într-o
 * recepție TLX — deci rămânea fără tip pentru totdeauna, iar `deciziaCamion` o
 * lasă din prima linie (D6: doar cisterne). Așa a stat RWN193 nevăzut de
 * automat: în mini app scria «tip?», iar pe 18–20.09 a stat 19 h la Berdichev
 * și a făcut cursa dus-întors fără ca sistemul să clipească.
 *
 * Dovada e aceeași ca la cursă: camionul a stat ≥ pragul punctului la un punct
 * de ÎNCĂRCARE, de cel puțin OPRIRI_PENTRU_CISTERNA ori. O singură oprire poate
 * fi o parcare lângă rafinărie; două sunt o rutină. Tipul pus de om nu se
 * răstoarnă — iese ca «conflict», ca la regula din TLX.
 *
 * @param opriri  [{ vehicle_id, lat, lon, dwell_min }] din lde_gps_stops
 * @param puncte  [{ id, lat, lon, radius_m, kind }]
 * @param vehicule [{ id, plate_number }]
 * @param profiluri [{ vehicle_id, fleet_type }]
 * @returns { cisterneNoi: [{ vehicleId, plate, opriri }], conflicte: [{ plate, fleetType, opriri }] }
 */
export function cisterneDinOpriri(opriri, puncte, vehicule, profiluri) {
  const incarcari = (puncte || []).filter((p) => KIND_INCARCARE.has(p.kind) && areCoordonate(p));
  const numar = new Map();
  for (const o of opriri || []) {
    if (!areCoordonate(o)) continue;
    const dwell = Number(o.dwell_min);
    if (!Number.isFinite(dwell)) continue;
    const potrivit = incarcari.some((p) => dwell >= PRAG_MIN[p.kind]
      && distM(o, p) <= Math.max(1000, razaEfectiva(p.radius_m)));
    if (potrivit) numar.set(o.vehicle_id, (numar.get(o.vehicle_id) ?? 0) + 1);
  }
  const tipDupaVehicul = new Map((profiluri || []).map((p) => [p.vehicle_id, p.fleet_type]));
  const cisterneNoi = [];
  const conflicte = [];
  for (const v of vehicule || []) {
    const n = numar.get(v.id) ?? 0;
    if (n < OPRIRI_PENTRU_CISTERNA) continue;
    const tip = tipDupaVehicul.get(v.id) ?? null;
    if (tip === null) cisterneNoi.push({ vehicleId: v.id, plate: v.plate_number, opriri: n });
    else if (tip !== 'cisterna') conflicte.push({ plate: v.plate_number, fleetType: tip, opriri: n });
  }
  return { cisterneNoi, conflicte };
}


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

  // Camionul stă ACUM, destul, la un punct de încărcare potrivit? Aceeași dovadă
  // naște cursa în două locuri: la camionul liber (D1) și la cel care a venit să
  // reîncarce cu o cursă veche neînchisă pe el.
  const incarcaAcum = proaspata && punct && incarcaAici(null, punct.kind) && minute >= PRAG_MIN[punct.kind];
  // Cursa care tocmai s-a închis la același punct, în aceeași staționare, nu se reface.
  const dejaFacuta = () => ultimaCursa && ultimaCursa.load_point_id === punct.id
    && Date.parse(ultimaCursa.load_planned_at) >= Date.parse(stationare.since) - 3600e3;
  const cursaNoua = () => {
    const marfa = MARFA_DIN_KIND[punct.kind];
    const inceput = Date.parse(stationare.since);
    return {
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
    };
  };

  // ── Fără cursă deschisă: stă la încărcare destul → cursa se naște (D1) ──
  if (!cursa) {
    if (!incarcaAcum || dejaFacuta()) return nimic;
    return {
      creeaza: cursaNoua(),
      schimba: null,
      motiv: `fără cursă, ${Math.round(minute)} min la «${numePunct(punct)}» → cursă nouă ${MARFA_DIN_KIND[punct.kind]}, la încărcare`,
    };
  }

  // ── Reîncărcarea încheie cursa veche și o deschide pe cea nouă (Ion, 21.09) ──
  // Camionul cu marfa deja luată, care stă iar la un punct de încărcare, spune
  // singurul lucru care contează: cursa dinainte s-a terminat. Fără regula asta,
  // o cursă rămasă deschisă ține camionul agățat la nesfârșit — ANT344 a stat 12 h
  // la Berdichev pe 17–18.09, iar banda îl arăta «la descărcare la Bacioi» din 16.09.
  // «La încărcare» chiar la punctul ei nu e reîncărcare, e cursa care abia începe.
  // Întoarcerea la același punct în mijlocul cursei NU e reîncărcare: LJN076 a
  // încărcat la Berdichev pe 16.09 la 09:04 și s-a întors acolo a doua zi la
  // 06:11, pentru încă 4 h — cu regula fără poartă i-ar fi ieșit a doua cursă
  // peste prima. Nicio cisternă nu încarcă de două ori într-o zi: numai Berdichevul
  // ține 5,2 h la mediană, iar cel mai apropiat client e la o zi de drum.
  const inceputStationare = Date.parse(stationare?.since ?? '');
  const incarcareaCursei = Date.parse(cursa.load_planned_at ?? '');
  const altaIncarcare = !Number.isFinite(incarcareaCursei) || !Number.isFinite(inceputStationare)
    || inceputStationare - incarcareaCursei >= ORE_INTRE_INCARCARI * 3600e3;
  if (incarcaAcum && altaIncarcare && STARI_DUPA_INCARCARE.includes(cursa.status)
      && !(cursa.status === 'la_incarcare' && cursa.load_point_id === punct.id)
      && !dejaFacuta()) {
    const inceput = Date.parse(stationare.since);
    return {
      creeaza: cursaNoua(),
      schimba: {
        cursaId: cursa.id,
        deLa: cursa.status,
        patch: {
          status: 'incheiata', ...marca, status_changed_at: iso(inceput),
          notes: adaugaNota(cursa, `Încheiată automat: camionul a început o cursă nouă la «${numePunct(punct)}» pe ${candva(inceput)}.`),
        },
      },
      motiv: `${Math.round(minute)} min la «${numePunct(punct)}» cu cursa în «${cursa.status}» → cursa veche încheiată, cursă nouă ${MARFA_DIN_KIND[punct.kind]}`,
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
    // Nu e la încărcare, dar ISTORICUL opririlor (lde_gps_stops) îl arată stând la
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
    // Ultima dată văzut la încărcare: din staționare dacă a plecat de acolo, altfel de când e «la încărcare».
    const p = aPlecatDeLa({ pozitie, punct, reper: loadPoint, stationare, deCand: cursa.status_changed_at, acumMs });
    if (!p.plecat) return nimic;
    return {
      creeaza: null,
      schimba: { cursaId: cursa.id, deLa: cursa.status, patch: { status: 'spre_descarcare', ...marca } },
      motiv: `la ${Math.round(p.km)} km de «${numePunct(loadPoint)}», plecat de ≥ ${PLECAT_MIN} min → spre descărcare`,
    };
  }

  // ── Spre descărcare / plin: stă la un punct potrivit mărfii → la descărcare (D4) ──
  if (cursa.status === 'spre_descarcare' || cursa.status === 'asteapta_descarcare') {
    if (!proaspata) return nimic;
    // Plină la bază și plecată de acolo, după ce a trecut fereastra bonului: cisterna
    // nu iese de la bază cu marfa în ea. Bonul TLX poate întârzia ore (văzut: recepție
    // pe 04.09 scrisă pe 08.09), de aceea ORE_BON_LA_BAZA — sub atât, plecarea poate
    // fi o mutare prin curte, nu sfârșitul cursei.
    if (cursa.status === 'asteapta_descarcare') {
      const baza = cursa.unloadPoint ?? (cursa.unload_point_id ? puncteDupaId?.get(cursa.unload_point_id) : null);
      const intrat = Date.parse(cursa.status_changed_at ?? '');
      const trecutFereastra = Number.isFinite(intrat) && acumMs - intrat >= ORE_BON_LA_BAZA * 3600e3;
      const p = trecutFereastra
        ? aPlecatDeLa({ pozitie, punct, reper: baza, stationare, deCand: cursa.status_changed_at, acumMs })
        : { plecat: false };
      if (p.plecat) {
        return {
          creeaza: null,
          schimba: {
            cursaId: cursa.id,
            deLa: cursa.status,
            patch: {
              status: 'incheiata', ...marca, status_changed_at: iso(p.cand ?? acumMs),
              notes: adaugaNota(cursa, `Încheiată automat: a stat plin la «${numePunct(baza)}» și a plecat de acolo pe ${candva(p.cand ?? acumMs)}, fără bon TLX.`),
            },
          },
          motiv: `plin la «${numePunct(baza)}», plecat la ${Math.round(p.km)} km după ${Math.round((acumMs - intrat) / 3600e3)} h → încheiată`,
        };
      }
    }
    if (!punct) return nimic;
    const alCursei = cursa.unload_point_id && cursa.unload_point_id === punct.id;
    if (!alCursei && !descarcaAici(cursa.cargo, punct.kind)) return nimic;
    // Punctul explicit al cursei se confirmă în 15 min chiar dacă e «bază»; Briceni fără cursă explicită cere 2 h.
    const prag = alCursei ? Math.min(PRAG_MIN[punct.kind] ?? 15, 15) : (PRAG_MIN[punct.kind] ?? 15);
    if (minute < prag) return nimic;
    // La BAZĂ cisterna cu carburant TLX e tot plină: descărcarea o dovedește DOAR
    // bonul TLX (Ion, 10.09: «dacă auto a venit de la România și nu a apărut încă
    // descărcat în TLX și stă la bază — starea este încărcat»). Deci «plin, așteaptă
    // descărcarea», nu «la descărcare»; bonul închide și de aici (STARI_TLX_INCHEIATA).
    // Biodieselul n-are bon TLX — cu baza pusă explicit pe cursă rămâne «la descărcare».
    if (punct.kind === 'baza' && plinLaBaza(cursa.cargo)) {
      if (cursa.status === 'asteapta_descarcare') return nimic;
      const patch = { status: 'asteapta_descarcare', ...marca };
      if (!cursa.unload_point_id) patch.unload_point_id = punct.id;
      return { creeaza: null, schimba: { cursaId: cursa.id, deLa: cursa.status, patch }, motiv: `${Math.round(minute)} min la «${numePunct(punct)}», fără bon TLX → plin, așteaptă descărcarea` };
    }
    const patch = { status: 'la_descarcare', ...marca, unload_seen_at: null };
    if (!cursa.unload_point_id) patch.unload_point_id = punct.id;
    return { creeaza: null, schimba: { cursaId: cursa.id, deLa: cursa.status, patch }, motiv: `${Math.round(minute)} min la «${numePunct(punct)}» → la descărcare` };
  }

  // ── La descărcare: a plecat de la punctul de descărcare → încheiată ──
  // Bonul TLX rămâne calea dintâi (deciziaTlx, D9) — el aduce și litrii, și se
  // încearcă înaintea acestei reguli, la fiecare rulare. Aici se închid cursele
  // care n-au bon de unde: biodieselul descărcat la Sofia sau Ruse, marfa lăsată
  // la o bază fără stație TLX, bonul care n-a mai fost scris niciodată.
  if (cursa.status === 'la_descarcare') {
    if (!proaspata) return nimic;
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
          notes: adaugaNota(cursa, `Încheiată automat: a plecat de la «${numePunct(unloadPoint)}» pe ${candva(p.cand ?? acumMs)}, fără bon TLX.`),
        },
      },
      motiv: `la ${Math.round(p.km)} km de «${numePunct(unloadPoint)}», plecat de ≥ ${PLECAT_MIN} min → încheiată`,
    };
  }

  return nimic;
}

