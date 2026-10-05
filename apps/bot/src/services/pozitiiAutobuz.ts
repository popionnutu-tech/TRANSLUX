// ION-251: poziția autobuzului unei curse, din fereastra «Acum» a site-ului (panoul: GET /api/asistent-site/acum).
// Același răspuns ca pe translux.md, deci aceeași poartă: punctul doar pentru mașina cursei de azi, pe drum după grafic.
// Botul mai cere în plus ca punctul să fie GPS real (nu estimat pe linie) și de cel mult 10 minute.

/** Cât de vechi poate fi punctul GPS ca să-l trimitem clientului drept «acum». */
export const PUNCT_MAX_VECHIME_MS = 10 * 60_000;
/** Ceasul panoului și al botului pot diferi puțin: punctul «din viitor» până la atât e tot proaspăt. */
const TOLERANTA_CEAS_MS = 60_000;
const TIMEOUT_MS = 10_000;
/** Panoul răspunde doar originilor site-ului (CORS-ul lui e și poarta). */
const ORIGINE_SITE = 'https://www.translux.md';
const ZI_MIN = 24 * 60;
const FUS = 'Europe/Chisinau';

/** O cursă din răspunsul «Acum» (doar câmpurile folosite de bot). */
export interface CursaAcum {
  departure: string;
  lat?: number;
  lon?: number;
  driver?: string | null;
  plate?: string | null;
  near?: string | null;
  /** Ora punctului «HH:MM» (Chișinău). */
  at?: string;
  /** Momentul punctului, ISO (vine din același obiect al poziției). */
  atIso?: string;
  /** Punct pus pe linie după grafic, fără GPS — nu e «acum». */
  estimated?: boolean;
}

/** Punctul trimis clientului. */
export interface PozitieAutobuz {
  lat: number;
  lon: number;
  near: string | null;
  /** Ora punctului «HH:MM», Chișinău. */
  at: string;
  driver: string | null;
  plate: string | null;
}

export interface SursaPozitii {
  /** Cursele «Acum» de azi pe perechea de localități; aruncă dacă panoul nu răspunde. */
  curse(from: string, to: string): Promise<CursaAcum[]>;
}

export class PanouIndisponibilError extends Error {
  constructor(detaliu: string) {
    super(`asistent-site/acum: ${detaliu}`);
    this.name = 'PanouIndisponibilError';
  }
}

/** Ora Chișinăului «HH:MM» a unui moment ISO (ca `departure` din «Acum»). Pur, testat. */
export function oraChisinau(isoOrMs: string | number): string {
  return new Date(isoOrMs).toLocaleTimeString('en-GB', { timeZone: FUS, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

function minuteDinOra(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Vechimea punctului în ms: din ISO dacă există, altfel din «HH:MM» față de ora Chișinăului de acum. */
function vechimeMs(c: CursaAcum, nowMs: number): number | null {
  if (c.atIso) {
    const t = Date.parse(c.atIso);
    return Number.isFinite(t) ? nowMs - t : null;
  }
  const la = c.at ? minuteDinOra(c.at) : null;
  const acum = minuteDinOra(oraChisinau(nowMs));
  if (la == null || acum == null) return null;
  // Diferența pe cadranul de 24 h, adusă în (−12 h, 12 h]: punctul de la 23:58 văzut la 00:03 are 5 minute.
  const dif = ((acum - la) % ZI_MIN + ZI_MIN) % ZI_MIN;
  return (dif > ZI_MIN / 2 ? dif - ZI_MIN : dif) * 60_000;
}

/**
 * Punctul proaspăt al cursei biletului: `departure` = ora plecării biletului, GPS real (nu estimat), de cel mult
 * 10 minute. Altfel null (botul reîncearcă la tickul următor). Pur, testat.
 */
export function alegePozitie(curse: readonly CursaAcum[], oraPlecare: string, nowMs: number): PozitieAutobuz | null {
  for (const c of curse) {
    if (c.departure !== oraPlecare || c.estimated || c.lat == null || c.lon == null) continue;
    const vechime = vechimeMs(c, nowMs);
    if (vechime == null || vechime > PUNCT_MAX_VECHIME_MS || vechime < -TOLERANTA_CEAS_MS) continue;
    return {
      lat: c.lat, lon: c.lon, near: c.near ?? null,
      at: c.at ?? oraChisinau(c.atIso as string),
      driver: c.driver ?? null, plate: c.plate ?? null,
    };
  }
  return null;
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export function creeazaSursaPozitii(baseUrl: string, fetchFn: FetchFn = fetch): SursaPozitii {
  return {
    async curse(from, to) {
      const url = `${baseUrl}/api/asistent-site/acum?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const r = await fetchFn(url, { headers: { Origin: ORIGINE_SITE }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!r.ok) throw new PanouIndisponibilError(`HTTP ${r.status}`);
      const corp = (await r.json()) as { trips?: unknown };
      if (!Array.isArray(corp.trips)) throw new PanouIndisponibilError('răspuns fără trips');
      return corp.trips as CursaAcum[];
    },
  };
}
