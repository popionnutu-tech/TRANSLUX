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
