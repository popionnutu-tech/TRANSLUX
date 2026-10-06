// Regulile pure ale mini app-ului clientului din Telegram (ION-249): când se arată harta autobuzului, ora cursei pentru
// /api/asistent-site/pozitie, initData-ul din fragmentul URL-ului și contactul pentru formular. Fără React, fără rețea.
// ION-252: sfârșitul cursei (sosirea din grafic + 30 min) e regula comună din @translux/db — aceeași în bot și în panou.
import { cursaIncheiata, sosireaCurseiMs } from '@translux/db';

/** Harta apare în ziua cursei, cu atât înainte de plecare (Ion, 05.10). */
export const HARTA_INAINTE_MIN = 60;
/** După sosirea din grafic, autobuzul mai poate fi pe drum (ca END_SLACK_MIN din asistent, plus marjă). */
export const HARTA_DUPA_SOSIRE_MIN = 30;
/** Fără ora sosirii în nomenclator: cât ține cel mult o cursă Chișinău – nord. */
export const DURATA_IMPLICITA_MIN = 6 * 60;

const MINUT_MS = 60_000;

/** Datele de pe bilet de care are nevoie fereastra hărții. */
export interface CursaBilet {
  /** 'YYYY-MM-DD', ziua cursei (Chișinău). */
  trip_date: string;
  /** ISO, plecarea de la oprirea de urcare. */
  departure_at: string;
  /** «HH:MM» Chișinău, sosirea din grafic; null = lipsește din nomenclator. */
  sosire?: string | null;
}

/**
 * - `alta_zi`: cursa nu e azi (harta apare în ziua cursei);
 * - `curand`: azi, dar mai e peste o oră până la plecare;
 * - `activa`: de la o oră înainte de plecare până la sosire + marjă — se cere punctul autobuzului;
 * - `incheiata`: cursa s-a terminat.
 * Serverul (busLocation, regulile ION-37) mai taie o dată: punctul se dă doar în orele cursei, după grafic.
 */
export type FereastraHartii = 'alta_zi' | 'curand' | 'activa' | 'incheiata';

const FMT_ZI = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' });
const FMT_ORA = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });

/** «2026-10-05» în ora Chișinăului. */
export function ziuaChisinau(ms: number): string {
  return FMT_ZI.format(new Date(ms));
}

/** «06:05» în ora Chișinăului (miezul nopții e «00:05», nu «24:05»). */
export function oraChisinau(iso: string): string {
  const [h, m] = FMT_ORA.format(new Date(iso)).split(':');
  return `${String(Number(h) % 24).padStart(2, '0')}:${m}`;
}

/** Sosirea (ms) din grafic, sau plecarea + DURATA_IMPLICITA_MIN fără oră (sosirea după miezul nopții = ziua următoare). */
function sosireaMs(c: CursaBilet, plecareMs: number): number {
  return sosireaCurseiMs(c.departure_at, c.sosire) ?? plecareMs + DURATA_IMPLICITA_MIN * MINUT_MS;
}

/**
 * ION-252 (Ion, 05.10: «biletul trece imediat în Istoric după sosire»): biletele din «Biletele mele» a căror cursă nu
 * s-a încheiat. Panoul le filtrează deja; aici se refiltrează între două încărcări (mini app-ul stă deschis).
 */
export function bileteNeincheiate<T extends { departure_at: string; sosire?: string | null }>(bilete: readonly T[], acumMs: number): T[] {
  return bilete.filter((b) => !cursaIncheiata(b.departure_at, b.sosire, acumMs));
}

export function fereastraHartii(c: CursaBilet, acumMs: number): FereastraHartii {
  const plecareMs = Date.parse(c.departure_at);
  if (!Number.isFinite(plecareMs)) return 'alta_zi';
  // Punctul autobuzului se dă doar pentru cursele de AZI (busLocation caută în graficul zilei), deci și o cursă de
  // ieri care trece de miezul nopții e «încheiată» aici.
  const azi = ziuaChisinau(acumMs);
  if (c.trip_date > azi) return 'alta_zi';
  if (c.trip_date < azi) return 'incheiata';
  const sfarsitMs = sosireaMs(c, plecareMs) + HARTA_DUPA_SOSIRE_MIN * MINUT_MS;
  if (acumMs > sfarsitMs) return 'incheiata';
  return acumMs < plecareMs - HARTA_INAINTE_MIN * MINUT_MS ? 'curand' : 'activa';
}

/**
 * Telegram pune initData în fragmentul URL-ului (#tgWebAppData=…). Site-ul nu încarcă telegram-web-app.js (CSP), deci
 * aceasta e singura sursă a identității în mini app-ul clientului; serverul panoului o verifică.
 */
