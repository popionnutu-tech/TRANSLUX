import { verifyInitData } from '@/lib/telegram/init-data';

// Regulile PURE ale API-ului șoferului (ION-239): identitatea din initData, cheia cursei, orele din grafic, alegerea
// cursei curente (regula C1 din planul de vizualizare, 05.10) și clasificarea unei scanări (contractul POST
// /api/bilete-sofer/scan). Fără bază, fără Next — testate în sofer-reguli.test.ts și sofer-auth.test.ts.

/** Capacitatea autobuzului interurban: 1 față + 5 × 3 + 4 spate = 20 (Ion, 05.10; aceeași constantă în migr. 501). */
export const CAPACITATE_AUTOBUZ = 20;

/** Din initData la telegram_id sau la motivul refuzului (401 «nelegat» / «expirat»). `nowSec` se injectează în teste. */
export function telegramIdDinInitData(initData: string | null | undefined, botToken: string | undefined, nowSec = Date.now() / 1000): { ok: true; telegramId: number } | { ok: false; eroare: 'nelegat' | 'expirat' } {
  if (!botToken) return { ok: false, eroare: 'nelegat' };
  const v = verifyInitData(initData, botToken, nowSec);
  if (v.ok) return { ok: true, telegramId: v.telegramId };
  return { ok: false, eroare: v.motiv === 'expirat' ? 'expirat' : 'nelegat' };
}

export type RezultatScanare = 'ok' | 'deja_urcat' | 'anulat' | 'alta_cursa' | 'necunoscut';

// ---------------------------------------------------------------------------------------------
// Cheia cursei: «2026-10-05|7|false» = trip_date | crm_route_id | going_north (retur = true).

const CHEIE_RE = /^(\d{4}-\d{2}-\d{2})\|(\d{1,6})\|(true|false)$/;

export function cheieCursa(tripDate: string, crmRouteId: number, goingNorth: boolean): string {
  return `${tripDate}|${crmRouteId}|${goingNorth ? 'true' : 'false'}`;
}

export function parseazaCheie(s: unknown): { tripDate: string; crmRouteId: number; goingNorth: boolean } | null {
  if (typeof s !== 'string') return null;
  const m = CHEIE_RE.exec(s);
  if (!m) return null;
  return { tripDate: m[1], crmRouteId: Number(m[2]), goingNorth: m[3] === 'true' };
}

// ---------------------------------------------------------------------------------------------
// Orele: «HH:MM» ↔ minute; intervalul rutei din nomenclator e un text ca «06:00 - 10:20» (time_nord / time_chisinau).

