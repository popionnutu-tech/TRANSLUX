// Banda de timp a flotei: rândul e camionul, coloanele sunt zilele, cursa e o bară.
// Ion, 01.09: «лучше сделать ленту времени» — un singur ecran în locul a două.
//
// Funcții pure: primesc cursele și zilele, întorc poziția barelor. Fără I/O,
// ca să poată fi testate pe cazurile care ne-au mușcat deja (cursa multi-zi
// tăiată de marginea ferestrei, cursa care începe înaintea ferestrei).
import { chisinauDayOf, chisinauInstantIso, chisinauTimeOf } from '../chisinau-time';
import { STARE_ASTEAPTA_DESCARCARE, TRIP_FLOW, haversineKm } from './camioane';

/** Bara unei curse în grilă. `start` e indexul coloanei, `span` numărul de zile. */
export type Segment = {
  start: number;
  span: number;
  /** Cursa a început ÎNAINTE de fereastră — bara se desenează retezată la stânga. */
  taiatStanga: boolean;
  /** Cursa se termină DUPĂ fereastră. */
  taiatDreapta: boolean;
};

/**
 * Unde cade cursa în fereastra de zile. `null` = nu atinge fereastra deloc.
 * Zilele sunt zile calendaristice Chișinău, nu UTC: o încărcare la 23:30 vara
 * cădea cu o zi mai devreme dacă se citea din ISO.
 */
export function segmentInFereastra(loadAt: string, unloadAt: string, zile: string[]): Segment | null {
  if (zile.length === 0) return null;
  const tLoad = Date.parse(loadAt);
  const tUnload = Date.parse(unloadAt);
  if (!Number.isFinite(tLoad) || !Number.isFinite(tUnload)) return null;

  const ziLoad = chisinauDayOf(loadAt);
  const ziUnload = chisinauDayOf(unloadAt);
  const prima = zile[0];
  const ultima = zile[zile.length - 1];

  // Comparație de șiruri: 'YYYY-MM-DD' se ordonează lexicografic corect.
  if (ziUnload < prima || ziLoad > ultima) return null;

  const idxLoad = zile.indexOf(ziLoad);
  const idxUnload = zile.indexOf(ziUnload);
  const start = idxLoad >= 0 ? idxLoad : 0;
  const sfarsit = idxUnload >= 0 ? idxUnload : zile.length - 1;

  return {
    start,
    span: Math.max(1, sfarsit - start + 1),
    taiatStanga: ziLoad < prima,
    taiatDreapta: ziUnload > ultima,
  };
}

/**
 * Cât din cursă a trecut, 0…1, după ceas. Serveşte punctului de pe bară care
 * arată unde e camionul; nu e o măsură GPS, ci timpul scurs din interval.
 */
export function progresCursa(loadAt: string, unloadAt: string, acumMs = Date.now()): number {
  const t0 = Date.parse(loadAt);
  const t1 = Date.parse(unloadAt);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return 0;
  if (acumMs <= t0) return 0;
  if (acumMs >= t1) return 1;
  return (acumMs - t0) / (t1 - t0);
}

/** Ultima stare din flux: după ea cursa e terminată. */
const STARE_FINALA = TRIP_FLOW[TRIP_FLOW.length - 1];

/**
 * Cursa a depășit ora de descărcare și încă nu e încheiată.
 * Stările vin din TRIP_FLOW, nu din literale — o listă proprie avea deja
 * «descarcata», stare care nu există nicăieri în flux.
 * `la_descarcare` RĂMÂNE întârziat: dacă mai stă sub descărcare după ora
 * planificată, întârzierea e reală și dispecerul trebuie s-o vadă. La fel
 * camionul plin care așteaptă: marfa n-a ajuns, întârzierea e a clientului.
 */
export function aIntarziat(unloadAt: string, status: string, acumMs = Date.now()): boolean {
  if (status === 'anulata' || status === STARE_FINALA) return false;
  const t = Date.parse(unloadAt);
  return Number.isFinite(t) && acumMs > t;
}

/** Cursa poate fi mutată doar cât n-a plecat: după aceea metricile GPS se leagă de ea. */
export function poateFiMutata(status: string): boolean {
  return status === TRIP_FLOW[0];
}