export function initDataDinFragment(hash: string): string {
  const valoare = new URLSearchParams(hash.replace(/^#/, '')).get('tgWebAppData');
  return valoare ?? '';
}

/** Numele și telefonul din ultima comandă a contului, pentru precompletarea formularului de cumpărare. */
export interface ContactPrecompletat {
  nume: string;
  prenume: string;
  /** 373XXXXXXXX (panoul); formularul îl arată «+373 XX XXX XXX». */
  telefon: string;
  /** Cel mai nou e-mail lăsat vreodată de cont (ION-249: «și email dacă a fost introdus în trecut»). */
  email: string | null;
}

/** O călătorie din fila «Istoric» (ION-249). */
export interface CalatorieIstoric { cod: string; status: string; from_name: string; to_name: string; departure_at: string; seats: number; total: number }

/** Istoricul de la server, verificat rând cu rând (un rând ciudat se sare, nu strică lista). */
export function parseazaIstoric(v: unknown): CalatorieIstoric[] {
  if (!Array.isArray(v)) return [];
  const out: CalatorieIstoric[] = [];
  for (const x of v.slice(0, 50)) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.cod !== 'string' || typeof o.from_name !== 'string' || typeof o.to_name !== 'string' || typeof o.departure_at !== 'string' || !Number.isFinite(Date.parse(o.departure_at))) continue;
    out.push({ cod: o.cod, status: String(o.status ?? ''), from_name: o.from_name, to_name: o.to_name, departure_at: o.departure_at, seats: Number(o.seats) || 1, total: Number(o.total) || 0 });
  }
  return out;
}

/** Ce vine de la server se verifică: un câmp ciudat → fără precompletare, nu un formular stricat. */
export function parseazaContact(v: unknown): ContactPrecompletat | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
  const nume = text(o.nume);
  const prenume = text(o.prenume);
  const telefon = text(o.telefon).replace(/\D/g, '');
  if (nume.length < 2 || nume.length > 40 || prenume.length < 2 || prenume.length > 40 || !/^373\d{8}$/.test(telefon)) return null;
  const email = text(o.email).toLowerCase();
  return { nume, prenume, telefon, email: email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null };
}

// ───────────────────────── ION-275 («Telegram ultrafast» P6+P7): pornirea timpurie și cache-ul local ─────────────────────────

/** id-ul contului Telegram din initData (câmpul `user`, JSON); null dacă lipsește. Pur. */
export function telegramIdDinInitData(initData: string): number | null {
  try {
    const u = new URLSearchParams(initData).get('user');
    const id = u ? Number((JSON.parse(u) as { id?: unknown })?.id) : NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch { return null; }
}

export const CHEIE_CACHE_BILETE = (telegramId: number) => `translux_tg_bilete:${telegramId}`;
export const CACHE_BILETE_MAX_MS = 12 * 60 * 60_000;

/** Ce se ține pe telefon: DOAR câmpurile cardului biletului — fără contact (telefon, e-mail) și fără istoric. */
export interface BileteMemorate { la: number; telegram_id: number; bilete: unknown[] }

const CAMPURI_CARD = ['cod', 'numar', 'status', 'trip_date', 'from_name', 'to_name', 'departure_at', 'sosire', 'seats', 'price_per_seat', 'total', 'passenger_name', 'lang', 'paid_at', 'cancelled_at', 'ruta', 'punct_urcare', 'bilete'] as const;

/** Copia de pus în cache: biletele cu câmpurile cardului, nimic altceva (orice câmp nou de la panou NU intră automat). Pur. */
export function deMemorat(telegramId: number, bilete: unknown[], acumMs: number): BileteMemorate {
  const curate = bilete.filter((b) => b && typeof b === 'object').map((b) => {
    const o = b as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of CAMPURI_CARD) if (k in o) out[k] = o[k];
    return out;
  });
  return { la: acumMs, telegram_id: telegramId, bilete: curate };
}

/** Cache-ul e al acestui cont și destul de proaspăt (≤ 12 h) ca să fie arătat imediat. Pur. */
export function memorateValide(m: unknown, telegramId: number | null, acumMs: number): m is BileteMemorate {
  if (!telegramId || !m || typeof m !== 'object') return false;
  const o = m as Partial<BileteMemorate>;
  return o.telegram_id === telegramId && Array.isArray(o.bilete) && typeof o.la === 'number' && acumMs - o.la >= 0 && acumMs - o.la <= CACHE_BILETE_MAX_MS;
}
