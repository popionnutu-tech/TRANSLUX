/**
 * Localitățile vânzării online (ION-264; Ion, 06.10: «pentru început vor fi doar biletele Briceni și Edineț și ulterior
 * limitat biletele Bălți»). Regulile PURE, comune panoului (sursa de adevăr, refuză comanda) și site-ului (ascunde
 * butonul). Fără bază, fără rețea.
 *
 * Două chei în app_config (valoarea e text JSON):
 *   - `bilete_localitati_vanzare` = ["Briceni","Edineț"] — o cursă se vinde online doar dacă localitatea de URCARE sau
 *     de COBORÂRE e în listă. Lipsă / gol / [] / null = toate localitățile (comportamentul de dinainte).
 *   - `bilete_locuri_localitate` = {"Bălți": 4} — câte locuri pe cursă se vând online cu urcare sau coborâre la acea
 *     localitate. Localitate fără cheie = fără limită.
 * O valoare stricată NU deschide vânzarea: lista stricată = nicio localitate, plafoanele stricate = vânzare închisă.
 * Numele se compară fără diacritice și fără majuscule («Edinet» = «Edineț», «BALTI» = «Bălți»).
 */

/** «Edineț» / «edinet» / «  EDINEȚ » → «edinet». Ș/Ț cu virgulă și cu sedilă cad la fel (NFD le desface). */
export function normalizeazaLocalitate(nume: string | null | undefined): string {
  return String(nume ?? '')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// ── Lista localităților ───────────────────────────────────────────────────────────────────────────

/** Regula listei: toate localitățile sau doar cele din listă (o listă goală aici = nimic nu se vinde). */
export type LocalitatiVanzare =
  | { readonly toate: true }
  | { readonly toate: false; readonly localitati: readonly string[] };

export const TOATE_LOCALITATILE: LocalitatiVanzare = { toate: true };
/** Ce se folosește când valoarea din app_config e stricată: nu vindem pe orb. */
export const NICIO_LOCALITATE: LocalitatiVanzare = { toate: false, localitati: [] };

export type RezultatLocalitati = { regula: LocalitatiVanzare; eroare: string | null };

function esteGol(raw: string | null | undefined): boolean {
  return raw == null || raw.trim() === '';
}

function parseazaJson(raw: string): { ok: true; valoare: unknown } | { ok: false } {
  try {
    return { ok: true, valoare: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * Lista deja decodată (din JSON-ul app_config sau din configurația publică a panoului) → regula.
 * null / [] = toate; listă de nume nevide = doar ele; orice altă formă = stricată.
 */
export function localitatiDinValoare(valoare: unknown): RezultatLocalitati {
  if (valoare === null || valoare === undefined) return { regula: TOATE_LOCALITATILE, eroare: null };
  if (!Array.isArray(valoare)) return { regula: NICIO_LOCALITATE, eroare: 'trebuie să fie o listă JSON de nume' };
  if (valoare.length === 0) return { regula: TOATE_LOCALITATILE, eroare: null };
  const nume = valoare.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
  if (nume.length !== valoare.length) return { regula: NICIO_LOCALITATE, eroare: 'lista conține elemente care nu sunt nume' };
  return { regula: { toate: false, localitati: nume }, eroare: null };
}

/** Textul din app_config.bilete_localitati_vanzare → regula. Lipsă sau gol = toate. */
export function parseazaLocalitatiVanzare(raw: string | null | undefined): RezultatLocalitati {
  if (esteGol(raw)) return { regula: TOATE_LOCALITATILE, eroare: null };
  const json = parseazaJson(raw as string);
  if (!json.ok) return { regula: NICIO_LOCALITATE, eroare: 'nu e JSON valid' };
  return localitatiDinValoare(json.valoare);
}

/** Regula → forma din configurația publică: null = toate, altfel lista (poate fi goală = nimic). */
export function localitatiPentruPublic(regula: LocalitatiVanzare): string[] | null {
  return regula.toate ? null : [...regula.localitati];
}

/**
 * Destinațiile perechii (Ion, 09.10.2026: «Briceni și Edineț spre Chișinău și din Chișinău spre Edineț și Briceni»;
 * «doar perechile cu Chișinău»): `app_config.bilete_destinatii_vanzare` = ["Chișinău"]. Cu destinații, cursa se vinde
 * doar dacă un capăt e în lista localităților și celălalt în destinații. Lipsă / gol / [] / null = fără restricție
 * (regula veche: urcare SAU coborâre); formă stricată = nicio pereche. Aceeași formă ca lista localităților.
 */
export function destinatiiDinValoare(valoare: unknown): RezultatLocalitati {
  return localitatiDinValoare(valoare);
}

export function parseazaDestinatii(raw: string | null | undefined): RezultatLocalitati {
  return parseazaLocalitatiVanzare(raw);
}

/**
 * Cursa (oprirea de urcare → oprirea de coborâre) se vinde online după regula listei; cu `destinatii` restrânse, doar
 * perechea «localitate din listă ↔ destinație», în oricare sens.
 */
export function cursaInLocalitatileVanzarii(regula: LocalitatiVanzare, urcare: string, coborare: string, destinatii: LocalitatiVanzare = TOATE_LOCALITATILE): boolean {
  const u = normalizeazaLocalitate(urcare);
  const c = normalizeazaLocalitate(coborare);
  const inLista = (r: LocalitatiVanzare, x: string) => r.toate || r.localitati.some((l) => normalizeazaLocalitate(l) === x);
  if (destinatii.toate) return regula.toate || inLista(regula, u) || inLista(regula, c);
  return (inLista(regula, u) && inLista(destinatii, c)) || (inLista(regula, c) && inLista(destinatii, u));
}

// ── Plafonul pe localitate ────────────────────────────────────────────────────────────────────────

/** Plafonul unei localități: câte locuri pe cursă se vând online cu urcare sau coborâre acolo. */
export interface PlafonLocalitate {
  /** Numele cum l-a scris Ion în app_config (pentru mesaj). */
  readonly nume: string;
  readonly locuri: number;
}

/** Cheia = numele normalizat. Hartă goală = fără nicio limită. */
export type PlafoaneLocalitati = ReadonlyMap<string, PlafonLocalitate>;

export type RezultatPlafoane = { plafoane: PlafoaneLocalitati; eroare: string | null };

const FARA_PLAFOANE: PlafoaneLocalitati = new Map();

/**
 * Textul din app_config.bilete_locuri_localitate → plafoanele. Lipsă / gol / {} = fără limită. Valorile trebuie să fie
 * întregi ≥ 0 (0 = la localitatea aceea nu se vinde nimic online); orice altă formă = stricată (`eroare` setată).
 */
export function parseazaPlafoaneLocalitati(raw: string | null | undefined): RezultatPlafoane {
  if (esteGol(raw)) return { plafoane: FARA_PLAFOANE, eroare: null };
  const json = parseazaJson(raw as string);
  if (!json.ok) return { plafoane: FARA_PLAFOANE, eroare: 'nu e JSON valid' };
  const v = json.valoare;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { plafoane: FARA_PLAFOANE, eroare: 'trebuie să fie un obiect JSON {"Localitate": locuri}' };
  const plafoane = new Map<string, PlafonLocalitate>();
  for (const [nume, locuri] of Object.entries(v as Record<string, unknown>)) {
    const cheie = normalizeazaLocalitate(nume);
    if (!cheie || typeof locuri !== 'number' || !Number.isInteger(locuri) || locuri < 0) {
      return { plafoane: FARA_PLAFOANE, eroare: `valoare nevalidă pentru «${nume}» (întreg ≥ 0)` };
    }
    plafoane.set(cheie, { nume: nume.trim(), locuri });
  }
  return { plafoane, eroare: null };
}

/**
 * O comandă a aceleiași curse (aceeași zi, rută, sens), cu ce trebuie ca să se numere la plafon. `status` e starea
 * din bilete_comenzi; contează doar «platita» și cele deschise («noua», «eroare_creare») încă active.
 */
export interface ComandaPentruPlafon {
  from_name: string;
  to_name: string;
  seats: number;
  status: string;
  created_at: string;
  /** 558 (revizia 10.10, M2): banii plății se întorc automat (intenție de refund vie) — nu mai ține loc. */
  bani_inapoi?: boolean | null;
}

/**
 * Cât ține locul o comandă neplătită: aceeași durată ca rezervarea locului ales (bilete_rezervare_durata, migr. 501);
 * după ea, comanda abandonată nu mai ocupă din plafon.
 */
export const DURATA_COMANDA_DESCHISA_MS = 30 * 60_000;

const STARI_DESCHISE = new Set<string>(['noua', 'eroare_creare']);

function comandaOcupaLoc(c: ComandaPentruPlafon, nowMs: number): boolean {
  // Ca bilete_comanda_activa (558, varianta cu bani_inapoi, fără refund în curs numărat): banii primiți fără bilet emis
  // țin locul — afară de cei care se întorc deja automat (M2, revizia 10.10).
  if (c.status === 'platita') return true;
  if (c.status === 'platita_fara_bilet') return !c.bani_inapoi;
  if (!STARI_DESCHISE.has(c.status)) return false;
  const creata = Date.parse(c.created_at);
  return Number.isFinite(creata) && nowMs - creata < DURATA_COMANDA_DESCHISA_MS;
}

function atingeLocalitatea(c: ComandaPentruPlafon, cheie: string): boolean {
  return normalizeazaLocalitate(c.from_name) === cheie || normalizeazaLocalitate(c.to_name) === cheie;
}

/** Locurile deja luate online pe cursă cu urcare sau coborâre la localitatea dată (plătite + comenzi noi active). */
export function locuriLuatePeLocalitate(comenzi: readonly ComandaPentruPlafon[], localitate: string, nowMs: number): number {
  const cheie = normalizeazaLocalitate(localitate);
  return comenzi
    .filter((c) => atingeLocalitatea(c, cheie) && comandaOcupaLoc(c, nowMs))
    .reduce((s, c) => s + (Number.isFinite(c.seats) ? c.seats : 0), 0);
}

export type VerdictPlafon =
  | { ok: true }
  | { ok: false; localitate: string; plafon: number; ramase: number };

/**
 * Încape comanda nouă (`seats` locuri, urcare → coborâre) în plafoanele localităților ei? Se verifică ambele capete;
 * primul plafon depășit e cel raportat. Localitățile fără plafon nu limitează nimic.
 */
export function verificaPlafonLocalitati(a: {
  plafoane: PlafoaneLocalitati;
  urcare: string;
  coborare: string;
  seats: number;
  comenziCursa: readonly ComandaPentruPlafon[];
  nowMs: number;
}): VerdictPlafon {
  const capete = [...new Set([normalizeazaLocalitate(a.urcare), normalizeazaLocalitate(a.coborare)])];
  for (const cheie of capete) {
    const plafon = a.plafoane.get(cheie);
    if (!plafon) continue;
    const luate = locuriLuatePeLocalitate(a.comenziCursa, cheie, a.nowMs);
    const ramase = Math.max(0, plafon.locuri - luate);
    if (a.seats > ramase) return { ok: false, localitate: plafon.nume, plafon: plafon.locuri, ramase };
  }
  return { ok: true };
}

/** Plafoanele au vreo localitate dintre capetele cursei? (Altfel nu e nevoie să citim comenzile cursei.) */
export function cursaAreLocalitateCuPlafon(plafoane: PlafoaneLocalitati, urcare: string, coborare: string): boolean {
  return plafoane.has(normalizeazaLocalitate(urcare)) || plafoane.has(normalizeazaLocalitate(coborare));
}