/**
 * Camionul e «în cursă» după STARE, nu după ceas — regula modulului din 31.08.
 * Camionul plin care așteaptă descărcarea e tot în cursă: nu e liber pentru
 * altă marfă, doar nu se mișcă.
 */
export function esteInCursa(status: string): boolean {
  if (status === STARE_ASTEAPTA_DESCARCARE) return true;
  const i = TRIP_FLOW.indexOf(status);
  return i > 0 && i < TRIP_FLOW.length - 1;
}

/** Camionul e plin și stă: cursa e deschisă, dar nu rulează. */
export function asteaptaDescarcarea(status: string): boolean {
  return status === STARE_ASTEAPTA_DESCARCARE;
}

/**
 * Împarte barele în benzi suprapuse: fiecare bandă ține doar segmente care nu se
 * ating, deci toate cursele se văd.
 *
 * Fără asta, o cursă care începe ÎN INTERIORUL alteia nu se desena niciodată:
 * cursa multi-zi care se întoarce dimineața și una nouă plecată în aceeași
 * după-amiază sunt amândouă legale (constrângerea din bază folosește interval
 * semideschis), dar a doua dispărea din ecran (review arhitectură, 01.09).
 */
export function asazaInBenzi<T extends { seg: Segment }>(elemente: T[]): T[][] {
  const benzi: { pana: number; lista: T[] }[] = [];
  for (const e of [...elemente].sort((a, b) => a.seg.start - b.seg.start)) {
    const loc = benzi.find((b) => b.pana <= e.seg.start);
    if (loc) {
      loc.lista.push(e);
      loc.pana = e.seg.start + e.seg.span;
    } else {
      benzi.push({ pana: e.seg.start + e.seg.span, lista: [e] });
    }
  }
  return benzi.map((b) => b.lista);
}

export type CamionBanda = {
  id: string;
  plate: string;
  fleetType: 'cisterna' | 'zernovoz' | null;
  driverId: string | null;
  driverName: string | null;
};

/**
 * Camioanele care au rând în bandă. Ion, 01.09: «чтобы машина без водителей не
 * показывала листья в календаре» — fără șofer nu lucrează, deci n-are ce planifica.
 *
 * Excepția e obligatorie: ORICE cursă din fereastră ține camionul în bandă, chiar
 * fără șofer. Altfel cursa devine invizibilă, dar constrângerea anti-suprapunere
 * din bază o vede în continuare, iar dispecerul primește «camionul are deja o
 * cursă» pentru o bară pe care n-o găsește nicăieri (audit business, 01.09).
 * Aceeași prioritate ca `coloanaKanban`, unde cursa activă bate lipsa șoferului.
 */
export function camioaneInBanda<T extends CamionBanda>(
  camioane: T[],
  curseInFereastra: { vehicleId: string }[],
): T[] {
  const cuCursa = new Set(curseInFereastra.map((c) => c.vehicleId));
  return camioane.filter((c) => c.driverId !== null || cuCursa.has(c.id));
}

/**
 * Unde e camionul, spus omenește: numele punctului cel mai apropiat din nomenclator.
 * Dispecerul nu citește coordonate — «la 3 km de Port Constanța» îi spune ceva,
 * «44.131, 28.616» nu (audit business, 01.09).
 */
export function undeEste(
  poz: { lat: number; lng: number; tara?: string | null },
  puncte: { name: string; lat: number | null; lng: number | null; radiusM?: number }[],
): string {
  let cel: { name: string; km: number } | null = null;
  for (const p of puncte) {
    if (p.lat === null || p.lng === null) continue;
    const km = haversineKm(poz, { lat: p.lat, lng: p.lng });
    if (!cel || km < cel.km) cel = { name: p.name, km };
  }
  // Țara vine calculată pe server (lib/lde/tara.ts) — Ion, 08.09: «când e în drum
  // pe traseu, trebuie numită țara». Fără ea textul rămâne cel vechi, nu ghicește.
  const tara = poz.tara ? ` prin ${poz.tara}` : '';
  if (!cel) return poz.tara ? `în ${poz.tara}, fără punct apropiat` : 'poziție cunoscută, fără punct apropiat';
  if (cel.km <= 1) return `la ${cel.name}`;
  if (cel.km <= 60) return `la ${Math.round(cel.km)} km de ${cel.name}${poz.tara ? ` (${poz.tara})` : ''}`;
  return `în drum${tara}, ${Math.round(cel.km)} km de ${cel.name}`;
}

