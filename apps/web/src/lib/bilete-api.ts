import 'server-only';
import { CONFIG_INCHIS, parseazaConfig, type ConfigBilete } from './bilete-reguli';

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

export interface ComandaBiletInput {
  tripDate: string;
  crmRouteId: number;
  goingNorth: boolean;
  fromRo: string;
  toRo: string;
  seats: number;
  passengerName: string;
  phone: string;
  lang: 'ro' | 'ru';
  idempotencyKey: string;
  ipHash: string | null;
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
  cod_qr: string;
  status: 'valid' | 'urcat' | 'anulat' | 'returnat';
  urcat_at: string | null;
  qr_svg: string;
}

export interface ComandaPublica {
  cod: string;
  status: 'noua' | 'platita' | 'expirata' | 'eroare_creare' | 'anulata' | 'returnata' | 'platita_fara_bilet';
  trip_date: string;
  from_name: string;
  to_name: string;
  departure_at: string;
  seats: number;
  price_per_seat: number;
  total: number;
  passenger_name: string;
  lang: 'ro' | 'ru';
  paid_at: string | null;
  cancelled_at: string | null;
  ruta: { id: number; nume_ro: string; nume_ru: string } | null;
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
