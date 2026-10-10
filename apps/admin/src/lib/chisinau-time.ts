// Granițe de timp în ora Moldovei (Europe/Chisinau, DST-aware: vara +03:00, iarna +02:00).
// Convenția unică LDE: o «zi»/«lună» calendaristică = ziua/luna locală Chișinău,
// nu miezul nopții UTC și nu un offset fix.

import { chisinauInstantIso as chisinauInstantIsoExact } from '@translux/db';

const TZ = 'Europe/Chisinau';

// Formatoarele se refolosesc: `toLocaleDateString` cu opțiuni construiește un
// Intl.DateTimeFormat nou la fiecare apel — 23 µs față de 0,6 µs. Banda cheamă
// funcția de sute de ori la fiecare randare, iar diferența se vedea ca lag la
// tragerea unei bare (review performanță, 01.09).
const FMT_ZI = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const FMT_ORA = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Azi, ca 'YYYY-MM-DD' în ora Chișinăului. */
export function chisinauTodayIso(): string {
  return FMT_ZI.format(new Date());
}

/** Ziua calendaristică Chișinău ('YYYY-MM-DD') a unui instant (timestamptz din DB). */
export function chisinauDayOf(ts: string): string {
  return FMT_ZI.format(new Date(ts));
}

/** Miezul nopții Chișinău al zilei date, ca ISO cu offset — pentru filtre pe timestamptz. */
export function chisinauDayStartIso(dateStr: string): string {
  return chisinauInstantIsoExact(dateStr, '00:00');
}

/**
 * Instantul unei zile + ore locale Chișinău ('2026-09-10' + '07:00'), ca ISO cu offset.
 * `new Date('2026-09-10T07:00')` ia fusul BROWSERULUI: un dispecer aflat în altă
 * țară ar fi salvat cursa cu ore deplasate.
 * Offset-ul se ia pe ORA exactă (packages/db/src/chisinau-ora.ts), nu pe ziua sondată la prânz: în noaptea de
 * 25.10.2026 orele 00:00–03:59 sunt încă ora de vară (N6, dezbaterea Claude–Codex, 10.10.2026).
 */
export function chisinauInstantIso(dateStr: string, hhmm: string): string {
  return chisinauInstantIsoExact(dateStr, hhmm);
}

/** Ora locală Chișinău ('HH:MM') a unui instant. */
export function chisinauTimeOf(ts: string): string {
  return FMT_ORA.format(new Date(ts));
}

function nextDayIso(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Fereastra timestamptz [fromIso, toIso) a unei zile calendaristice Chișinău. */
export function chisinauDayBounds(dateStr: string): { fromIso: string; toIso: string } {
  return { fromIso: chisinauDayStartIso(dateStr), toIso: chisinauDayStartIso(nextDayIso(dateStr)) };
}

/**
 * Bornele unei luni ('YYYY-MM-01') în ora Chișinăului.
 * endISO e INCLUSIV (ultimul instant al lunii) — pentru interogările existente cu .lte().
 */
export function chisinauMonthBounds(monthStart: string): { startISO: string; endISO: string; nextMonthStartISO: string } {
  const start = new Date(`${monthStart}T00:00:00Z`);
  const nextMonthFirst = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
  const nextMonthStartISO = chisinauDayStartIso(nextMonthFirst);
  return {
    startISO: chisinauDayStartIso(monthStart),
    endISO: new Date(new Date(nextMonthStartISO).getTime() - 1).toISOString(),
    nextMonthStartISO,
  };
}
