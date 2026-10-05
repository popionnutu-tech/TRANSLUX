import { config } from '../config.js';
import type { Limba } from '../types.js';

// ION-244: clientul HTTP al botului spre panou (central-hub) pentru returnarea biletului online.
// Contractul e fixat în docs/plans/2026-10-05-retur-bot-ai.md, «Contractul API panou ↔ bot». Botul NU calculează
// sume și NU cheamă banca: panoul face oferta din grilă, anularea și refund-ul. Aici doar transport + validarea
// formei răspunsului; orice formă necunoscută devine eroare, nu se ghicește.
// `telegram_id` vine de la apelant, care îl ia DOAR din `ctx.from.id` (niciodată din callback_data).

/** La `confirma` panoul vorbește cu banca: așteptăm mai mult; în rest 10 s. */
export const TIMEOUT_CONFIRMA_MS = 25_000;
export const TIMEOUT_IMPLICIT_MS = 10_000;

export type EroarePanou = 'indisponibil' | 'timeout' | 'retea' | 'http' | 'raspuns_invalid';

/** Rezultatul transportului: răspunsul validat al panoului sau motivul pentru care nu există. */
export type RezultatPanou<T> = { tip: 'raspuns'; raspuns: T } | { tip: 'eroare'; eroare: EroarePanou; status?: number };

export interface BiletLegat {
  cod: string;
  status: string;
  lang: Limba;
  from_name: string;
  to_name: string;
  departure_at: string;
  seats: number;
  total: number;
}

export interface OfertaRetur {
  oferta_id: string;
  suma: number;
  total: number;
  noimi: number;
  expira_la: string;
  departure_at: string;
  from_name: string;
  to_name: string;
  lang: Limba;
}

export type MotivFaraBani = 'sub_4h' | 'plecat' | 'urcat';
export type MotivDispecer = 'sub_10' | 'blocat';
export type CodRefuzOferta = 'nelegat' | 'stare' | 'inexistent';

export type RaspunsOferta =
  | ({ tip: 'oferta' } & OfertaRetur)
  | { tip: 'cere_cifre' }
  | { tip: 'fara_bani'; motiv: MotivFaraBani }
  | { tip: 'dispecer'; motiv: MotivDispecer }
  | { tip: 'cifre_gresite'; ramase: number }
  | { tip: 'refuz'; cod: CodRefuzOferta };

export const STARI_RETUR = [
  'creat', 'finalizat', 'necunoscut', 'refuz', 'refuz_banca', 'in_curs', 'nedeterminat', 'expirata', 'neatinsa',
  // panoul răspunde {ok:false, cod:'inexistent'} pentru oferta altui cont / necunoscută (16′: «Nu găsesc cererea»)
  'inexistent',
] as const;
export type StareRetur = (typeof STARI_RETUR)[number];

export interface RaspunsStare {
  stare: StareRetur;
  suma: number | null;
  motiv?: string;
}

export type MotivEscaladare = 'vina_noastra' | 'altceva';

export interface PanouBilete {
  bilete(telegramId: number): Promise<RezultatPanou<BiletLegat[]>>;
  oferta(telegramId: number, cod: string, cifre?: string): Promise<RezultatPanou<RaspunsOferta>>;
  confirma(telegramId: number, ofertaId: string): Promise<RezultatPanou<RaspunsStare>>;
  stare(telegramId: number, ofertaId: string): Promise<RezultatPanou<RaspunsStare>>;
  escaladeaza(p: { telegramId: number; cod?: string; text: string; motiv: MotivEscaladare }): Promise<RezultatPanou<true>>;
}

