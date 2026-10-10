import 'server-only';
import { CONFIG_INCHIS, parseazaConfig, parseazaPuncte, type ConfigBilete } from './bilete-reguli';
import { parseazaLocuri, type LocuriCursa } from './locuri';

// Biletele online pe translux.md (ION-197): site-ul NU scrie în bază (are doar cheia anon) — vorbește cu panoul
// central-hub, care ține comenzile, plata maib și biletele. Secretul rămâne pe server (BILETE_API_KEY, doar aici).
// Configurația vânzării vine tot de la panou; fără răspuns = vânzare ÎNCHISĂ (nimic nu se vinde pe orb).

const BAZA = (process.env.CENTRAL_HUB_URL || 'https://central-hub-md.vercel.app').replace(/\/+$/, '');
const TIMEOUT_MS = 8_000;
const CACHE_CONFIG_MS = 60_000;

export type { ConfigBilete };

let cacheConfig: { la: number; cfg: ConfigBilete } | null = null;

export async function configBilete(): Promise<ConfigBilete> {
  if (cacheConfig && Date.now() - cacheConfig.la < CACHE_CONFIG_MS) return cacheConfig.cfg;
  try {
    const r = await fetch(`${BAZA}/api/bilete/public/config`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cfg = parseazaConfig(await r.json());
    cacheConfig = { la: Date.now(), cfg };
    return cfg;
  } catch (e) {
    console.warn('[bilete] config indisponibil → vânzare închisă:', e instanceof Error ? e.message : e);
    return CONFIG_INCHIS;
  }
}

// Punctele de urcare ale unei localități (ION-198), cu perechile lor (rută, sens). Cache 60 s pe localitate; orice
// eroare = listă goală, adică formularul nu întreabă nimic (comanda merge, panoul pune punctul principal).
const CACHE_PUNCTE_MS = 60_000;
const cachePuncte = new Map<string, { la: number; puncte: ReturnType<typeof parseazaPuncte> }>();

export async function puncteUrcare(nameRo: string): Promise<ReturnType<typeof parseazaPuncte>> {
  const k = nameRo.trim();
  if (!k || k.length > 80) return [];
  const c = cachePuncte.get(k);
  if (c && Date.now() - c.la < CACHE_PUNCTE_MS) return c.puncte;
  try {
    const r = await fetch(`${BAZA}/api/bilete/public/puncte?de=${encodeURIComponent(k)}`, { signal: AbortSignal.timeout(TIMEOUT_MS / 2), cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const puncte = parseazaPuncte(await r.json());
    if (cachePuncte.size > 300) cachePuncte.clear();
    cachePuncte.set(k, { la: Date.now(), puncte });
    return puncte;
  } catch (e) {
    console.warn('[bilete] puncte de urcare indisponibile:', e instanceof Error ? e.message : e);
    return [];
  }
}

// Harta locurilor unei curse din Chișinău spre nord (ION-242): ce locuri sunt deja luate. Fără cache — se cere la
// deschiderea formularului și la fiecare 30 s cât e harta pe ecran. Orice eroare (și 404 cât panoul n-are încă
// endpoint-ul) = null: formularul spune «locurile se aleg la urcare» și vânzarea merge FĂRĂ alegere.
export async function locuriCursa(crmRouteId: number, tripDate: string, goingNorth: boolean): Promise<LocuriCursa | null> {
  const q = new URLSearchParams({ crm_route_id: String(crmRouteId), trip_date: tripDate, going_north: String(goingNorth) });
  try {
    const r = await fetch(`${BAZA}/api/bilete/public/locuri?${q}`, { signal: AbortSignal.timeout(TIMEOUT_MS / 2), cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return parseazaLocuri(await r.json());
  } catch (e) {
    console.warn('[bilete] harta locurilor indisponibilă:', e instanceof Error ? e.message : e);
    return null;
  }
}

export interface ComandaBiletInput {
  tripDate: string;
  crmRouteId: number;
  goingNorth: boolean;
  fromRo: string;
  toRo: string;
  seats: number;
  passengerName: string;
  phone: string;
  email: string | null;
  lang: 'ro' | 'ru';
  idempotencyKey: string;
  ipHash: string | null;
  /** ION-198: punctul de urcare ales (null = panoul pune punctul principal, dacă există). */
  punctUrcareId: number | null;
  /** ION-242: locurile alese pe hartă (doar spre nord; null = panoul dă locul la emitere). */
  locuriAlese: number[] | null;
  /** ION-249: cumpărat din mini app-ul Telegram — initData-ul contului; panoul îl verifică și leagă comanda de cont. */
  telegramInitData?: string | null;
  /** 546: promoția retur −20% — codul de retur al turului (din pagina biletului tur). */
  codRetur?: string | null;
  /** 546: promoția student −20% — jetonul primit după verificarea carnetului. */
  studentJeton?: string | null;
  /** 548: returul din tur-retur, plătit în aceeași sesiune cu turul. */
  retur?: { tripDate: string; crmRouteId: number; goingNorth: boolean; fromRo: string; toRo: string; idempotencyKey: string; locuriAlese?: number[] | null } | null;
  /** 550: cheia turului din încercarea de dinainte a acestui browser (alegerea s-a schimbat). */
  inlocuieste?: string[] | null;
}

export type RaspunsComanda =
  | { ok: true; checkoutUrl: string; cod: string }
  | { ok: false; status: number; cod?: string; eroare: string; /** la 409 loc_ocupat: locurile luate între timp */ ocupate?: number[] };

export async function comandaBilet(input: ComandaBiletInput): Promise<RaspunsComanda> {
  const cheie = process.env.BILETE_API_KEY;
  if (!cheie) return { ok: false, status: 500, cod: 'config', eroare: 'BILETE_API_KEY lipsește' };
  // Panoul primește locurile ca `locuri_alese` (contractul ION-239); fără alegere câmpul lipsește.
  const { locuriAlese, telegramInitData, ...corp } = input;
  try {
    const r = await fetch(`${BAZA}/api/bilete/comanda`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${cheie}`,
        ...(telegramInitData ? { 'X-Telegram-Init-Data': telegramInitData } : {}),
      },
      body: JSON.stringify(locuriAlese ? { ...corp, locuri_alese: locuriAlese } : corp),
      signal: AbortSignal.timeout(TIMEOUT_MS * 4), // crearea sesiunii la bancă poate dura
      cache: 'no-store',
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.ok && j.checkoutUrl) return { ok: true, checkoutUrl: String(j.checkoutUrl), cod: String(j.cod ?? '') };
    // 409 {eroare:'loc_ocupat', ocupate:[…]}: codul vine în `eroare` (sau în `cod`, ca la celelalte erori).
    if (r.status === 409 && (j?.cod === 'loc_ocupat' || j?.eroare === 'loc_ocupat')) {
      const ocupate = Array.isArray(j?.ocupate) ? (j.ocupate as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
      return { ok: false, status: 409, cod: 'loc_ocupat', eroare: 'loc_ocupat', ocupate };
    }
    return { ok: false, status: r.status, cod: typeof j?.cod === 'string' ? j.cod : undefined, eroare: String(j?.eroare ?? `HTTP ${r.status}`) };
  } catch (e) {
    return { ok: false, status: 503, cod: 'maib', eroare: e instanceof Error ? e.message : String(e) };
  }
}

export interface BiletPublic {
  nr: number;
  /** ION-239: locul din autobuz (1 față, 2–16 rânduri, 17–20 spate); lipsește la panoul vechi, null = fără loc. */
  loc_nr?: number | null;
  cod_qr: string;
  status: 'valid' | 'urcat' | 'anulat' | 'returnat';
  urcat_at: string | null;
  qr_svg: string;
}

export interface ComandaPublica {
  cod: string;
  /** ION-235: numărul comenzii (primele 8 caractere ale id-ului). */
  numar?: string;
  status: 'noua' | 'platita' | 'expirata' | 'eroare_creare' | 'anulata' | 'returnata' | 'platita_fara_bilet';
  trip_date: string;
  from_name: string;
  to_name: string;
  departure_at: string;
  /** ION-236: ora sosirii din grafic, «HH:MM»; lipsește la panoul vechi. */
  sosire?: string | null;
  seats: number;
  price_per_seat: number;
  total: number;
  passenger_name: string;
  lang: 'ro' | 'ru';
  paid_at: string | null;
  cancelled_at: string | null;
  ruta: { id: number; nume_ro: string; nume_ru: string } | null;
  punct_urcare?: { nume_ro: string; nume_ru: string; lat: number; lon: number } | null;
  /** Comandă de probă (migr. 532): pe bilet scrie «BILET DE PROBĂ — NU E VALABIL LA URCARE». */
  proba?: boolean;
  /** Echipajul cursei (migr. 538): după bifa dispecerului placa + prenumele șoferului (+ telefonul cu 3 h înainte de plecare). */
  echipaj?: { stare: 'astept' | 'anulat' | 'gata'; placa: string | null; sofer: string | null; telefon: string | null } | null;
  /** 546: reducerea aplicată și codul de retur (doar pe turul plătit al perechii Bălți ⇄ Chișinău). */
  reducere?: { tip: 'retur' | 'student'; pret_intreg: number } | null;
  cod_retur?: string | null;
  /** 548: celălalt bilet din tur-retur (plătit o dată). */
  pachet?: { cod: string; sens: 'retur' | 'tur'; trip_date: string; departure_at: string; from_name: string; to_name: string } | null;
  bilete: BiletPublic[];
}

/** null = nu există; 'indisponibil' = panoul nu răspunde (pagina spune asta, nu «nu există»). */
export async function biletPublic(cod: string): Promise<ComandaPublica | null | 'indisponibil'> {
  if (!/^[0-9a-f]{32}$/i.test(cod)) return null;
  try {
    const r = await fetch(`${BAZA}/api/bilete/public/${cod}`, { signal: AbortSignal.timeout(TIMEOUT_MS * 2), cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) return 'indisponibil';
    const j = await r.json();
    return j?.ok && j.comanda ? (j.comanda as ComandaPublica) : null;
  } catch {
    return 'indisponibil';
  }
}

// Biletele clientului în mini app-ul Telegram (ION-249): serverul site-ului trimite panoului initData-ul primit de la
// pagină (X-Telegram-Init-Data) împreună cu BILETE_API_KEY; panoul verifică HMAC-ul cu tokenul botului și întoarce
// doar comenzile contului. Site-ul nu ține tokenul botului și nu decide identitatea.
export type EroareBileteClient = 'neautentificat' | 'expirat' | 'prea_multe' | 'indisponibil';

export type RaspunsBileteClient =
  | { ok: true; bilete: ComandaPublica[]; contact: unknown; istoric: unknown }
  | { ok: false; eroare: EroareBileteClient };

const ERORI_PANOU: Record<number, EroareBileteClient> = { 401: 'neautentificat', 429: 'prea_multe' };

export async function bileteleClientuluiTelegram(initData: string): Promise<RaspunsBileteClient> {
  const cheie = process.env.BILETE_API_KEY;
  if (!cheie) {
    console.error('[bilete] BILETE_API_KEY lipsește');
    return { ok: false, eroare: 'indisponibil' };
  }
  try {
    const r = await fetch(`${BAZA}/api/bilete/client/bilete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cheie}`, 'X-Telegram-Init-Data': initData },
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
      cache: 'no-store',
    });
    const j = await r.json().catch(() => null) as { ok?: boolean; bilete?: unknown; contact?: unknown; istoric?: unknown; eroare?: unknown } | null;
    if (r.ok && j?.ok && Array.isArray(j.bilete)) return { ok: true, bilete: j.bilete as ComandaPublica[], contact: j.contact ?? null, istoric: j.istoric ?? [] };
    if (r.status === 401 && j?.eroare === 'expirat') return { ok: false, eroare: 'expirat' };
    // «neautorizat» = cheia site-ului nu se potrivește cu a panoului: e configurarea noastră, nu clientul.
    if (r.status === 401 && j?.eroare === 'neautorizat') {
      console.error('[bilete] panoul a refuzat BILETE_API_KEY la biletele clientului');
      return { ok: false, eroare: 'indisponibil' };
    }
    return { ok: false, eroare: ERORI_PANOU[r.status] ?? 'indisponibil' };
  } catch (e) {
    console.warn('[bilete] biletele clientului indisponibile:', e instanceof Error ? e.message : e);
    return { ok: false, eroare: 'indisponibil' };
  }
}

// ── Promoțiile Bălți ⇄ Chișinău (migr. 546) ───────────────────────────────────────────────────────────────────────

export interface IntrarePret {
  tripDate: string; crmRouteId: number; goingNorth: boolean; fromRo: string; toRo: string; seats: number;
  phone: string; passengerName: string; codRetur?: string | null; studentJeton?: string | null;
}
export interface RaspunsPret { pretIntreg: number; pret: number; reducere: 'retur' | 'student' | null; mesaj: string | null }

/** Cota de preț a panoului (nu creează nimic); null = indisponibilă → formularul arată prețul întreg. */
export async function pretCuReducere(input: IntrarePret): Promise<RaspunsPret | null> {
  const cheie = process.env.BILETE_API_KEY;
  if (!cheie) return null;
  try {
    const r = await fetch(`${BAZA}/api/bilete/pret`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cheie}` },
      body: JSON.stringify(input), signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store',
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) return null;
    return { pretIntreg: Number(j.pretIntreg), pret: Number(j.pret), reducere: j.reducere === 'retur' || j.reducere === 'student' ? j.reducere : null, mesaj: typeof j.mesaj === 'string' ? j.mesaj : null };
  } catch { return null; }
}

export type RaspunsCarnet =
  | { verdict: 'accept'; jeton: string; expiraLa: string; nume: string; prenume: string }
  | { verdict: 'poza_neclara' | 'respins' | 'refuzat' | 'eroare'; motiv: string };

/** Verificarea carnetului la panou (cele două JPEG-uri în base64). */
export async function verificaCarnetLaPanou(corp: { passengerName: string; phone: string; ipHash: string; carnet: string; act: string; consimtamant: true }): Promise<RaspunsCarnet> {
  const cheie = process.env.BILETE_API_KEY;
  if (!cheie) return { verdict: 'eroare', motiv: 'config' };
  try {
    const r = await fetch(`${BAZA}/api/bilete/student/verifica`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cheie}` },
      body: JSON.stringify(corp), signal: AbortSignal.timeout(55_000), cache: 'no-store',
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) return { verdict: 'eroare', motiv: String(j?.eroare ?? `HTTP ${r.status}`) };
    if (j.verdict === 'accept' && typeof j.jeton === 'string') {
      return { verdict: 'accept', jeton: j.jeton, expiraLa: String(j.expiraLa), nume: String(j.nume ?? '').slice(0, 40), prenume: String(j.prenume ?? '').slice(0, 40) };
    }
    return { verdict: ['poza_neclara', 'respins', 'refuzat'].includes(j.verdict) ? j.verdict : 'eroare', motiv: String(j.motiv ?? '') };
  } catch { return { verdict: 'eroare', motiv: 'timeout' }; }
}
