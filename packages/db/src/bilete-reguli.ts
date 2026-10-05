/**
 * Regulile PURE ale biletelor online, comune site-ului și panoului (ION-197; mutate din apps/admin/lib/bilete/reguli.ts):
 * ora plecării de la oprire ca instant Chișinău și fereastra de vânzare pe direcție. Fără bază, fără rețea.
 */

const TZ = 'Europe/Chisinau';

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Offset-ul («+03:00»/«+02:00») al zilei date, sondat la prânz (stabil în afara orei de tranziție DST). */
function dayOffset(dateStr: string): string {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : '+03:00';
}

/** Instantul unei zile + ore locale Chișinău ('2026-10-14' + '07:00'), ca ISO cu offset. */
export function chisinauInstantIso(dateStr: string, hhmm: string): string {
  const ora = /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : '00:00';
  return `${dateStr}T${ora}:00${dayOffset(dateStr)}`;
}

/** Ziua următoare ca 'YYYY-MM-DD' (calcul pe calendar, independent de fus). */
export function ziuaUrmatoare(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Plecarea de la oprirea de urcare, ca instant cu offset-ul Chișinăului. Ora opririi (`hour_from_*`) e ora locală a
 * graficului; dacă e mai mică decât ora de pornire a rutei, cursa a trecut de miezul nopții și oprirea e în ziua
 * următoare (ruta 8 ajunge la Lipcani la 00:05). Offset-ul se ia pe ziua rezultată (25.10 — ora de iarnă — iese corect).
 */
export function calculeazaDepartureAt(tripDate: string, oraOprire: string, oraPornireRuta: string | null): string {
  const zi = oraPornireRuta && /^\d{2}:\d{2}$/.test(oraPornireRuta) && toMinutes(oraOprire) < toMinutes(oraPornireRuta)
    ? ziuaUrmatoare(tripDate)
    : tripDate;
  return chisinauInstantIso(zi, oraOprire);
}

/**
 * Fereastra de vânzare (Ion, 02.10): tur (plecare din nord) — până la plecarea rutei minus `inchidereTurMin`
 * (implicit 0); retur (din Chișinău) — cu `inchidereReturMin` înainte (implicit 120) de plecarea de la oprirea pasagerului.
 */
export function vanzareDeschisa(args: {
  goingNorth: boolean;
  departureAt: string;
  pornireRutaAt: string;
  nowMs: number;
  inchidereTurMin: number;
  inchidereReturMin: number;
}): boolean {
  const limita = args.goingNorth
    ? Date.parse(args.departureAt) - args.inchidereReturMin * 60_000
    : Date.parse(args.pornireRutaAt) - args.inchidereTurMin * 60_000;
  return Number.isFinite(limita) && args.nowMs < limita;
}

/**
 * Suma minimă a unei plăți cu cardul: 10 MDL (Anexa 1E la contractul maib CU230731015814, «Suma minimă a unei
 * Operațiuni»; ION-237). Biletul cu prețul pe loc sub minim nu se vinde online (se cumpără la șofer): un singur loc
 * trebuie să poată fi plătit, altfel butonul ar promite ceva ce banca refuză.
 */
export const SUMA_MINIMA_PLATA_MDL = 10;

export function pretVandabilOnline(pretPeLoc: number): boolean {
  return Number.isFinite(pretPeLoc) && pretPeLoc >= SUMA_MINIMA_PLATA_MDL;
}

// ── Sfârșitul cursei (ION-252) ───────────────────────────────────────────────────────────────────
// Ion, 05.10: după sosire biletul trece în «Istoric», pinul din chat se scoate și pleacă mesajul de mulțumire. Sosirea
// = ora din grafic (crm_stop_fares) la oprirea de coborâre, pe sensul comenzii; sfârșitul = sosirea + 30 min (autobuzul
// întârzie). Fără oră în nomenclator: plecarea + 6 h (cât ține cel mult o cursă Chișinău – nord). Aceeași regulă în
// bot (pin, mesajul după cursă), în panou (lista mini app-ului) și pe site (fila «Biletele mele»).

/** Marja după sosirea din grafic până când cursa se socotește încheiată. */
export const MARJA_DUPA_SOSIRE_MS = 30 * 60_000;
/** Sfârșitul cursei fără ora sosirii în nomenclator: plecarea + 6 h. */
export const DURATA_IMPLICITA_CURSA_MS = 6 * 60 * 60_000;
/** O «sosire» mai departe de atât față de plecare e o greșeală de nomenclator (ex. aceeași oră ca plecarea). */
export const DURATA_MAXIMA_CURSA_MS = 20 * 60 * 60_000;

const FMT_ZI_CHISINAU = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });

/** «7:05» / «07:05» → «07:05»; orice altceva (gol, «—», 25:00) → null. */
export function oraValida(v: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Oprirea din crm_stop_fares, cu orele ei pe ambele sensuri. */
export interface OreleOpririi {
  hour_from_chisinau: string | null;
  hour_from_nord: string | null;
}

/** Ora opririi pe sensul comenzii: spre nord (din Chișinău) → `hour_from_chisinau`, altfel `hour_from_nord`. */
export function oraOpririiPeSens(oprire: OreleOpririi | null | undefined, goingNorth: boolean): string | null {
  if (!oprire) return null;
  return oraValida(goingNorth ? oprire.hour_from_chisinau : oprire.hour_from_nord);
}

/**
 * Sosirea ca instant (ms): ora sosirii în ziua plecării (Chișinău); dacă iese la sau înaintea plecării, cursa a trecut
 * de miezul nopții și sosirea e în ziua următoare. Instantul se face din zi + oră locală, deci trecerea la ora de iarnă
 * iese corect. Fără oră validă sau cu o durată absurdă → null.
 */
export function sosireaCurseiMs(departureAt: string, oraSosire: string | null | undefined): number | null {
  const plecareMs = Date.parse(departureAt);
  const ora = oraValida(oraSosire);
  if (!Number.isFinite(plecareMs) || !ora) return null;
  const zi = FMT_ZI_CHISINAU.format(new Date(plecareMs));
  let sosireMs = Date.parse(chisinauInstantIso(zi, ora));
  if (sosireMs <= plecareMs) sosireMs = Date.parse(chisinauInstantIso(ziuaUrmatoare(zi), ora));
  return sosireMs - plecareMs > DURATA_MAXIMA_CURSA_MS ? null : sosireMs;
}

/** Sfârșitul cursei (ms): sosirea + 30 min; fără sosire, plecarea + 6 h. Plecarea nevalidă → NaN. */
export function sfarsitulCurseiMs(departureAt: string, oraSosire: string | null | undefined): number {
  const sosireMs = sosireaCurseiMs(departureAt, oraSosire);
  if (sosireMs !== null) return sosireMs + MARJA_DUPA_SOSIRE_MS;
  return Date.parse(departureAt) + DURATA_IMPLICITA_CURSA_MS;
}

/** Cursa s-a încheiat la `nowMs`. O plecare nevalidă nu se socotește încheiată (nu ascundem ce nu înțelegem). */
export function cursaIncheiata(departureAt: string, oraSosire: string | null | undefined, nowMs: number): boolean {
  const sfarsit = sfarsitulCurseiMs(departureAt, oraSosire);
  return Number.isFinite(sfarsit) && nowMs >= sfarsit;
}
