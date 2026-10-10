/**
 * Ora locală Chișinău → instant, corect și în nopțile schimbării orei (N6 din dezbaterea Claude–Codex, 10.10.2026).
 *
 * Varianta veche lua offset-ul zilei sondat la prânz: pe 25.10.2026 (ora de iarnă) orele 00:00–03:59 ieșeau cu +02:00,
 * deși până la 04:00 EEST e încă vară (+03:00) — 00:05 devenea 01:05. Aici offset-ul se caută pentru ora exactă și
 * rezultatul se verifică prin conversia înapoi în ora locală (Intl, baza de fusuri a motorului JS).
 *
 * Moldova trece la ora de iarnă la 04:00 EEST → 03:00 EET (01:00 UTC, ultima duminică din octombrie) și la ora de vară
 * la 03:00 EET → 04:00 EEST (01:00 UTC, ultima duminică din martie). Deci:
 *  - toamna ora 03:00–03:59 apare de DOUĂ ori. Implicit se ia PRIMA apariție (ora de vară, EEST): graficul e tipărit
 *    pe ora cu care pornește noaptea. Ion n-a fost întrebat (decizia D5 din dezbatere) — se schimbă din
 *    `ORA_DUBLA_IMPLICITA` sau per apel cu `politica`.
 *  - primăvara ora 03:00–03:59 NU există. Se mută înainte cu golul (o oră): 03:30 → 04:30 EEST.
 */

export const TZ_CHISINAU = 'Europe/Chisinau';

/** Ce apariție se ia pentru ora care se repetă toamna. */
export type PoliticaOraDubla = 'prima' | 'a_doua';
/** Implicit: prima apariție (ora de vară). D5 — schimbă aici dacă Ion decide altfel. */
export const ORA_DUBLA_IMPLICITA: PoliticaOraDubla = 'prima';

const FMT_PERETE = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ_CHISINAU,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Ceasul de perete Chișinău al unui instant, codat ca ms «UTC» (an, lună, zi, oră, minut, secundă). */
function peretele(ms: number): number {
  const p: Record<string, number> = {};
  for (const x of FMT_PERETE.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
}

/** Offset-ul Chișinăului (minute, +180 vara, +120 iarna) la instantul dat. */
export function offsetChisinauMin(ms: number): number {
  const sec = Math.floor(ms / 1000) * 1000;
  return Math.round((peretele(sec) - sec) / 60_000);
}

const H = 3_600_000;

/**
 * Instantul (ms UTC) al zilei + orei locale Chișinău. Ora invalidă → '00:00' (ca până acum; «HH:MM:SS» se primește); data invalidă → NaN.
 * Ora dublă (toamna) → după `politica`; ora inexistentă (primăvara) → mutată înainte cu golul.
 */
export function chisinauLocalLaMs(dateStr: string, hhmm: string, politica: PoliticaOraDubla = ORA_DUBLA_IMPLICITA): number {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!d) return NaN;
  const o = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(hhmm); // «HH:MM» sau «HH:MM:SS» (coloană time); secundele nu contează
  const [hh, mi] = o && Number(o[1]) <= 23 && Number(o[2]) <= 59 ? [Number(o[1]), Number(o[2])] : [0, 0];
  const perete = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hh, mi);
  if (!Number.isFinite(perete)) return NaN;

  // Offset-urile posibile: cel de dinainte și cel de după (o zi distanță acoperă orice tranziție).
  const offInainte = offsetChisinauMin(perete - 24 * H);
  const offDupa = offsetChisinauMin(perete + 24 * H);
  const candidati = [...new Set([offInainte, offDupa])]
    .map((off) => perete - off * 60_000)
    .filter((t) => peretele(t) === perete) // verificarea: înapoi în ora locală dă exact ora cerută
    .sort((a, b) => a - b);

  if (candidati.length === 1) return candidati[0];
  if (candidati.length > 1) return politica === 'a_doua' ? candidati[candidati.length - 1] : candidati[0];
  // Golul de primăvară: ora citită cu offset-ul de dinainte cade după salt, adică ora + golul (03:30 → 04:30).
  return perete - offInainte * 60_000;
}

function doua(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Instantul zilei + orei locale Chișinău ('2026-10-14' + '07:00') ca ISO cu offset-ul REAL al acelui instant
 * ('2026-10-14T07:00:00+03:00'). Ora din golul de primăvară iese cu ora mutată ('…T04:30:00+03:00').
 */
export function chisinauInstantIso(dateStr: string, hhmm: string, politica: PoliticaOraDubla = ORA_DUBLA_IMPLICITA): string {
  const ms = chisinauLocalLaMs(dateStr, hhmm, politica);
  if (!Number.isFinite(ms)) return `${dateStr}T00:00:00+03:00`; // intrare stricată: ca înainte, nu aruncăm
  const off = offsetChisinauMin(ms);
  const local = new Date(ms + off * 60_000);
  const semn = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  return `${local.getUTCFullYear()}-${doua(local.getUTCMonth() + 1)}-${doua(local.getUTCDate())}T${doua(local.getUTCHours())}:${doua(local.getUTCMinutes())}:00${semn}${doua(Math.floor(abs / 60))}:${doua(abs % 60)}`;
}