/**
 * «Scena» camionului, într-o propoziție (Ion, 08.09): reparație, odihnă, la
 * descărcare în Moldova, la descărcare cu biodiesel în Bulgaria/România, altfel
 * unde e după GPS, cu țara. Ordinea e a dovezilor: starea de zi bate cursa,
 * starea cursei la punct bate GPS-ul (dispecerul sau automatul au spus-o),
 * GPS-ul rămâne pentru drum.
 */
export function scenaCamion(input: {
  stareZi: { state: 'reparatie' | 'odihna'; expectedEnd?: string | null } | null;
  cursa: { status: string; cargo: string | null; unloadPointName: string | null; unloadPointCountry?: string | null;
           loadPointName: string | null; loadPointCountry?: string | null } | null;
  poz: { lat: number; lng: number; tara?: string | null } | null;
  puncte: { name: string; lat: number | null; lng: number | null }[];
}): string {
  const { stareZi, cursa, poz, puncte } = input;
  if (stareZi?.state === 'reparatie') return stareZi.expectedEnd ? `în reparație, până la ${stareZi.expectedEnd}` : 'în reparație';
  if (stareZi?.state === 'odihna') return stareZi.expectedEnd ? `odihnă șofer, până la ${stareZi.expectedEnd}` : 'odihnă șofer';
  const cuTara = (nume: string | null, tara: string | null | undefined) =>
    nume ? (tara ? `${nume} (${tara})` : nume) : 'punct necunoscut';
  const marfa = cursa?.cargo ? ` ${cursa.cargo}` : '';
  if (cursa) {
    if (cursa.status === 'la_descarcare') return `la descărcare${marfa}, ${cuTara(cursa.unloadPointName, cursa.unloadPointCountry)}`;
    if (cursa.status === STARE_ASTEAPTA_DESCARCARE) return `plin${marfa}, așteaptă descărcarea la ${cuTara(cursa.unloadPointName, cursa.unloadPointCountry)}`;
    if (cursa.status === 'la_incarcare') return `la încărcare${marfa}, ${cuTara(cursa.loadPointName, cursa.loadPointCountry)}`;
  }
  if (!poz) return 'fără poziție GPS recentă';
  return undeEste(poz, puncte);
}

/**
 * «plin» = cisterna stă la BAZĂ cu marfa în ea: la bază descărcarea o dovedește
 * doar bonul TLX, nu GPS-ul (Ion, 10.09, ANT344: «dacă auto a venit de la România
 * și nu a apărut încă descărcat în TLX și stă la bază — starea este încărcat»).
 */
export type FazaCamion = 'la_incarcare' | 'in_drum' | 'la_descarcare' | 'plin';

/** Cât de aproape de punct înseamnă «la punct», când punctul n-are rază proprie. Aceeași măsură ca în `undeEste`. */
const RAZA_LA_PUNCT_KM = 1;

/**
 * Faza cursei deschise: la încărcare, în drum, la descărcare (Ion, 10.09: «este
 * la încărcare diesel» — despre un camion pe care ecranul îl arăta liber, pentru
 * că dispecerul nu apucase să treacă cursa din «planificată»).
 *
 * Ordinea dovezilor: starea bifată la punct e adevăr. Pe drum («spre …») și pe
 * «planificată» GPS-ul poate spune că camionul STĂ deja la punctul cursei — a
 * ajuns înaintea apăsării. Atunci faza vine din poziție, cu `dupaGps: true`.
 * Starea din bază NU se schimbă: se citește doar, ca omul să vadă adevărul, nu
 * ce s-a apucat să bifeze. «Planificată» cere ca ora de încărcare să fi trecut:
 * camionul care stă la bază cu cursa de mâine nu e «la încărcare».
 * Cursa plină care așteaptă, cea încheiată și cea anulată n-au fază.
 * Când locul de încărcare e scris liber (fără coordonate), GPS-ul nu poate fi
 * martor și planul decide: ora trecută = «în drum», cu `dupaPlan: true`.
 */
/** O oprire din istoricul GPS (lde_gps_stops), destul de lungă ca să fie o încărcare. */
export type OprireGps = { lat: number; lng: number; dwellMin: number; arrivalAt: string };

