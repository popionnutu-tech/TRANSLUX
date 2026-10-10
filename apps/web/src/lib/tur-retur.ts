/**
 * Tur-retur pe site (plan docs/plans/2026-10-10-tur-retur-ux-simplu.md, 3 runde Claude + Codex): regulile PURE ale
 * fluxului în 3 pași — prețul afișat (aceeași rotunjire ca la plată), retururile potrivite, textele de pasageri și politica
 * cheilor de idempotență după răspunsul serverului.
 */
import { aplicaReducere } from '@translux/db';

export interface RezumatTurRetur { tur: number; retur: number; total: number; pretRetur: number | null }

/** Prețul pe loc al returului = aplicaReducere (ca serverul), apoi × pasageri; `pretRetur: null` → plata se blochează. */
export function rezumatTurRetur(a: { pretTur: number; pretRetur: number; pasageri: number; pct: number }): RezumatTurRetur {
  const loc = aplicaReducere(a.pretRetur, a.pct);
  const tur = a.pretTur * a.pasageri;
  const retur = loc == null ? 0 : loc * a.pasageri;
  return { tur, retur, total: tur + retur, pretRetur: loc };
}

/** Cursele de retur care se pot lua cu turul: se vând online, altă rută decât turul, pleacă după sosirea turului. */
export function curseReturPotrivite<T extends { sale_open: boolean; crm_route_id: number; trip_date: string; time: string }>(
  tur: { crm_route_id: number; trip_date: string; arrivalTime: string },
  lista: readonly T[],
): T[] {
  return lista.filter((t) => t.sale_open && t.crm_route_id !== tur.crm_route_id
    && (t.trip_date > tur.trip_date || (t.trip_date === tur.trip_date && t.time > tur.arrivalTime)));
}

/** «1 pasager / 2 pasageri», «1 пассажир / 2 пассажира / 5 пассажиров». */
export function pasageriText(n: number, locale: 'ro' | 'ru'): string {
  if (locale === 'ru') {
    const m10 = n % 10, m100 = n % 100;
    const f = m10 === 1 && m100 !== 11 ? 'пассажир' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'пассажира' : 'пассажиров';
    return `${n} ${f}`;
  }
  return `${n} ${n === 1 ? 'pasager' : 'pasageri'}`;
}

/**
 * Politica cheilor (Codex r2 C4, Claude r3 S1): alegerea schimbată → chei noi pentru AMBELE bilete și înlocuirea încercării
 * de dinainte; alegerea neschimbată → aceleași chei (reluarea recuperează sesiunea băncii), afară de `idempotenta`, când
 * serverul refuză cheia veche → chei noi cu înlocuire.
 * 551: un refuz clar al panoului (plafon, validare, cursă închisă, loc ocupat) → tot chei noi: turul creat înainte de un retur
 * refuzat e expirat de server, iar aceeași cheie l-ar relua expirat. Aceleași chei rămân doar când banca sau rețeaua n-au
 * răspuns (maib, in_lucru, fără cod), ca reluarea să recupereze sesiunea.
 */
export function politicaChei(a: { alegereSchimbata: boolean; codEroare?: string | null }): { chei: 'aceleasi' | 'noi'; inlocuieste: boolean } {
  if (a.alegereSchimbata) return { chei: 'noi', inlocuieste: true };
  if (a.codEroare && a.codEroare !== 'maib' && a.codEroare !== 'in_lucru') return { chei: 'noi', inlocuieste: true };
  return { chei: 'aceleasi', inlocuieste: false };
}
