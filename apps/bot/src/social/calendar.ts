// Calendarul clipurilor (plan 09.10, «Publicarea video» p. 5): clipul primește următorul loc liber din calendarul
// contului — una din orele topicului (ora Chișinăului) plus decalajul topicului, cel mult `maxPeZi` clipuri pe zi.
// Pur, fără bază: primește ce e deja planificat și întoarce momentul. Ora locală se calculează prin Intl, nu cu un
// decalaj fix (vara/iarna se schimbă singură).

export const FUS = 'Europe/Chisinau';
/** Un clip nu se planifică mai devreme de atât: adminul are timp să-l vadă și să apese Anulează. */
export const AVANS_MINIM_MS = 15 * 60_000;
/** Două clipuri ale aceluiași topic nu stau mai aproape de atât. */
export const DISTANTA_MINIMA_MS = 60 * 60_000;
const ZILE_CAUTATE = 90;

/** Decalajul fusului față de UTC, în minute, la momentul dat (Chișinău: +180 vara, +120 iarna). */
export function decalajFus(moment: Date, fus = FUS): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: fus, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(moment).map((x) => [x.type, x.value]),
  );
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((local - Math.floor(moment.getTime() / 1000) * 1000) / 60_000);
}

/** Ziua locală (YYYY-MM-DD) a momentului. */
export function ziLocala(moment: Date, fus = FUS): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fus, year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment);
}

/** Momentul UTC pentru ziua locală `zi` (YYYY-MM-DD) la `minute` minute după miezul nopții locale. */
export function momentLocal(zi: string, minute: number, fus = FUS): Date {
  const [a, l, z] = zi.split('-').map(Number);
  const naiv = Date.UTC(a, l - 1, z, 0, minute);
  // Două treceri: decalajul se ia la momentul aproximativ, apoi se corectează (zilele de schimbare a orei).
  let m = new Date(naiv - decalajFus(new Date(naiv), fus) * 60_000);
  m = new Date(naiv - decalajFus(m, fus) * 60_000);
  return m;
}

/** «19:30» → 1170. Orele greșite se ignoră (null). */
export function minuteDinOra(ora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(ora.trim());
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export interface SetariCalendar {
  ore: string[];
  decalajMin: number;
  maxPeZi: number;
}

/**
 * Primul loc liber de la `dupa` încolo (cel puțin `acum + AVANS_MINIM_MS`): o oră a topicului + decalaj, într-o zi
 * cu mai puțin de `maxPeZi` clipuri, la cel puțin o oră de alt clip al topicului. `ocupate` = orele clipurilor deja
 * planificate ale topicului (de același tip). Fără ore valabile → null.
 */
export function urmatorulLoc(setari: SetariCalendar, ocupate: Date[], acum: Date, dupa?: Date): Date | null {
  const minute = [...new Set(setari.ore.map(minuteDinOra).filter((x): x is number => x !== null))]
    .map((x) => x + setari.decalajMin)
    .sort((a, b) => a - b);
  if (!minute.length) return null;
  const deLa = Math.max(acum.getTime() + AVANS_MINIM_MS, dupa ? dupa.getTime() : 0);
  const peZi = new Map<string, number>();
  for (const o of ocupate) peZi.set(ziLocala(o), (peZi.get(ziLocala(o)) ?? 0) + 1);
  const start = ziLocala(new Date(deLa));
  for (let d = 0; d < ZILE_CAUTATE; d++) {
    const zi = ziLocala(new Date(momentLocal(start, 12 * 60).getTime() + d * 86_400_000));
    for (const min of minute) {
      const loc = momentLocal(zi, min);
      if (loc.getTime() < deLa) continue;
      // Ziua se ia de pe locul însuși: o oră plus decalaj poate trece de miezul nopții (23:30 + 100 min = 01:10).
      if ((peZi.get(ziLocala(loc)) ?? 0) >= setari.maxPeZi) continue;
      if (ocupate.some((o) => Math.abs(o.getTime() - loc.getTime()) < DISTANTA_MINIMA_MS)) continue;
      return loc;
    }
  }
  return null;
}

const ZILE_RO = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];

/** «vineri 10.10, 19:30» în ora Chișinăului. */
export function formatLoc(moment: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: FUS, hourCycle: 'h23', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(moment).map((x) => [x.type, x.value]),
  );
  const zi = ZILE_RO[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)];
  return `${zi} ${p.day}.${p.month}, ${p.hour}:${p.minute}`;
}
