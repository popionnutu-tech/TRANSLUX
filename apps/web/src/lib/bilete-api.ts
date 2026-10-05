import 'server-only';
import { CONFIG_INCHIS, parseazaConfig, parseazaPuncte, type ConfigBilete } from './bilete-reguli';

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
}

export type RaspunsComanda =
  | { ok: true; checkoutUrl: string; cod: string }
  | { ok: false; status: number; cod?: string; eroare: string };

export async function comandaBilet(input: ComandaBiletInput): Promise<RaspunsComanda> {
  const cheie = process.env.BILETE_API_KEY;
  if (!cheie) return { ok: false, status: 500, cod: 'config', eroare: 'BILETE_API_KEY lipsește' };
  try {
    const r = await fetch(`${BAZA}/api/bilete/comanda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cheie}` },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(TIMEOUT_MS * 4), // crearea sesiunii la bancă poate dura
      cache: 'no-store',
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.ok && j.checkoutUrl) return { ok: true, checkoutUrl: String(j.checkoutUrl), cod: String(j.cod ?? '') };
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
