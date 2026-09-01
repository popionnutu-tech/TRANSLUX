// Granițe de timp în ora Moldovei (Europe/Chisinau, DST-aware: vara +03:00, iarna +02:00).
// Convenția unică LDE: o «zi»/«lună» calendaristică = ziua/luna locală Chișinău,
// nu miezul nopții UTC și nu un offset fix.

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

// Offset-ul («+03:00»/«+02:00») al zilei date — sondat la prânz, stabil în afara orei de tranziție DST
// (tranziția e la 03:00/04:00 local; eroarea posibilă e limitată la ora aceea, de 2 ori pe an).
function dayOffset(dateStr: string): string {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : '+03:00';
}

/** Miezul nopții Chișinău al zilei date, ca ISO cu offset — pentru filtre pe timestamptz. */
export function chisinauDayStartIso(dateStr: string): string {
  return `${dateStr}T00:00:00${dayOffset(dateStr)}`;
}

/**
 * Instantul unei zile + ore locale Chișinău ('2026-09-10' + '07:00'), ca ISO cu offset.
 * `new Date('2026-09-10T07:00')` ia fusul BROWSERULUI: un dispecer aflat în altă
 * țară ar fi salvat cursa cu ore deplasate.
 */
export function chisinauInstantIso(dateStr: string, hhmm: string): string {
  const ora = /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : '00:00';
  return `${dateStr}T${ora}:00${dayOffset(dateStr)}`;
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