/** Sub o oră la punct nu e încărcare: cisterna se umple în ore, nu în minute. */
const OPRIRE_INCARCARE_MIN = 60;
/** Cât de devreme față de ora planificată poate ajunge camionul la încărcare și tot să conteze. */
const TOLERANTA_INCARCARE_MS = 24 * 3600_000;

/** `kind` = tipul punctului (migr. 335); «baza» schimbă «la descărcare» în «plin». */
export type PunctFaza = { lat: number | null; lng: number | null; radiusM?: number | null; kind?: string | null };

const areCoordonate = (p: PunctFaza | null): p is PunctFaza & { lat: number; lng: number } =>
  p !== null && p.lat !== null && p.lng !== null;

function inRazaPunctului(poz: { lat: number; lng: number }, p: PunctFaza | null): boolean {
  if (!p || p.lat === null || p.lng === null) return false;
  const razaKm = Math.max(RAZA_LA_PUNCT_KM, (p.radiusM ?? 0) / 1000);
  return haversineKm(poz, { lat: p.lat, lng: p.lng }) <= razaKm;
}

/**
 * Oprirea care dovedește încărcarea: în raza punctului, cel puțin o oră, nu
 * mai devreme de o zi față de ora planificată. Cea mai veche câștigă — e
 * momentul încărcării, nu ultima staționare.
 */
export function oprireaDeIncarcare(
  opriri: OprireGps[],
  loadPoint: PunctFaza | null,
  loadPlannedAt: string,
): OprireGps | null {
  const t = Date.parse(loadPlannedAt);
  if (!Number.isFinite(t)) return null;
  return opriri
    .filter((o) => o.dwellMin >= OPRIRE_INCARCARE_MIN
      && Date.parse(o.arrivalAt) >= t - TOLERANTA_INCARCARE_MS
      && inRazaPunctului(o, loadPoint))
    .sort((a, b) => Date.parse(a.arrivalAt) - Date.parse(b.arrivalAt))[0] ?? null;
}

export function fazaCamion(input: {
  cursa: {
    status: string;
    loadPlannedAt: string;
    loadPoint: PunctFaza | null;
    unloadPoint: PunctFaza | null;
    /** Marfa: doar carburantul cu bon TLX (diesel/benzină) rămâne «plin» la bază. */
    cargo?: string | null;
  };
  poz: { lat: number; lng: number } | null;
  /**
   * Istoricul opririlor camionului (Ion, 10.09: «MOW214 e în drum spre
   * descărcare biodiesel», deși cursa era «planificată» și ecranul zicea liber).
   * Cu el, cursa planificată al cărei camion a stat la încărcare și a plecat
   * devine «în drum», iar camionul care stă la punctul de descărcare FĂRĂ să fi
   * fost la încărcare rămâne liber — n-a plecat încă. Fără istoric (undefined)
   * se judecă doar după poziția de acum.
   */
  opriri?: OprireGps[];
  acumMs?: number;
}): { faza: FazaCamion; dupaGps: boolean; dupaPlan?: true } | null {
  const { cursa, poz, opriri } = input;
  const acumMs = input.acumMs ?? Date.now();
  const laPunct = (p: PunctFaza | null): boolean => poz !== null && inRazaPunctului(poz, p);
  const aIncarcat = (): boolean =>
    opriri === undefined || oprireaDeIncarcare(opriri, cursa.loadPoint, cursa.loadPlannedAt) !== null;
  // La punctul de descărcare: «la descărcare», dar la BAZĂ cisterna rămâne plină —
  // acolo doar bonul TLX spune că s-a descărcat (Ion, 10.09, ANT344).
  const marfa = (cursa.cargo ?? '').trim().toLowerCase();
  const plinLaBaza = cursa.unloadPoint?.kind === 'baza' && (marfa === 'diesel' || marfa === 'benzina');
  const laDescarcare = (): { faza: FazaCamion; dupaGps: true } =>
    ({ faza: plinLaBaza ? 'plin' : 'la_descarcare', dupaGps: true });

  switch (cursa.status) {
    case 'la_incarcare': return { faza: 'la_incarcare', dupaGps: false };
    case 'la_descarcare': return { faza: 'la_descarcare', dupaGps: false };
    case 'spre_incarcare':
      return laPunct(cursa.loadPoint) ? { faza: 'la_incarcare', dupaGps: true } : { faza: 'in_drum', dupaGps: false };
    case 'spre_descarcare':
      return laPunct(cursa.unloadPoint) ? laDescarcare() : { faza: 'in_drum', dupaGps: false };
    case TRIP_FLOW[0]: {
      const t = Date.parse(cursa.loadPlannedAt);
      if (!Number.isFinite(t) || acumMs < t) return null;
      if (laPunct(cursa.loadPoint)) return { faza: 'la_incarcare', dupaGps: true };
      // Locul de încărcare scris liber, fără coordonate (RWN169: «Santier Nutu
      // Ivanovici» → «el amu la Romanie», Ion, 10.09: «cum poate fi el liber???»):
      // GPS-ul n-are cu ce să confirme sau să infirme încărcarea, deci planul e
      // singurul martor — ora de încărcare a trecut, camionul e în drum «după plan».
      if (!areCoordonate(cursa.loadPoint)) {
        return laPunct(cursa.unloadPoint) ? laDescarcare() : { faza: 'in_drum', dupaGps: false, dupaPlan: true };
      }
      if (!aIncarcat()) return null;
      if (laPunct(cursa.unloadPoint)) return laDescarcare();
      // A stat la încărcare și nu mai e acolo: e plin și pe drum. Fără istoric nu
      // se ajunge aici cu opriri goale — `aIncarcat` e true doar când istoricul
      // lipsește, iar atunci poziția de acum nu spune că a plecat de undeva.
      return opriri !== undefined ? { faza: 'in_drum', dupaGps: true } : null;
    }
    default: return null;
  }
}

