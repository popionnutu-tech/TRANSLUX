// Banda de timp a flotei: rândul e camionul, coloanele sunt zilele, cursa e o bară.
// Ion, 01.09: «лучше сделать ленту времени» — un singur ecran în locul a două.
//
// Funcții pure: primesc cursele și zilele, întorc poziția barelor. Fără I/O,
// ca să poată fi testate pe cazurile care ne-au mușcat deja (cursa multi-zi
// tăiată de marginea ferestrei, cursa care începe înaintea ferestrei).
import { chisinauDayOf, chisinauInstantIso, chisinauTimeOf } from '../chisinau-time';
import { TRIP_FLOW, haversineKm } from './camioane';

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
 * planificată, întârzierea e reală și dispecerul trebuie s-o vadă.
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

/** Camionul e «în cursă» după STARE, nu după ceas — regula modulului din 31.08. */
export function esteInCursa(status: string): boolean {
  const i = TRIP_FLOW.indexOf(status);
  return i > 0 && i < TRIP_FLOW.length - 1;
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
  poz: { lat: number; lng: number },
  puncte: { name: string; lat: number | null; lng: number | null; radiusM?: number }[],
): string {
  let cel: { name: string; km: number } | null = null;
  for (const p of puncte) {
    if (p.lat === null || p.lng === null) continue;
    const km = haversineKm(poz, { lat: p.lat, lng: p.lng });
    if (!cel || km < cel.km) cel = { name: p.name, km };
  }
  if (!cel) return 'poziție cunoscută, fără punct apropiat';
  if (cel.km <= 1) return `la ${cel.name}`;
  if (cel.km <= 60) return `la ${Math.round(cel.km)} km de ${cel.name}`;
  return `în drum, ${Math.round(cel.km)} km de ${cel.name}`;
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