export function minute(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function hhmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Plecarea și sosirea din intervalul rutei («06:00 - 10:20»); sosirea lipsește când textul are o singură oră. */
export function parseazaInterval(display: string | null | undefined): { plecare: string | null; sosire: string | null } {
  const ore = [...(display ?? '').matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => `${m[1].padStart(2, '0')}:${m[2]}`);
  return { plecare: ore[0] ?? null, sosire: ore[1] ?? null };
}

// ---------------------------------------------------------------------------------------------
// Regula C1 (planul de vizualizare, runda 1): cursa curentă = atribuirea al cărei interval [plecare − 60, sosire + 30]
// conține ora; la suprapunere câștigă plecarea cea mai apropiată de «acum»; dacă niciuna nu conține ora, următoarea
// plecare de azi; dacă nici aceea, nimic (API-ul dă atunci și «maine»). Sosirea peste miezul nopții se întinde a doua zi.

export interface CursaPentruAlegere { cheie: string; plecare: string; sosire: string | null }

export const MARJA_INAINTE_MIN = 60;
export const MARJA_DUPA_MIN = 30;
/** Fără sosire în nomenclator: cursa se consideră de 5 h (cea mai lungă interurbană e ~4 h 40). */
const DURATA_IMPLICITA_MIN = 300;

export function alegeCurenta(curse: CursaPentruAlegere[], acumHHMM: string): string | null {
  const acum = minute(acumHHMM);
  if (acum == null) return null;
  const inInterval: Array<{ cheie: string; dist: number }> = [];
  const viitoare: Array<{ cheie: string; plecare: number }> = [];
  for (const c of curse) {
    const p = minute(c.plecare);
    if (p == null) continue;
    let s = minute(c.sosire) ?? p + DURATA_IMPLICITA_MIN;
    if (s < p) s += 1440; // sosește după miezul nopții
    if (acum >= p - MARJA_INAINTE_MIN && acum <= s + MARJA_DUPA_MIN) inInterval.push({ cheie: c.cheie, dist: Math.abs(acum - p) });
    else if (p > acum) viitoare.push({ cheie: c.cheie, plecare: p });
  }
  if (inInterval.length) return inInterval.sort((a, b) => a.dist - b.dist)[0].cheie;
  if (viitoare.length) return viitoare.sort((a, b) => a.plecare - b.plecare)[0].cheie;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Clasificarea scanării: starea biletului × cursa șoferului → rezultat. Ordinea: necunoscut, anulat/returnat, altă
// cursă, deja urcat, ok. «ok» e doar verdictul; scrierea «urcat» o face API-ul cu UPDATE … WHERE status = 'valid'
// (prima scanare câștigă) și, dacă n-a prins rândul, reclasifică în deja_urcat cu urcat_de_altul.
// Idempotență (coada offline retrimite aceeași scanare): bilet deja urcat de ACEST șofer + scanarea «ok» cu același
// moment_client deja în jurnal → «ok» din nou, fără rând nou; altfel a doua scanare e deja_urcat (urcat_de_altul=false).

export interface BiletDeClasificat {
  status: 'valid' | 'urcat' | 'anulat' | 'returnat';
  cheie: string;
  urcat_de: string | null;
}

export interface Clasificare { rezultat: RezultatScanare; urcat_de_altul?: boolean; repetata?: boolean }

export function clasificaScanare(bilet: BiletDeClasificat | null, cheieSofer: string, soferId: string, okDejaScrisa = false): Clasificare {
  if (!bilet) return { rezultat: 'necunoscut' };
  if (bilet.status === 'anulat' || bilet.status === 'returnat') return { rezultat: 'anulat' };
  if (bilet.cheie !== cheieSofer) return { rezultat: 'alta_cursa' };
  if (bilet.status === 'urcat') {
    const alMeu = bilet.urcat_de === soferId;
    if (alMeu && okDejaScrisa) return { rezultat: 'ok', urcat_de_altul: false, repetata: true };
    return { rezultat: 'deja_urcat', urcat_de_altul: !alMeu };
  }
  return { rezultat: 'ok', urcat_de_altul: false };
}

// ---------------------------------------------------------------------------------------------
// Validarea corpului POST /scan: lot de cel mult 50 de scanări; codul = 20 de caractere Crockford (fără I, L, O, U),
// normalizat la majuscule; moment_client = ISO valid, nu din viitor (> 5 min) — altfel se ia ora serverului.

export const COD_QR_RE = /^[0-9A-HJKMNP-TV-Z]{20}$/;
export const MAX_SCANARI_PE_LOT = 50;

export interface ScanareCeruta { cod: string; moment_client: string; offline: boolean; cod_citit: string }

export function parseazaScanari(corp: unknown, acum: Date): ScanareCeruta[] | null {
  const raw = (corp as { scanari?: unknown })?.scanari;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SCANARI_PE_LOT) return null;
  const out: ScanareCeruta[] = [];
  for (const s of raw) {
    const o = s as { cod?: unknown; moment_client?: unknown; offline?: unknown };
    if (typeof o?.cod !== 'string') return null;
    const codCitit = o.cod.trim().slice(0, 64);
    const cod = codCitit.toUpperCase();
    let moment = acum.toISOString();
    if (typeof o.moment_client === 'string') {
      const t = new Date(o.moment_client).getTime();
      if (Number.isFinite(t) && t <= acum.getTime() + 5 * 60_000) moment = new Date(t).toISOString();
    }
    out.push({ cod, cod_citit: codCitit, moment_client: moment, offline: o.offline === true });
  }
  return out;
}
