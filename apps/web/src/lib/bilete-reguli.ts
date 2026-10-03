/**
 * Regulile PURE ale biletelor online pe site (ION-197): când se arată «Cumpără bilet», cum se citește configurația
 * panoului și cum se normalizează telefonul. Fără rețea, fără bază — testate exact în bilete-reguli.test.ts.
 * Fereastra de vânzare e aceeași funcție ca în API-ul comenzii (@translux/db), ca butonul să nu promită ce API-ul refuză.
 */
import { calculeazaDepartureAt, chisinauInstantIso, vanzareDeschisa } from '@translux/db';

export interface ConfigBilete {
  activ: boolean;
  inchidere_tur_min: number;
  inchidere_retur_min: number;
  /** Rutele cu cel puțin o direcție deschisă. */
  rute: Array<{ id: number; tur: boolean; retur: boolean }>;
}

export const CONFIG_INCHIS: ConfigBilete = { activ: false, inchidere_tur_min: 0, inchidere_retur_min: 120, rute: [] };

/** Răspunsul panoului → configurație; orice formă neașteptată → vânzare închisă. */
export function parseazaConfig(j: unknown): ConfigBilete {
  if (!j || typeof j !== 'object') return CONFIG_INCHIS;
  const o = j as Record<string, unknown>;
  const rute = Array.isArray(o.rute)
    ? (o.rute as Array<Record<string, unknown>>)
        .map((x) => ({ id: Number(x?.id), tur: x?.tur === true, retur: x?.retur === true }))
        .filter((x) => Number.isInteger(x.id) && x.id > 0)
    : [];
  return {
    activ: o.activ === true,
    inchidere_tur_min: Math.max(0, Number(o.inchidere_tur_min ?? 0) || 0),
    inchidere_retur_min: Math.max(0, Number(o.inchidere_retur_min ?? 120) || 0),
    rute,
  };
}

/**
 * Butonul «Cumpără bilet» pe o cursă: steagul global, direcția rutei deschisă, șofer atribuit PE ziua cursei (nu pe
 * ziua anterioară, de unde site-ul își ia graficul când ziua cerută n-are încă atribuiri) și fereastra de vânzare.
 * `goingNorth` = Chișinău → nord = retur (aceeași convenție ca în API și în grafic).
 */
export function vanzareDeschisaPeSite(a: {
  cfg: ConfigBilete;
  routeId: number;
  goingNorth: boolean;
  tripDate: string;
  /** Ora plecării de la oprirea omului («HH:MM», ora locală a graficului). */
  time: string;
  /** Ora pornirii rutei din capăt («HH:MM»); null când nu e cunoscută. */
  pornireRuta: string | null;
  soferPeZi: boolean;
  nowMs: number;
}): boolean {
  if (!a.cfg.activ || !a.soferPeZi) return false;
  const r = a.cfg.rute.find((x) => x.id === a.routeId);
  if (!r || !(a.goingNorth ? r.retur : r.tur)) return false;
  if (!/^\d{2}:\d{2}$/.test(a.time)) return false;
  const departureAt = calculeazaDepartureAt(a.tripDate, a.time, a.pornireRuta);
  const pornireRutaAt = chisinauInstantIso(a.tripDate, a.pornireRuta ?? a.time);
  return vanzareDeschisa({
    goingNorth: a.goingNorth, departureAt, pornireRutaAt, nowMs: a.nowMs,
    inchidereTurMin: a.cfg.inchidere_tur_min, inchidereReturMin: a.cfg.inchidere_retur_min,
  });
}

/** «069 123 456» / «+373 69123456» / «37369123456» → «37369123456»; altceva → null. */
export function normalizeazaTelefon(raw: string): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (/^373\d{8}$/.test(d)) return d;
  if (/^0\d{8}$/.test(d)) return `373${d.slice(1)}`;
  if (/^\d{8}$/.test(d)) return `373${d}`;
  return null;
}

export type CodEroareComanda = 'validare' | 'inchis' | 'idempotenta' | 'in_lucru' | 'plafon' | 'maib' | 'config' | 'necunoscut';

/** Mesajul pentru pasager, pe limbă, din codul erorii API-ului (RO primește și textul exact la validare). */
export function mesajEroareComanda(cod: string | undefined, status: number, locale: 'ro' | 'ru', textApi?: string): string {
  const ru = locale === 'ru';
  const c: CodEroareComanda = (cod as CodEroareComanda) || (status === 429 ? 'plafon' : status === 503 ? 'maib' : status === 409 ? 'in_lucru' : 'necunoscut');
  switch (c) {
    case 'inchis': return ru ? 'Онлайн-продажа на этот рейс закрыта. Билет можно взять у водителя.' : 'Vânzarea online pentru această cursă s-a închis. Biletul se ia de la șofer.';
    case 'plafon': return ru ? 'Слишком много попыток. Попробуйте через несколько минут.' : 'Prea multe încercări. Încearcă peste câteva minute.';
    case 'maib': return ru ? 'Банк сейчас не отвечает. Попробуйте ещё раз через минуту.' : 'Banca nu răspunde acum. Încearcă din nou peste un minut.';
    case 'idempotenta':
    case 'in_lucru': return ru ? 'Заказ уже обрабатывается. Подождите несколько секунд и повторите.' : 'Comanda e deja în lucru. Așteaptă câteva secunde și încearcă iar.';
    case 'validare': return ru ? 'Проверьте имя и номер телефона.' : (textApi || 'Verifică numele și numărul de telefon.');
    case 'config': return ru ? 'Онлайн-продажа временно недоступна.' : 'Vânzarea online e temporar indisponibilă.';
    default: return ru ? 'Не удалось создать заказ. Попробуйте ещё раз.' : 'Nu am putut crea comanda. Încearcă din nou.';
  }
}

/**
 * Adresa la care trimitem pasagerul după comandă: doar https pe domeniile băncii (pagina de plată e pe
 * checkout[-sandbox].maib.md; API-ul pe maibmerchants.md). Un răspuns ciudat al panoului nu duce omul altundeva.
 */
export function urlPlataSigur(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)(maib|maibmerchants)\.md$/.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Numele pasagerului din două câmpuri (Ion, 03.10: «două»): numele și prenumele, fiecare 2–40 de caractere,
 * spațiile strânse. Rezultatul «Nume Prenume» intră în comandă (un singur câmp în API). Altfel → null.
 */
export function numeComplet(nume: string, prenume: string): string | null {
  const curat = (s: string) => String(s ?? '').trim().replace(/\s+/g, ' ');
  const n = curat(nume);
  const p = curat(prenume);
  if (n.length < 2 || n.length > 40 || p.length < 2 || p.length > 40) return null;
  return `${n} ${p}`;
}