export type GrupBanda<T> = { cheie: 'cisterna' | 'zernovoz' | 'fara_tip'; nume: string; camioane: T[] };

const NUME_GRUP: Record<GrupBanda<unknown>['cheie'], string> = {
  cisterna: 'Cisterne',
  zernovoz: 'Zernovoz',
  fara_tip: 'Fără tip stabilit',
};

/** Rândurile se grupează pe tipul camionului: dispecerul nu pune motorină în zernovoz. */
export function grupeazaPeTip<T extends CamionBanda>(camioane: T[]): GrupBanda<T>[] {
  const ordine: GrupBanda<T>['cheie'][] = ['cisterna', 'zernovoz', 'fara_tip'];
  return ordine
    .map((cheie) => ({
      cheie,
      nume: NUME_GRUP[cheie],
      camioane: camioane.filter((c) => (c.fleetType ?? 'fara_tip') === cheie),
    }))
    .filter((g) => g.camioane.length > 0);
}

/**
 * Ziua de sfârșit propusă la mutarea unei curse: păstrează durata.
 * Trasul barei mută începutul; sfârșitul îl calculăm, altfel dispecerul ar
 * trebui să rescrie a doua dată de fiecare dată.
 */
export function mutaPastrandDurata(loadAt: string, unloadAt: string, ziNoua: string): { load: string; unload: string } | null {
  const t0 = Date.parse(loadAt);
  const t1 = Date.parse(unloadAt);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ziNoua)) return null;

  const ziVeche = chisinauDayOf(loadAt);
  if (ziVeche === ziNoua) return { load: loadAt, unload: unloadAt };

  // Se păstrează ORA LOCALĂ, nu numărul de milisecunde: la trecerea la ora de
  // iarnă un decalaj în milisecunde muta încărcarea de la 07:00 la 06:00.
  const ziUnloadVeche = chisinauDayOf(unloadAt);
  const zileIntreCapete = Math.round(
    (Date.parse(`${ziUnloadVeche}T12:00:00Z`) - Date.parse(`${ziVeche}T12:00:00Z`)) / 86400000,
  );
  if (!Number.isFinite(zileIntreCapete) || zileIntreCapete < 0) return null;

  const dUnload = new Date(`${ziNoua}T12:00:00Z`);
  dUnload.setUTCDate(dUnload.getUTCDate() + zileIntreCapete);
  const ziUnloadNoua = dUnload.toISOString().slice(0, 10);

  return {
    load: chisinauInstantIso(ziNoua, chisinauTimeOf(loadAt)),
    unload: chisinauInstantIso(ziUnloadNoua, chisinauTimeOf(unloadAt)),
  };
}
