// Granițe de timp în ora Moldovei (Europe/Chisinau, DST-aware: vara +03:00, iarna +02:00).
// Convenția unică LDE: o «zi»/«lună» calendaristică = ziua/luna locală Chișinău,
// nu miezul nopții UTC și nu un offset fix.

const TZ = 'Europe/Chisinau';

/** Azi, ca 'YYYY-MM-DD' în ora Chișinăului. */
export function chisinauTodayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Ziua calendaristică Chișinău ('YYYY-MM-DD') a unui instant (timestamptz din DB). */
export function chisinauDayOf(ts: string): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ });
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