export interface OptiuniPanou {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

// ── Validarea formei (pure, testate) ─────────────────────────────────────────────────────────────

type Obiect = Record<string, unknown>;

const esteObiect = (v: unknown): v is Obiect => typeof v === 'object' && v !== null && !Array.isArray(v);
const esteText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const esteNumar = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const limba = (v: unknown): Limba => (v === 'ru' ? 'ru' : 'ro');
const dinLista = <T extends string>(lista: readonly T[], v: unknown): v is T => typeof v === 'string' && (lista as readonly string[]).includes(v);

const MOTIVE_FARA_BANI = ['sub_4h', 'plecat', 'urcat'] as const;
const MOTIVE_DISPECER = ['sub_10', 'blocat'] as const;
const CODURI_REFUZ = ['nelegat', 'stare', 'inexistent'] as const;

function citesteBilet(v: unknown): BiletLegat | null {
  if (!esteObiect(v)) return null;
  const { cod, status, from_name, to_name, departure_at, seats, total } = v;
  if (!esteText(cod) || !esteText(status) || !esteText(from_name) || !esteText(to_name) || !esteText(departure_at)) return null;
  if (!esteNumar(seats) || !esteNumar(total)) return null;
  return { cod, status, lang: limba(v.lang), from_name, to_name, departure_at, seats, total };
}

export function citesteBilete(corp: unknown): BiletLegat[] | null {
  if (!esteObiect(corp) || corp.ok !== true || !Array.isArray(corp.bilete)) return null;
  const bilete = corp.bilete.map(citesteBilet);
  return bilete.every((b): b is BiletLegat => b !== null) ? bilete : null;
}

function citesteOfertaPropriuZisa(c: Obiect): RaspunsOferta | null {
  const { oferta_id, suma, total, noimi, expira_la, departure_at, from_name, to_name } = c;
  if (!esteText(oferta_id) || !esteText(expira_la) || !esteText(departure_at) || !esteText(from_name) || !esteText(to_name)) return null;
  if (!esteNumar(suma) || !esteNumar(total) || !esteNumar(noimi) || suma <= 0) return null;
  return { tip: 'oferta', oferta_id, suma, total, noimi, expira_la, departure_at, from_name, to_name, lang: limba(c.lang) };
}

export function citesteOferta(corp: unknown): RaspunsOferta | null {
  if (!esteObiect(corp)) return null;
  if (corp.ok === false) {
    if (corp.cod === 'cifre_gresite') return { tip: 'cifre_gresite', ramase: esteNumar(corp.ramase) ? Math.max(0, corp.ramase) : 0 };
    return dinLista(CODURI_REFUZ, corp.cod) ? { tip: 'refuz', cod: corp.cod } : null;
  }
  if (corp.ok !== true) return null;
  switch (corp.tip) {
    case 'oferta': return citesteOfertaPropriuZisa(corp);
    case 'cere_cifre': return { tip: 'cere_cifre' };
    case 'fara_bani': return dinLista(MOTIVE_FARA_BANI, corp.motiv) ? { tip: 'fara_bani', motiv: corp.motiv } : null;
    case 'dispecer': return dinLista(MOTIVE_DISPECER, corp.motiv) ? { tip: 'dispecer', motiv: corp.motiv } : null;
    default: return null;
  }
}

export function citesteStare(corp: unknown): RaspunsStare | null {
  if (esteObiect(corp) && corp.ok === false && corp.cod === 'inexistent') return { stare: 'inexistent', suma: null };
  if (!esteObiect(corp) || !dinLista(STARI_RETUR, corp.stare)) return null;
  const motiv = typeof corp.motiv === 'string' ? corp.motiv : undefined;
  return { stare: corp.stare, suma: esteNumar(corp.suma) ? corp.suma : null, ...(motiv ? { motiv } : {}) };
}

export function citesteEscaladare(corp: unknown): true | null {
  return esteObiect(corp) && corp.ok === true ? true : null;
}

// ── Transportul ──────────────────────────────────────────────────────────────────────────────────

function esteTimeout(e: unknown): boolean {
  return e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
}

async function corpJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** O cerere spre panou: metoda, calea, corpul JSON și cât o așteptăm. */
export interface CererePanou { metoda: 'GET' | 'POST'; cale: string; corp?: unknown; timeoutMs: number }

/** Transportul comun spre panou (cheia botului, timeout, validarea corpului); îl folosesc și plângerile (ION-252). */
export type TransportPanou = <T>(cerere: CererePanou, citeste: (corp: unknown) => T | null) => Promise<RezultatPanou<T>>;

/**
 * Transportul (dependențele injectate, pentru teste). Răspunsurile de domeniu cu `ok:false` (ex. cifre greșite)
 * pot veni cu 4xx: se validează corpul indiferent de status; un corp care nu se potrivește contractului → `http`
 * (dacă statusul e de eroare) sau `raspuns_invalid`.
 */
export function creeazaTransportPanou(opt: OptiuniPanou): TransportPanou {
  const fetchImpl = opt.fetchImpl ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const configurat = Boolean(opt.baseUrl && opt.apiKey);

  return async function cheama<T>(cerere: CererePanou, citeste: (corp: unknown) => T | null): Promise<RezultatPanou<T>> {
    if (!configurat) return { tip: 'eroare', eroare: 'indisponibil' };
    let res: Response;
    try {
      res = await fetchImpl(`${opt.baseUrl}${cerere.cale}`, {
        method: cerere.metoda,
        headers: { Authorization: `Bearer ${opt.apiKey}`, ...(cerere.corp ? { 'Content-Type': 'application/json' } : {}) },
        body: cerere.corp ? JSON.stringify(cerere.corp) : undefined,
        signal: AbortSignal.timeout(cerere.timeoutMs),
      });
    } catch (e) {
      return { tip: 'eroare', eroare: esteTimeout(e) ? 'timeout' : 'retea' };
    }
    let corp: unknown;
    try {
      corp = await corpJson(res);
    } catch (e) {
      return { tip: 'eroare', eroare: esteTimeout(e) ? 'timeout' : 'retea', status: res.status };
    }
    const raspuns = citeste(corp);
    if (raspuns !== null) return { tip: 'raspuns', raspuns };
    return { tip: 'eroare', eroare: res.ok ? 'raspuns_invalid' : 'http', status: res.status };
  };
}

export function creeazaPanouBilete(opt: OptiuniPanou): PanouBilete {
  const cheama = creeazaTransportPanou(opt);
  return {
    bilete: (telegramId) =>
      cheama({ metoda: 'POST', cale: '/api/bilete/retur/bilete', corp: { telegram_id: telegramId }, timeoutMs: TIMEOUT_IMPLICIT_MS }, citesteBilete),
    oferta: (telegramId, cod, cifre) =>
      cheama(
        { metoda: 'POST', cale: '/api/bilete/retur/oferta', corp: { telegram_id: telegramId, cod, ...(cifre ? { cifre } : {}) }, timeoutMs: TIMEOUT_IMPLICIT_MS },
        citesteOferta,
      ),
    confirma: (telegramId, ofertaId) =>
      cheama(
        { metoda: 'POST', cale: '/api/bilete/retur/confirma', corp: { telegram_id: telegramId, oferta_id: ofertaId }, timeoutMs: TIMEOUT_CONFIRMA_MS },
        citesteStare,
      ),
    stare: (telegramId, ofertaId) => {
      const q = new URLSearchParams({ oferta_id: ofertaId, telegram_id: String(telegramId) });
      return cheama({ metoda: 'GET', cale: `/api/bilete/retur/stare?${q}`, timeoutMs: TIMEOUT_IMPLICIT_MS }, citesteStare);
    },
    escaladeaza: ({ telegramId, cod, text, motiv }) =>
      cheama(
        { metoda: 'POST', cale: '/api/bilete/retur/escaladeaza', corp: { telegram_id: telegramId, ...(cod ? { cod } : {}), text, motiv }, timeoutMs: TIMEOUT_IMPLICIT_MS },
        citesteEscaladare,
      ),
  };
}

/** Clientul botului, din variabilele de mediu (ADMIN_BASE_URL, BILETE_BOT_API_KEY). */
export const panouBilete: PanouBilete = creeazaPanouBilete({ baseUrl: config.adminBaseUrl, apiKey: config.bileteBotApiKey });
