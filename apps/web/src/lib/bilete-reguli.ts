/**
 * Regulile PURE ale biletelor online pe site (ION-197): când se arată «Cumpără bilet», cum se citește configurația
 * panoului și cum se normalizează telefonul. Fără rețea, fără bază — testate exact în bilete-reguli.test.ts.
 * Fereastra de vânzare e aceeași funcție ca în API-ul comenzii (@translux/db), ca butonul să nu promită ce API-ul refuză.
 */
import {
  calculeazaDepartureAt, chisinauInstantIso, cursaInLocalitatileVanzarii, localitatiDinValoare, NICIO_LOCALITATE,
  normalizeazaLocalitate, normalizeazaTelefonPasager, vanzareDeschisa, type LocalitatiVanzare,
} from '@translux/db';

export interface ConfigBilete {
  activ: boolean;
  inchidere_tur_min: number;
  inchidere_retur_min: number;
  /** Rutele cu cel puțin o direcție deschisă. */
  rute: Array<{ id: number; tur: boolean; retur: boolean }>;
  /** ION-264: localitățile vânzării (urcare SAU coborâre); aceeași regulă ca în panou. */
  localitati: LocalitatiVanzare;
  /** Capătul celălalt al perechii (Ion, 09.10: «doar perechile cu Chișinău»); toate = regula veche. */
  destinatii: LocalitatiVanzare;
  /** Prima zi de cursă vândută online (09.10: «2026-10-12»); null = orice zi. */
  curse_de_la: string | null;
  /** 544: prima zi de cursă pe localitate (cheie normalizată), ex. {"balti":"2026-10-13"}. */
  localitati_de_la?: Record<string, string>;
  /** 544: promoțiile Bălți ⇄ Chișinău. */
  promo?: { activ: boolean; pct: number; retur_zile: number };
}

export const CONFIG_INCHIS: ConfigBilete = { activ: false, inchidere_tur_min: 0, inchidere_retur_min: 120, rute: [], localitati: NICIO_LOCALITATE, destinatii: NICIO_LOCALITATE, curse_de_la: null, localitati_de_la: {}, promo: { activ: false, pct: 20, retur_zile: 30 } };

/**
 * Răspunsul panoului → configurație; orice formă neașteptată → vânzare închisă. `localitati` lipsă (panoul de dinainte
 * de ION-264) sau null = toate; o formă stricată = nicio localitate.
 */
function dateDeStart(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, d] of Object.entries(v as Record<string, unknown>)) if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) out[normalizeazaLocalitate(k)] = d;
  return out;
}

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
    localitati: localitatiDinValoare(o.localitati).regula,
    destinatii: localitatiDinValoare(o.destinatii).regula,
    curse_de_la: typeof o.curse_de_la === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.curse_de_la) ? o.curse_de_la : null,
    localitati_de_la: dateDeStart(o.localitati_de_la),
    promo: o.promo && typeof o.promo === 'object'
      ? { activ: (o.promo as Record<string, unknown>).activ === true, pct: Number((o.promo as Record<string, unknown>).pct) || 20, retur_zile: Number((o.promo as Record<string, unknown>).retur_zile) || 30 }
      : { activ: false, pct: 20, retur_zile: 30 },
  };
}

/**
 * Butonul «Cumpără bilet» pe o cursă: steagul global, direcția rutei deschisă, localitatea de urcare sau de coborâre în
 * lista vânzării (ION-264), șofer atribuit PE ziua cursei (nu pe ziua anterioară, de unde site-ul își ia graficul când
 * ziua cerută n-are încă atribuiri) și fereastra de vânzare.
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
  /** Numele canonice ale opririlor de urcare și de coborâre (crm_stop_fares.name_ro), ca în panou. */
  urcare: string;
  coborare: string;
  soferPeZi: boolean;
  nowMs: number;
}): boolean {
  if (!a.cfg.activ || !a.soferPeZi) return false;
  if (a.cfg.curse_de_la && a.tripDate < a.cfg.curse_de_la) return false;
  // Ion, 10.10.2026: «lansăm de pe 13.10 vânzări online Bălți–Chișinău» — data de start pe localitate (ca în panou).
  for (const nume of [a.urcare, a.coborare]) {
    const de = a.cfg.localitati_de_la?.[normalizeazaLocalitate(nume)];
    if (de && a.tripDate < de) return false;
  }
  if (!cursaInLocalitatileVanzarii(a.cfg.localitati, a.urcare, a.coborare, a.cfg.destinatii)) return false;
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

/**
 * «069 123 456» / «+373 69123456» / «37369123456» → «37369123456»; un număr străin cu prefix («+380 67 123 4567») →
 * «380671234567» (Ion, 10.10.2026: «pot fi și bilete din Ucraina cu +380 sau altă țară, dar de bază e MD»);
 * altceva → null. Aceeași regulă ca pe panou (@translux/db normalizeazaTelefonPasager).
 */
export function normalizeazaTelefon(raw: string): string | null {
  return normalizeazaTelefonPasager(raw);
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

/**
 * E-mailul opțional (Ion, 03.10): gol → null (valid); altfel litere mici, aceeași regulă ca API-ul comenzii
 * (`apps/admin/src/lib/bilete/comenzi.ts`), cel mult 120 de caractere. Invalid → 'invalid'.
 */
export function emailOptional(raw: string): string | null | 'invalid' {
  const e = String(raw ?? '').trim().toLowerCase();
  if (!e) return null;
  if (e.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return 'invalid';
  return e;
}

// ---------------------------------------------------------------------------------------------------------------
// Punctele de urcare (ION-198): panoul dă punctele localității cu perechile (rută, sens) pe care se oferă.

export interface PunctUrcare {
  id: number;
  nume_ro: string;
  nume_ru: string;
  lat: number;
  lon: number;
  rang: number;
}

interface PunctCuPerechi extends PunctUrcare { perechi: Array<[number, boolean]> }

/** Răspunsul panoului → doar punctele bine formate; orice altceva = listă goală (nu se întreabă nimic). */
export function parseazaPuncte(j: unknown): PunctCuPerechi[] {
  const a = (j as { ok?: boolean; puncte?: unknown })?.ok ? (j as { puncte?: unknown }).puncte : null;
  if (!Array.isArray(a)) return [];
  return a.filter((p): p is PunctCuPerechi => !!p && Number.isInteger(p.id) && typeof p.nume_ro === 'string' && typeof p.nume_ru === 'string'
    && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isInteger(p.rang) && Array.isArray(p.perechi));
}

/** Punctele oferite pe o cursă (rută + sens), după rang, fără perechi. */
export function puncteCursei(toate: PunctCuPerechi[], routeId: number, goingNorth: boolean): PunctUrcare[] {
  return toate.filter((p) => p.perechi.some(([r, n]) => r === routeId && n === goingNorth))
    .sort((a, b) => a.rang - b.rang)
    .map(({ id, nume_ro, nume_ru, lat, lon, rang }) => ({ id, nume_ro, nume_ru, lat, lon, rang }));
}

/** Locul pe hartă (se deschide în aplicația de hărți a telefonului). */
export function linkHarta(p: { lat: number; lon: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
}
