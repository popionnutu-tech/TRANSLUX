/**
 * Regulile PURE ale comenzii de bilete (ION-193): ora plecării de la oprire și fereastra de vânzare.
 * Fără bază, fără rețea — ca să fie testate exact (după miezul nopții, ora de iarnă, închiderea pe direcție).
 */
import { chisinauInstantIso } from '@/lib/chisinau-time';

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Ziua următoare ca 'YYYY-MM-DD' (calcul pe calendar, independent de fus). */
export function ziuaUrmatoare(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Plecarea de la oprirea de urcare, ca instant cu offset-ul Chișinăului.
 * Ora opririi (`hour_from_*` din crm_stop_fares) e ora locală a graficului; dacă e mai mică decât ora de
 * pornire a rutei, cursa a trecut de miezul nopții și oprirea e în ziua următoare (ruta 8 ajunge la Lipcani la
 * 00:05). Offset-ul (+02/+03) se ia pe ziua rezultată, deci 25.10 (ora de iarnă) iese corect.
 */
export function calculeazaDepartureAt(tripDate: string, oraOprire: string, oraPornireRuta: string | null): string {
  const zi = oraPornireRuta && /^\d{2}:\d{2}$/.test(oraPornireRuta) && toMinutes(oraOprire) < toMinutes(oraPornireRuta)
    ? ziuaUrmatoare(tripDate)
    : tripDate;
  return chisinauInstantIso(zi, oraOprire);
}

/**
 * Fereastra de vânzare (Ion, 02.10): tur (plecare din nord) — până la plecarea rutei minus `inchidereTurMin`
 * (implicit 0); retur (din Chișinău) — cu `inchidereReturMin` înainte (implicit 120). `departureAt` e ora de la
 * oprirea pasagerului; pentru tur se compară cu `pornireRutaAt` (prima oprire), cum a cerut Ion («până șoferul
 * să înceapă tura tur»).
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
