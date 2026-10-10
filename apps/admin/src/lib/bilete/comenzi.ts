import 'server-only';
import {
  buildReturAssignmentMap, buildTurAssignmentMap, calculeazaCurse, cursaAreLocalitateCuPlafon, cursaInLocalitatileVanzarii,
  incarcaCurse, normalizeazaTelefonPasager, parseazaDestinatii, parseazaLocalitatiVanzare, parseazaPlafoaneLocalitati, parseTimeLabel,
  pretVandabilOnline, SUMA_MINIMA_PLATA_MDL, verificaPlafonLocalitati, type BileteComanda, type ComandaPentruPlafon,
  type CursaCuPret, type LocalitatiVanzare, type PlafoaneLocalitati,
  aplicaReducere, perechePromo,
} from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { createCheckout, findCheckoutByOrderId, MaibError, type MaibCheckout } from '@/lib/maib/client';
import { persistaCheckout } from '@/lib/maib/persist';
import { chisinauInstantIso, chisinauTimeOf, chisinauTodayIso } from '@/lib/chisinau-time';
import { calculeazaDepartureAt, cursaDupaDataDeStart, vanzareDeschisa } from './reguli';
import { localitateaPunctului, puncteActive } from './puncte';
import { alegePunct, punctePentru } from './puncte-reguli';
import { anuntaBotul } from './anunta-botul';
import { anuntaVanzarea } from './vanzari-grupa';
import { calculeazaPromo, citestePromoConfig, cotaCursei, localitateNeinceputa, plafoaneCursei, type MotivFaraReducere } from './promo-server';
import { amprentaAlegerii } from './amprenta';
import { rezervareExpirata, sesiuneInchisa } from './impacare-reguli';

// Comanda de bilete online (ION-193, pasul 4 din planul ION-190): validare → preț din @translux/db (același ca pe
// site) → rând în bilete_comenzi (plafoanele sunt în bază) → O SINGURĂ sesiune maib pe comandă → maib_checkouts.
// Biletele apar abia la callback (bilete_marcheaza_platita, migr. 483/484/486). Nimic de aici nu se încrede în
// suma venită din browser: prețul se recalculează mereu; la o reluare, banca primește suma COMENZII salvate.
//
// Ordinea (Codex X12): întâi comanda existentă (aceeași idempotency_key) — o reluare nu re-trece prin validările
// unei vânzări noi (steag închis între timp, fereastra de vânzare) ca să-și primească sesiunea deja creată.

export type ComandaCod = 'validare' | 'inchis' | 'plafon' | 'idempotenta' | 'in_lucru' | 'maib' | 'loc_ocupat';

export class ComandaError extends Error {
  /** ION-239: la `loc_ocupat`, locurile cerute care sunt deja luate (bilet viu sau rezervare a altei comenzi). */
  constructor(public readonly cod: ComandaCod, mesaj: string, public readonly ocupate: number[] = []) {
    super(mesaj);
    this.name = 'ComandaError';
  }
}

/** Capacitatea autobuzului (ION-239, migr. 501): 1 față + 5 × 3 + 4 spate. */
export const CAPACITATE_AUTOBUZ = 20;

export interface ComandaInput {
  tripDate: string;
  crmRouteId: number;
  goingNorth: boolean;
  fromRo: string;
  toRo: string;
  seats: number;
  passengerName: string;
  phone: string;
  email?: string | null;
  lang?: 'ro' | 'ru';
  idempotencyKey: string;
  ipHash?: string | null;
  telegramId?: number | null;
  /** ION-198: punctul de urcare ales pe site; lipsă → primul punct al cursei (dacă localitatea are puncte). */
  punctUrcareId?: number | null;
  /**
   * ION-239 (Ion, 05.10): pe retur (plecarea din Chișinău, going_north) pasagerul își alege locurile pe hartă — câte
   * unul pe loc, 1..20, distincte, libere (bilet viu sau rezervare a altei comenzi deschise = ocupat). Pe tur nu se
   * trimite: locul se dă automat la emitere. Lipsă sau gol → atribuire automată și pe retur.
   */
  locuriAlese?: number[] | null;
  /** Promoția retur −20% (migr. 546): codul de retur al turului (64 hex), din pagina biletului tur. */
  codRetur?: string | null;
  /** Promoția student −20% (migr. 546): jetonul primit după verificarea AI a carnetului. */
  studentJeton?: string | null;
  /**
   * 548 (Ion, 10.10.2026: «totul trebuie să fie achitare într-o pagină»): returul Bălți ⇄ Chișinău cumpărat cu turul, plătit
   * în aceeași sesiune (−20%); aceeași persoană și aceleași locuri ca turul.
   */
  retur?: { tripDate: string; crmRouteId: number; goingNorth: boolean; fromRo: string; toRo: string; idempotencyKey: string; locuriAlese?: number[] | null } | null;
  /**
   * 550: cheia turului din încercarea de dinainte a ACELUIAȘI browser (alegerea s-a schimbat după o încercare eșuată):
   * încercarea veche, neplătibilă, se expiră înaintea oricărei verificări, ca să nu țină locurile (planul tur-retur v4).
   */
  inlocuieste?: string[] | null;
}

/** Prețul unui loc pe pagina de probă fizică (Ion, 08.10.2026: «pui să fie biletul 10 lei ieftin»); = minimul plății maib. */
export const PRET_PROBA = 10;
export interface ComandaOptiuni {
  /**
   * `test_admin` ocolește steagurile de vânzare; permis DOAR dintr-o acțiune cu requireRole('ADMIN').
   * `proba` = pagina de probă fizică (532, Ion 08.10): test + proba_fizica, preț forțat PRET_PROBA, fără steaguri și
   * fără «cursa are șofer» (o vede doar șoferul is_test); permis DOAR din acțiunea paginii, după cheia secretă.
   */
  mod: 'public' | 'test_admin' | 'proba';
  /** Adresa panoului (pentru callbackUrl) și a site-ului (pentru successUrl/failUrl). */
  bazaAdmin: string;
  bazaSite: string;
  createdBy?: string | null;
  /** Adresa de întoarcere a pasagerului; implicit pagina biletului de pe site. `ok=false` = plata nereușită. */
  urlBilet?: (cod: string, lang: 'ro' | 'ru', ok: boolean) => string;
}

export interface ConfigBilete {
  activ: boolean;
  inchidereTurMin: number;
  inchidereReturMin: number;
  /** ION-264: localitățile în care se vinde online (urcare SAU coborâre); valoare stricată = nicio localitate. */
  localitati: LocalitatiVanzare;
  /** ION-264: locuri pe cursă pe localitate; null = valoarea din app_config e stricată → vânzarea publică se închide. */
  plafoaneLocalitati: PlafoaneLocalitati | null;
  /** Capătul celălalt al perechii (09.10: ["Chișinău"]); toate = regula veche (urcare SAU coborâre). */
  destinatii: LocalitatiVanzare;
  /** Prima zi de cursă care se vinde online (bilete_online_de_la, 09.10: «2026-10-12»); null = orice zi. */
  curseDeLa: string | null;
}

export type Rezultat = { comanda: BileteComanda; checkoutUrl: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Peste atâtea zile nu vindem: tariful se poate schimba, graficul nu există încă. */
const ZILE_INAINTE_MAX = 30;
/** Revendicarea creării sesiunii expiră după atât (funcția poate muri după ce banca a creat sesiunea). */
const REVENDICARE_MS = 2 * 60_000;
const DESCHISE = new Set(['noua', 'eroare_creare']);
/** Stările care pot ține un loc din plafonul localității (cele deschise contează doar cât sunt active). */
const STARI_PLAFON = ['platita', 'platita_fara_bilet', ...DESCHISE];

const CHEI_CONFIG = {
  activ: 'bilete_online_activ',
  inchidereTur: 'bilete_inchidere_tur_min',
  inchidereRetur: 'bilete_inchidere_retur_min',
  localitati: 'bilete_localitati_vanzare',
  plafoaneLocalitati: 'bilete_locuri_localitate',
  // Ion, 09.10.2026: «deschide vânzarea … începând de 12.10», «doar perechile cu Chișinău».
  deLa: 'bilete_online_de_la',
  destinatii: 'bilete_destinatii_vanzare',
} as const;

export async function citesteConfigBilete(): Promise<ConfigBilete> {
  const { data, error } = await getSupabase().from('app_config').select('key, value').in('key', Object.values(CHEI_CONFIG));
  if (error) throw new Error(`app_config: ${error.message}`);
  const m = new Map((data || []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const localitati = parseazaLocalitatiVanzare(m.get(CHEI_CONFIG.localitati));
  if (localitati.eroare) console.error(`[bilete] app_config.${CHEI_CONFIG.localitati} stricat (${localitati.eroare}) → nicio localitate nu se vinde`);
  const destinatii = parseazaDestinatii(m.get(CHEI_CONFIG.destinatii));
  if (destinatii.eroare) console.error(`[bilete] app_config.${CHEI_CONFIG.destinatii} stricat (${destinatii.eroare}) → nicio pereche nu se vinde`);
  const plafoane = parseazaPlafoaneLocalitati(m.get(CHEI_CONFIG.plafoaneLocalitati));
  if (plafoane.eroare) console.error(`[bilete] app_config.${CHEI_CONFIG.plafoaneLocalitati} stricat (${plafoane.eroare}) → vânzarea publică închisă`);
  return {
    // Ion, 09.10 (a doua decizie): vânzarea e deschisă de acum; bilete_online_de_la = prima zi de CURSĂ care se vinde.
    activ: m.get(CHEI_CONFIG.activ) === 'true',
    curseDeLa: m.get(CHEI_CONFIG.deLa)?.trim() || null,
    inchidereTurMin: Number(m.get(CHEI_CONFIG.inchidereTur) ?? 0) || 0,
    inchidereReturMin: Number(m.get(CHEI_CONFIG.inchidereRetur) ?? 120) || 0,
    localitati: localitati.regula,
    plafoaneLocalitati: plafoane.eroare ? null : plafoane.plafoane,
    destinatii: destinatii.regula,
  };
}

/** Locurile alese, validate (ION-239): null = atribuire automată. Aruncă ComandaError('validare'). */
export function valideazaLocuriAlese(locuri: number[] | null | undefined, seats: number, goingNorth: boolean): number[] | null {
  if (locuri == null || (Array.isArray(locuri) && locuri.length === 0)) return null;
  if (!Array.isArray(locuri)) throw new ComandaError('validare', 'locuri_alese trebuie să fie o listă de numere');
  if (!goingNorth) throw new ComandaError('validare', 'locul se alege doar la plecarea din Chișinău; pe tur se dă automat');
  if (locuri.length !== seats) throw new ComandaError('validare', `locuri_alese: câte un loc pentru fiecare din cele ${seats} bilete`);
  const ok = locuri.every((l) => Number.isInteger(l) && l >= 1 && l <= CAPACITATE_AUTOBUZ);
  if (!ok || new Set(locuri).size !== locuri.length) throw new ComandaError('validare', `locuri_alese: numere distincte între 1 și ${CAPACITATE_AUTOBUZ}`);
  return locuri;
}

function valideaza(input: ComandaInput): { phone: string; name: string; lang: 'ro' | 'ru'; email: string | null } {
  if (!UUID_RE.test(input.idempotencyKey)) throw new ComandaError('validare', 'idempotency_key nevalid');
  if (!DATE_RE.test(input.tripDate)) throw new ComandaError('validare', 'data nevalidă');
  const azi = chisinauTodayIso();
  if (input.tripDate < azi) throw new ComandaError('validare', 'cursa e în trecut');
  const zile = Math.round((Date.parse(input.tripDate) - Date.parse(azi)) / 86_400_000);
  if (zile > ZILE_INAINTE_MAX) throw new ComandaError('validare', `biletele se vând cu cel mult ${ZILE_INAINTE_MAX} de zile înainte`);
  if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > 4) throw new ComandaError('validare', 'locuri: 1–4');
  if (!Number.isInteger(input.crmRouteId) || input.crmRouteId <= 0) throw new ComandaError('validare', 'ruta nevalidă');
  const name = (input.passengerName ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (name.length < 2) throw new ComandaError('validare', 'numele lipsește');
  // Ion, 10.10.2026: «pot fi și bilete din Ucraina cu +380 sau altă țară, dar de bază e MD».
  const phone = normalizeazaTelefonPasager(input.phone);
  if (!phone) throw new ComandaError('validare', 'telefonul nu e valid (069 123 456 sau cu prefixul țării, +380 …)');
  const email = (input.email ?? '').trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ComandaError('validare', 'e-mailul nu e valid');
  const lang = input.lang === 'ru' ? 'ru' : 'ro';
  return { phone, name, lang, email };
}

/** Cursa cerută, din aceleași date și reguli ca pe site; null când nu există. */
interface CursaGasita {
  trip: CursaCuPret;
  fromOrder: number;
  toOrder: number;
  /** Numele canonice ale opririlor (crm_stop_fares.name_ro) — după ele se judecă localitățile vânzării. */
  fromNameRo: string;
  toNameRo: string;
  pornireRuta: string | null;
}

/**
 * Pornește o CITIRE acum și o lasă de așteptat mai târziu (Ion, 10.10.2026: «vezi cum de făcut ultra fast toată
 * procedura»): drumul la bază se suprapune cu altele, iar eroarea ei apare abia la `await`, deci în aceeași ordine ca
 * înainte. Doar pentru citiri — nicio scriere nu se pornește așa. Fără `await` (ramura n-o mai cere) nu e respingere
 * netratată.
 */
function porneste<T>(p: PromiseLike<T>): Promise<T> {
  const x = Promise.resolve(p);
  x.catch(() => { /* tratată la await */ });
  return x;
}

async function gasesteCursa(input: ComandaInput): Promise<CursaGasita | null> {
  const db = getSupabase();
  const d = await incarcaCurse(db, { fromRo: input.fromRo, toRo: input.toRo, date: input.tripDate });
  if (!d) return null;
  const trip = calculeazaCurse(d, input.tripDate).find((c) => c.routeId === input.crmRouteId && c.goingNorth === input.goingNorth);
  if (!trip) return null;
  const from = d.fromStops.find((s) => s.crm_route_id === trip.routeId);
  const to = d.toStops.find((s) => s.crm_route_id === trip.routeId);
  const route = d.routes.find((r) => r.id === trip.routeId);
  if (!from || !to || !route) return null;
  const interval = input.goingNorth ? route.time_chisinau : route.time_nord;
  const pornire = interval ? parseTimeLabel(interval) : null;
  return {
    trip, fromOrder: from.stop_order, toOrder: to.stop_order,
    fromNameRo: from.name_ro ?? input.fromRo.trim(), toNameRo: to.name_ro ?? input.toRo.trim(),
    pornireRuta: pornire && /^\d{2}:\d{2}$/.test(pornire) ? pornire : null,
  };
}

/** Șoferul atribuit cursei PE ziua cerută (fără căderea pe ziua anterioară de pe site), sau null. */
export async function soferulCursei(tripDate: string, crmRouteId: number, goingNorth: boolean): Promise<string | null> {
  const db = getSupabase();
  const sel = 'crm_route_id, driver_id, vehicle_id, vehicle_id_retur, driver_id_retur, retur_route_id';
  const [a, b] = await Promise.all([
    db.from('daily_assignments').select(sel).eq('assignment_date', tripDate).eq('crm_route_id', crmRouteId),
    db.from('daily_assignments').select(sel).eq('assignment_date', tripDate).eq('retur_route_id', crmRouteId),
  ]);
  if (a.error) throw new Error(`daily_assignments: ${a.error.message}`);
  if (b.error) throw new Error(`daily_assignments: ${b.error.message}`);
  const all = [...(a.data || []), ...(b.data || [])];
  const map = goingNorth ? buildReturAssignmentMap(all) : buildTurAssignmentMap(all);
  return map.get(crmRouteId)?.driver_id ?? null;
}

export async function areSofer(tripDate: string, crmRouteId: number, goingNorth: boolean): Promise<boolean> {
  return Boolean(await soferulCursei(tripDate, crmRouteId, goingNorth));
}

/**
 * Ion, 09.10.2026: «vânzarea online să fie doar la șoferii legați» — șoferul cursei e legat de Telegram (numai el vede
 * pasagerii online și le scanează biletele). `lipsa` = cursa n-are șofer în graficul zilei.
 */
/**
 * Starea șoferului cursei pentru vânzarea online. Ion, 09.10.2026: «vânzarea e posibilă fără grafic» și «la șoferii care
 * încă nu sunt logați în Telegram scanare bilete să nu fie posibilă vânzarea». Ziua are grafic → șoferul din el trebuie
 * să fie legat; ziua n-are încă grafic → `fara_grafic`, și se vinde (Ion, 10.10.2026: «vindem fără grafic» — returul la
 * 20.10 nu apărea pentru că șoferul se lua din graficul altei zile). `lipsa` = graficul zilei e făcut, dar ruta n-are
 * șofer. Împăcarea alertează cu 3 h înainte de plecare dacă tot nu e șofer legat (impacare.ts, D).
 */
export async function stareSoferCursa(tripDate: string, crmRouteId: number, goingNorth: boolean): Promise<'fara_grafic' | 'lipsa' | 'nelegat' | 'legat'> {
  const db = getSupabase();
  // Graficul zilei se numără deodată cu căutarea șoferului (un drum la bază mai puțin când ruta n-are șofer); erorile
  // rămân în ordinea de dinainte: întâi ale șoferului, apoi ale numărării.
  const ziua = porneste(db.from('daily_assignments').select('id', { count: 'exact', head: true }).eq('assignment_date', tripDate));
  const id = await soferulCursei(tripDate, crmRouteId, goingNorth);
  if (!id) {
    const { count, error } = await ziua;
    if (error) throw new Error(`daily_assignments: ${error.message}`);
    return (count ?? 0) > 0 ? 'lipsa' : 'fara_grafic';
  }
  // C8 (10.10): ca public_drivers_view.bilete_online (543) — șoferul de test nu e «legat».
  const { data, error } = await db.from('drivers').select('telegram_id, active, is_test').eq('id', id).maybeSingle();
  if (error) throw new Error(`drivers: ${error.message}`);
  const d = data as { telegram_id: number | null; active: boolean; is_test: boolean | null } | null;
  return d?.telegram_id != null && d.active && !d.is_test ? 'legat' : 'nelegat';
}

/** ION-264: cursa se vinde online doar cu urcare sau coborâre într-o localitate din listă. Aruncă ComandaError('inchis'). */
function verificaLocalitateaVanzarii(localitati: LocalitatiVanzare, cursa: CursaGasita, destinatii: LocalitatiVanzare): void {
  if (cursaInLocalitatileVanzarii(localitati, cursa.fromNameRo, cursa.toNameRo, destinatii)) return;
  if (!destinatii.toate) {
    throw new ComandaError('inchis', `online se vând deocamdată doar biletele ${localitatiDeAfisat(localitati)} ↔ ${localitatiDeAfisat(destinatii)}; pe această cursă biletul se ia de la șofer`);
  }
  throw new ComandaError('inchis', `online se vând deocamdată doar biletele cu urcare sau coborâre la ${localitatiDeAfisat(localitati)}; pe această cursă biletul se ia de la șofer`);
}

function localitatiDeAfisat(localitati: LocalitatiVanzare): string {
  if (localitati.toate || localitati.localitati.length === 0) return 'localitățile anunțate';
  return localitati.localitati.join(', ');
}

/** Comenzile cursei care pot ține locuri din plafon (fără cele de test). */
async function comenzileCurseiPentruPlafon(input: ComandaInput): Promise<ComandaPentruPlafon[]> {
  const { data, error } = await getSupabase().from('bilete_comenzi')
    .select('from_name, to_name, seats, status, created_at, bani_inapoi')
    .eq('trip_date', input.tripDate).eq('crm_route_id', input.crmRouteId).eq('going_north', input.goingNorth)
    .eq('test', false).in('status', STARI_PLAFON);
  if (error) throw new Error(`bilete_comenzi (plafon localitate): ${error.message}`);
  return (data || []) as ComandaPentruPlafon[];
}

/**
 * ION-264: plafonul pe localitate (app_config.bilete_locuri_localitate). Plafoane stricate = vânzare închisă.
 * Verificarea e înaintea INSERT-ului, nu sub lacătul cursei din bilete_creeaza_comanda: două comenzi simultane la
 * ultimul loc pot trece amândouă (depășire de cel mult o comandă, 1–4 locuri). Aruncă ComandaError('inchis').
 */
async function verificaPlafonulLocalitatii(
  plafoane: PlafoaneLocalitati | null, cursa: CursaGasita, input: ComandaInput,
  /** Comenzile cursei citite deja (pornite în prima rundă a creeazaRand); lipsă → se citesc acum. */
  comenziCitite?: Promise<ComandaPentruPlafon[]>,
): Promise<void> {
  if (!plafoane) throw new ComandaError('inchis', 'vânzarea online e temporar închisă (configurația plafoanelor pe localitate)');
  if (!cursaAreLocalitateCuPlafon(plafoane, cursa.fromNameRo, cursa.toNameRo)) return;
  const verdict = verificaPlafonLocalitati({
    plafoane, urcare: cursa.fromNameRo, coborare: cursa.toNameRo, seats: input.seats,
    comenziCursa: await (comenziCitite ?? comenzileCurseiPentruPlafon(input)), nowMs: Date.now(),
  });
  if (verdict.ok) return;
  const rest = verdict.ramase > 0 ? `mai sunt ${verdict.ramase}` : 'nu mai sunt locuri';
  throw new ComandaError('inchis', `pe această cursă online se vând cel mult ${verdict.plafon} locuri cu urcare sau coborâre la ${verdict.localitate}; ${rest}`);
}

async function directiaDeschisa(crmRouteId: number, goingNorth: boolean): Promise<boolean> {
  const { data, error } = await getSupabase().from('crm_routes').select('bilete_online_tur, bilete_online_retur').eq('id', crmRouteId).maybeSingle();
  if (error) throw new Error(`crm_routes: ${error.message}`);
  if (!data) return false;
  return goingNorth ? Boolean(data.bilete_online_retur) : Boolean(data.bilete_online_tur);
}

/**
 * N3 (564): amprenta ÎNTREGII alegeri a cererii (vezi amprenta.ts) — una singură, comparată în toate ramurile care refolosesc
 * o comandă: cheia existentă, sesiunea veche deschisă la bancă, returul din pachet și rândul întors de bilete_creeaza_comanda.
 * (Înainte: `trip_date|crm_route_id|going_north|seats|phone` — o reluare cu alt loc, alt nume sau alt punct de urcare primea
 * comanda veche.)
 */
function amprentaCererii(input: ComandaInput, v: ReturnType<typeof valideaza>, locuriAlese: number[] | null): string {
  return amprentaAlegerii({
    tripDate: input.tripDate, crmRouteId: input.crmRouteId, goingNorth: input.goingNorth, fromRo: input.fromRo, toRo: input.toRo,
    seats: input.seats, locuriAlese, passengerName: v.name, phone: v.phone, email: v.email, punctUrcareId: input.punctUrcareId ?? null,
    codRetur: input.codRetur ?? null, studentJeton: input.studentJeton ?? null,
    retur: input.retur ? {
      tripDate: String(input.retur.tripDate), crmRouteId: Number(input.retur.crmRouteId), goingNorth: input.retur.goingNorth === true,
      fromRo: String(input.retur.fromRo ?? '').slice(0, 80), toRo: String(input.retur.toRo ?? '').slice(0, 80), locuriAlese: input.retur.locuriAlese ?? null,
    } : null,
  });
}
const MESAJ_ALT_CONTINUT = 'aceeași cheie, alt conținut';

/** Mesajul pentru client când reducerea cerută nu se aplică (același text la cod greșit și la altă persoană). */
export function mesajFaraReducere(motiv: MotivFaraReducere | undefined): string {
  switch (motiv) {
    case 'cod_retur': return 'reducerea la retur nu se aplică: returul −20% se cumpără imediat după tur (în 30 de minute), în sens invers, pe altă cursă, pe aceeași persoană, cu întoarcerea în 30 de zile';
    case 'student': return 'reducerea de student nu se aplică: verificarea carnetului a expirat sau e pe alt nume/telefon; refă verificarea';
    case 'student_locuri': return 'reducerea de student e pentru un singur loc pe bilet';
    case 'sofer': return 'promoțiile nu se aplică pe acest număr de telefon';
    case 'pret_mic': return 'la acest preț reducerea nu se aplică';
    case 'promo_inchis': return 'promoțiile online nu sunt deschise acum';
    case 'nu_e_pereche': return 'promoțiile sunt doar pe Bălți ⇄ Chișinău';
    default: return 'reducerea nu se aplică';
  }
}

function descriereDin(c: BileteComanda): string {
  return `Bilet ${c.from_name} → ${c.to_name}, ${c.trip_date} ${chisinauTimeOf(c.departure_at)}, ${c.seats} loc.`.slice(0, 125);
}

function urlBiletImplicit(bazaSite: string) {
  return (cod: string, lang: 'ro' | 'ru', ok: boolean) => `${bazaSite}/${lang}/bilet/${cod}${ok ? '' : '?plata=nu'}`;
}

/**
 * Creează comanda și sesiunea de plată. Pe `public` se aplică steagurile vânzării, inclusiv lista localităților și
 * plafonul pe localitate (ION-264); `test_admin` le ocolește pe toate, ca până acum.
 * Aruncă ComandaError cu cod: validare (400), inchis (400), plafon (429),
 * idempotenta (409), in_lucru (409), loc_ocupat (409, cu `ocupate`), maib (503).
 */
export async function creeazaComanda(input: ComandaInput, opt: ComandaOptiuni): Promise<Rezultat> {
  const v = valideaza(input);
  if ((opt.mod === 'public' || opt.mod === 'proba') && !input.ipHash) throw new ComandaError('validare', 'ip_hash lipsește');
  const locuriAlese = valideazaLocuriAlese(input.locuriAlese, input.seats, input.goingNorth);
  const db = getSupabase();
  const amprenta = amprentaCererii(input, v, locuriAlese);
  // Toate cheile vechi ale browserului (cel mult 4): una pe care serverul n-a văzut-o întoarce «nimic» (audit #1).
  for (const k of (input.inlocuieste ?? []).slice(0, 4)) {
    try { await inlocuiesteIncercarea(k, input); } catch (e) {
      // «Reia plata» după «Înapoi» de pe pagina băncii (Ion, 10.10.2026): sesiunea veche e încă deschisă la maib. Dacă
      // alegerea e aceeași (amprenta întreagă, 564), omul e trimis înapoi pe ACEEAȘI pagină a băncii — nicio a doua plată
      // posibilă. Altă alegere → mesajul de până acum («plata de dinainte e încă deschisă»).
      if (!(e instanceof ComandaError) || e.message !== MESAJ_LA_BANCA) throw e;
      const aceeasi = await sesiuneaAceleiasiAlegeri(k, input, amprenta);
      if (!aceeasi) throw e;
      return await asiguraSesiunea(aceeasi, opt);
    }
  }

  // 1. Reluare? Comanda există deja pentru cheia asta → nu re-validăm vânzarea, îi dăm sesiunea ei — DOAR dacă e aceeași
  // alegere (564, N3): altfel refuz «idempotenta», iar formularul vine cu chei noi și cheia asta în `inlocuieste`.
  // Amprenta conține și intrarea promoției (codul de retur, jetonul — 546 BLA-3/N11), deci aceeași reducere cerută.
  const { data: existenta, error: eErr } = await db.from('bilete_comenzi').select('*').eq('idempotency_key', input.idempotencyKey).maybeSingle();
  if (eErr) throw new Error(`bilete_comenzi: ${eErr.message}`);
  if (existenta) {
    const comanda = existenta as BileteComanda;
    // O comandă fără amprentă (scrisă înainte de 564) nu se refolosește: refuzul duce la o comandă nouă, care o înlocuiește.
    if ((comanda.amprenta ?? null) !== amprenta) throw new ComandaError('idempotenta', MESAJ_ALT_CONTINUT);
    if (input.retur) await asiguraReturPachet(comanda, input, opt, amprenta);
    else {
      // Audit H1: returul scos din formular după o încercare eșuată → sesiunea ar cere și returul. Comandă nouă.
      const { count } = await db.from('bilete_comenzi').select('id', { count: 'exact', head: true }).eq('comanda_tur_id', comanda.id).eq('in_pachet', true).in('status', [...DESCHISE]);
      if ((count ?? 0) > 0) throw new ComandaError('idempotenta', 'comanda are deja un retur; reîncarcă pagina ca să cumperi fără retur');
    }
    return await asiguraSesiunea(comanda, opt);
  }

  // Tur-retur: eroarea spune la care bilet (plan tur-retur, B1): «la tur: …» / «la retur: …».
  const tur = await cuEticheta(input.retur ? 'la tur' : null, () => creeazaRand(input, opt, v, locuriAlese, null, amprenta));
  if (input.retur) {
    try { await cuEticheta('la retur', () => asiguraReturPachet(tur, input, opt, amprenta)); } catch (e) {
      // 551 (Ion, 10.10: «pe viitor să nu mai fie»): turul abia creat, fără retur și fără bancă, nu rămâne agățat cu locul
      // ales — altfel harta i-l arată omului ca ocupat și următoarea încercare cere «încă 1 loc».
      // 564: «idempotenta» la retur = returul pachetului există deja (o cerere concurentă l-a creat): turul e al acelui
      // pachet și nu se expiră de aici.
      if (!(e instanceof ComandaError && e.cod === 'idempotenta')) await expiraTurFaraRetur(tur.id);
      throw e;
    }
  }
  return await asiguraSesiunea(tur, opt);
}

/** Turul nou al unui tur-retur al cărui retur n-a putut fi creat: expirat, cât încă n-a ajuns la bancă. */
async function expiraTurFaraRetur(turId: string): Promise<void> {
  const { error } = await getSupabase().from('bilete_comenzi')
    .update({ status: 'expirata', creare_in_curs_la: null, updated_at: new Date().toISOString() })
    .eq('id', turId).eq('status', 'noua').is('checkout_id', null);
  if (error) console.error('[bilete] turul fără retur nu s-a expirat', turId, error.message);
}

async function cuEticheta<T>(eticheta: string | null, f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e) {
    if (eticheta && e instanceof ComandaError && e.cod !== 'idempotenta') throw new ComandaError(e.cod, `${eticheta}: ${e.message}`, e.ocupate);
    throw e;
  }
}

/**
 * Înlocuirea încercării proprii de dinainte (550). Cheia veche = dovada posesiei. O încercare cu sesiuni încercate la bancă
 * se înlocuiește doar dacă maib nu are o sesiune deschisă pentru ea; altfel omul așteaptă (fără a doua plată).
 */
async function inlocuiesteIncercarea(cheie: string, input: ComandaInput): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(cheie)) throw new ComandaError('validare', 'cheia încercării de dinainte nu e validă');
  if (cheie === input.idempotencyKey || cheie === input.retur?.idempotencyKey) throw new ComandaError('validare', 'încercarea de dinainte nu poate fi comanda de acum');
  const db = getSupabase();
  const { data, error } = await db.from('bilete_comenzi').select('id, status, checkout_id, creare_incercari, creare_in_curs_la, phone')
    .eq('idempotency_key', cheie).maybeSingle();
  if (error) throw new Error(`bilete_comenzi (înlocuire): ${error.message}`);
  const c = data as { id: string; status: string; checkout_id: string | null; creare_incercari: number; creare_in_curs_la: string | null; phone: string } | null;
  // Cheia (122 de biți aleatori din browser) e dovada; telefonul se ia de pe rândul vechi — omul poate să-l fi corectat (audit #4).
  if (!c || !DESCHISE.has(c.status as BileteComanda['status'])) return;
  // Plata eșuată la bancă (MIA/aplicația băncii, card refuzat — Ion, 10.10: «am pierdut toți pașii»): sesiunea maib e
  // închisă fără bani, deci încercarea veche (și returul ei din pachet) se expiră și omul plătește pe o comandă nouă.
  if (c.checkout_id) {
    const { data: ck, error: eCk } = await db.from('maib_checkouts').select('status, payment_status').eq('checkout_id', c.checkout_id).maybeSingle();
    if (eCk) throw new Error(`maib_checkouts (înlocuire): ${eCk.message}`);
    const st = String(ck?.status ?? '').toLowerCase(), pl = String(ck?.payment_status ?? '').toLowerCase();
    if (['failed', 'expired', 'cancelled', 'declined'].includes(st) && !['executed', 'completed'].includes(pl)) {
      // Revizia 10.10 (M4): starea locală nu ajunge — banca confirmă că sesiunea e închisă, altfel o a doua încercare pe
      // aceeași pagină de plată ar putea reuși după ce comanda veche a fost expirată (două plăți).
      let laBanca: Awaited<ReturnType<typeof findCheckoutByOrderId>>;
      try { laBanca = await findCheckoutByOrderId(c.id); } catch { throw new ComandaError('in_lucru', MESAJ_LA_BANCA); }
      if (laBanca && !sesiuneInchisa(laBanca.status) && String(laBanca.status ?? '').toLowerCase() !== 'declined') throw new ComandaError('in_lucru', MESAJ_LA_BANCA);
      const acum = new Date().toISOString();
      const { error: eE } = await db.from('bilete_comenzi').update({ status: 'expirata', creare_in_curs_la: null, updated_at: acum })
        .or(`id.eq.${c.id},and(comanda_tur_id.eq.${c.id},in_pachet.eq.true)`).in('status', ['noua', 'eroare_creare']);
      if (eE) throw new Error(`bilete_comenzi (plată eșuată): ${eE.message}`);
      return;
    }
  }
  const phone = c.phone;
  let incercari: number | null = c.creare_incercari;
  if (c.creare_incercari > 0 && !c.checkout_id && !c.creare_in_curs_la) {
    let gasit: Awaited<ReturnType<typeof findCheckoutByOrderId>>;
    try { gasit = await findCheckoutByOrderId(c.id); } catch { throw new ComandaError('in_lucru', MESAJ_LA_BANCA); }
    const s = (gasit?.status ?? '').toLowerCase();
    if (gasit && !['expired', 'cancelled', 'failed', 'abandoned'].includes(s)) incercari = null;
  }
  const { data: r, error: eR } = await db.rpc('bilete_inlocuieste_incercare', { p_cheie: cheie, p_phone: phone, p_incercari: incercari });
  if (eR) throw new Error(`bilete_inlocuieste_incercare: ${eR.message}`);
  if (r === 'la_banca') throw new ComandaError('in_lucru', MESAJ_LA_BANCA);
}
const MESAJ_LA_BANCA = 'plata de dinainte e încă deschisă la bancă; încearcă din nou peste câteva minute';

/** Comanda veche (cheia dată spre înlocuire), cu sesiune maib, dacă e exact aceeași alegere ca cererea de acum. */
async function sesiuneaAceleiasiAlegeri(cheie: string, input: ComandaInput, amprenta: string): Promise<BileteComanda | null> {
  const db = getSupabase();
  const { data } = await db.from('bilete_comenzi').select('*').eq('idempotency_key', cheie).maybeSingle();
  const c = data as BileteComanda | null;
  if (!c || !c.checkout_id || !DESCHISE.has(c.status)) return null;
  // 564 (N3): aceeași amprentă = aceeași cursă, opriri, locuri (ambele sensuri), nume, telefon, e-mail, punct, promoție, retur.
  if ((c.amprenta ?? null) !== amprenta) return null;
  const { data: rt } = await db.from('bilete_comenzi').select('id, amprenta')
    .eq('comanda_tur_id', c.id).eq('in_pachet', true).in('status', [...DESCHISE]).maybeSingle();
  if (Boolean(rt) !== Boolean(input.retur)) return null;
  if (rt && ((rt as { amprenta?: string | null }).amprenta ?? null) !== amprenta) return null;
  return c;
}

/**
 * Returul din pachet (548): aceeași persoană, aceleași locuri, plătit în sesiunea turului. Nu se cumulează cu studentul
 * pe tur. Reluarea (aceeași cheie, aceeași amprentă) întoarce returul existent.
 * 564 (F15, Codex r3 C3): un al DOILEA retur pe același tur nu se creează niciodată — nici când primul a expirat (suma
 * pachetului le-ar număra pe amândouă); reluarea returului identic rămâne. Aceeași regulă stă și în SQL, sub lacătul
 * perechii (RETUR_PACHET_EXISTENT).
 */
async function asiguraReturPachet(tur: BileteComanda, input: ComandaInput, opt: ComandaOptiuni, amprenta: string): Promise<BileteComanda> {
  const r = input.retur!;
  const db = getSupabase();
  // Configurația promoției se citește deodată cu returul existent; eroarea ei apare tot abia după verificările de mai jos.
  const promoCfgCitit = porneste(citestePromoConfig());
  const { data: exist, error: eX } = await db.from('bilete_comenzi').select('*').eq('comanda_tur_id', tur.id).eq('in_pachet', true)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (eX) throw new Error(`bilete_comenzi (pachet): ${eX.message}`);
  if (exist) {
    const e = exist as BileteComanda;
    if (!DESCHISE.has(e.status)) throw new ComandaError('idempotenta', 'returul acestei comenzi nu mai e deschis; reîncarcă pagina');
    // Audit M2 + 564: altă zi / cursă / opriri / locuri ale returului (sau altă alegere a turului) → nu plătim returul vechi.
    if ((e.amprenta ?? null) !== amprenta) throw new ComandaError('idempotenta', 'returul ales s-a schimbat; reîncarcă pagina');
    return e;
  }
  if (tur.checkout_id || !DESCHISE.has(tur.status)) throw new ComandaError('validare', 'turul e deja în plată; returul −20% se adaugă doar la cumpărarea turului');
  if (opt.mod === 'proba') throw new ComandaError('validare', 'tur-returul nu merge pe comanda de probă');
  if (tur.reducere_tip) throw new ComandaError('validare', 'reducerile nu se cumulează: tur-returul e fără reducerea de student');
  const promoCfg = await promoCfgCitit;
  if (!promoCfg.activ) throw new ComandaError('validare', mesajFaraReducere('promo_inchis'));
  if (!perechePromo(tur.from_name, tur.to_name)) throw new ComandaError('validare', mesajFaraReducere('nu_e_pereche'));
  const returInput: ComandaInput = {
    ...input, tripDate: String(r.tripDate), crmRouteId: Number(r.crmRouteId), goingNorth: r.goingNorth === true,
    fromRo: String(r.fromRo ?? '').slice(0, 80), toRo: String(r.toRo ?? '').slice(0, 80), seats: tur.seats,
    idempotencyKey: String(r.idempotencyKey ?? ''), locuriAlese: null, punctUrcareId: null, codRetur: null, studentJeton: null, retur: null,
  };
  if (!/^[0-9a-f-]{36}$/i.test(returInput.idempotencyKey) || returInput.idempotencyKey === input.idempotencyKey) throw new ComandaError('validare', 'cheia returului lipsește');
  // Revizia 10.10 (L5): data returului — format valid și nu în trecut. Termenul (cel mult 30 de zile după tur) îl ține
  // funcția din bază (RETUR_TERMEN); limita «30 de zile față de azi» a turului NU se aplică returului (calendarul și
  // termenii permit turul + 30 de zile).
  if (!DATE_RE.test(returInput.tripDate) || returInput.tripDate < chisinauTodayIso()) throw new ComandaError('validare', 'data returului nu e validă');
  const v = valideaza(input);
  // Revizia 10.10 (H1): returul −20% e tot pe Bălți ⇄ Chișinău, în sens invers turului — nu orice cursă spre Chișinău.
  if (!perechePromo(returInput.fromRo, returInput.toRo) || returInput.goingNorth === tur.going_north) {
    throw new ComandaError('validare', mesajFaraReducere('nu_e_pereche'));
  }
  // Locurile returului pe hartă (doar spre nord, din Chișinău) — Ion, 10.10: «apoi locul din Chișinău».
  const locuriRetur = valideazaLocuriAlese(r.locuriAlese ?? null, tur.seats, returInput.goingNorth);
  return creeazaRand({ ...returInput, locuriAlese: locuriRetur }, opt, v, locuriRetur, { tur, pct: promoCfg.pct }, amprenta);
}

/**
 * Rândul unei comenzi noi (tur sau retur din pachet), cu toate verificările vânzării; fără sesiunea de plată.
 * `amprenta` (564) se scrie pe rând; dacă o cerere concurentă cu aceeași cheie a creat rândul întâi, funcția din bază îl
 * întoarce doar cu aceeași amprentă (altfel IDEMPOTENTA_CONTINUT, sub lacăt).
 */
async function creeazaRand(
  input: ComandaInput, opt: ComandaOptiuni, v: ReturnType<typeof valideaza>, locuriAlese: number[] | null,
  pachet: { tur: BileteComanda; pct: number } | null, amprenta: string,
): Promise<BileteComanda> {
  const db = getSupabase();

  // Citiri pornite acum și așteptate abia unde trebuie (Ion, 10.10.2026: «ultra fast»): comenzile cursei pentru plafonul
  // pe localitate (doar la public) și punctele de urcare. Erorile lor apar tot acolo unde apăreau.
  const comenziPlafon = opt.mod === 'public' ? porneste(comenzileCurseiPentruPlafon(input)) : undefined;
  const puncteCitite = porneste(puncteActive().catch((e: unknown) => { console.warn('[bilete] puncte indisponibile:', e instanceof Error ? e.message : e); return []; }));

  // 2. Vânzare nouă: cele patru citiri sunt independente → în paralel; erorile în ordinea de mai jos.
  const [cfg, promoCfg, directie, cursa, sofer] = await Promise.all([
    citesteConfigBilete(),
    citestePromoConfig(),
    opt.mod === 'public' ? directiaDeschisa(input.crmRouteId, input.goingNorth) : Promise.resolve(true),
    gasesteCursa(input),
    stareSoferCursa(input.tripDate, input.crmRouteId, input.goingNorth),
  ]);
  if (opt.mod === 'public') {
    if (!cfg.activ) throw new ComandaError('inchis', 'vânzarea online nu e deschisă');
    if (!cursaDupaDataDeStart(cfg.curseDeLa, input.tripDate)) {
      throw new ComandaError('inchis', `online se vând biletele pentru cursele din ${(cfg.curseDeLa ?? '').split('-').reverse().join('.')} încolo`);
    }
    if (!directie) throw new ComandaError('inchis', 'vânzarea online nu e deschisă pe această cursă');
  }
  if (!cursa) throw new ComandaError('validare', 'cursa nu există între aceste opriri');
  if (opt.mod === 'public') {
    verificaLocalitateaVanzarii(cfg.localitati, cursa, cfg.destinatii);
    // Ion, 10.10.2026: «lansăm de pe 13.10 vânzări online Bălți–Chișinău» — data de start pe localitate.
    const deLa = localitateNeinceputa(promoCfg, cursa.fromNameRo, cursa.toNameRo, input.tripDate);
    if (deLa) throw new ComandaError('inchis', `pe această direcție online se vând biletele pentru cursele din ${deLa.split('-').reverse().join('.')} încolo`);
  }
  if (!(cursa.trip.price > 1)) throw new ComandaError('validare', 'prețul cursei nu e cunoscut încă');
  if (opt.mod !== 'proba' && !pretVandabilOnline(cursa.trip.price)) throw new ComandaError('validare', `biletul costă sub ${SUMA_MINIMA_PLATA_MDL} lei; se cumpără la șofer`);
  // Ion, 09.10: «vânzarea e posibilă fără grafic, graficul ulterior doar dă date adiționale» — fără grafic pe zi se vinde;
  // cu grafic, ruta fără șofer nu merge, iar șoferul trebuie să fie legat (decizia de mai devreme a aceleiași zile).
  if (sofer === 'lipsa' && opt.mod !== 'proba') throw new ComandaError('inchis', 'cursa nu are șofer în graficul zilei');
  // Ion, 09.10.2026: «vânzarea online să fie doar la șoferii legați» — doar el vede pasagerii și scanează biletele.
  // Ion, 10.10: «vindem fără grafic» — doar șoferul din graficul ZILEI, când există, trebuie să fie legat.
  if (sofer === 'nelegat' && opt.mod === 'public') throw new ComandaError('inchis', 'pe această cursă biletul se ia deocamdată de la șofer');

  const departureAt = calculeazaDepartureAt(input.tripDate, cursa.trip.time, cursa.pornireRuta);
  const pornireRutaAt = chisinauInstantIso(input.tripDate, cursa.pornireRuta ?? cursa.trip.time);
  // Proba fizică (Ion, 08.10: «fă cursa de test»): aplicația șoferului scanează doar cursele de AZI, deci la probă se
  // cumpără orice cursă de azi, și una a cărei vânzare s-a închis; biletul de probă îl scanează doar șoferul de probă.
  if (opt.mod !== 'proba' && !vanzareDeschisa({ goingNorth: input.goingNorth, departureAt, pornireRutaAt, nowMs: Date.now(), inchidereTurMin: cfg.inchidereTurMin, inchidereReturMin: cfg.inchidereReturMin })) {
    throw new ComandaError('inchis', 'vânzarea pentru această cursă s-a închis');
  }
  // Plafonul Bălțiului pe cursa asta = cota ei (vineri spre Bălți 11–12 → 7; seara de vineri/duminică → 2), ca în bază.
  if (opt.mod === 'public') await verificaPlafonulLocalitatii(plafoaneCursei(cfg.plafoaneLocalitati, promoCfg, { goingNorth: input.goingNorth, departureAt }), cursa, input, comenziPlafon);

  // Proba fizică (Ion, 08.10: «pui să fie biletul 10 lei»): prețul forțat; totalul se socotește după, deci amount = total.
  // Promoțiile Bălți ⇄ Chișinău (546): reducerea doar la public / test_admin; cerută dar neaplicabilă → refuz cu motivul
  // (clientul a văzut cota și nu trebuie să plătească alt preț decât a crezut).
  const promo = pachet ? promoPachet(cursa.trip.price, pachet, cursa.fromNameRo, cursa.toNameRo) : await calculeazaPromo({
    mod: opt.mod, test: opt.mod !== 'public', phone: v.phone, passengerName: v.name, urcare: cursa.fromNameRo, coborare: cursa.toNameRo,
    goingNorth: input.goingNorth, crmRouteId: input.crmRouteId, tripDate: input.tripDate, departureAt, seats: input.seats,
    pret: cursa.trip.price, codRetur: input.codRetur ?? null, studentJeton: input.studentJeton ?? null,
  }, promoCfg);
  if ((input.codRetur || input.studentJeton) && !promo.reducere) throw new ComandaError('validare', mesajFaraReducere(promo.motiv));
  const cota = cotaCursei(cfg.plafoaneLocalitati, promoCfg, { urcare: cursa.fromNameRo, coborare: cursa.toNameRo, goingNorth: input.goingNorth, departureAt });

  const pricePerSeat = opt.mod === 'proba' ? PRET_PROBA : promo.pret;
  const total = Number((pricePerSeat * input.seats).toFixed(2));

  // Punctul de urcare (ION-198): din bază, după numele canonic al opririi; copia nume/coordonate o face serverul.
  // Punctele nu sunt o condiție a vânzării: dacă tabelul nu răspunde, comanda merge fără punct (ca înainte de ION-198).
  const active = await puncteCitite;
  const lista = punctePentru(active, cursa.fromNameRo, input.crmRouteId, input.goingNorth);
  const cerut = input.punctUrcareId ?? null;
  // id ∉ lista cursei → a cui localitate e? Dacă citirea cade, îl tratăm ca dezactivat (primul punct), nu refuzăm comanda.
  const localitateaCeruta = cerut != null && !lista.some((p) => p.id === cerut) && Number.isInteger(cerut) && cerut > 0
    ? await localitateaPunctului(cerut).catch(() => cursa.fromNameRo) : null;
  const alegere = alegePunct(lista, cursa.fromNameRo, cerut, localitateaCeruta);
  if (alegere.tip === 'validare') throw new ComandaError('validare', 'punctul de urcare nu e al acestei opriri');
  const punct = alegere.tip === 'punct' ? alegere.punct : null;

  // 3. Plafoanele și INSERT-ul, atomic, în bază (migr. 483/485).
  const { data: rand, error } = await db.rpc('bilete_creeaza_comanda', {
    p: {
      idempotency_key: input.idempotencyKey,
      trip_date: input.tripDate,
      crm_route_id: input.crmRouteId,
      going_north: input.goingNorth,
      from_stop_order: cursa.fromOrder,
      to_stop_order: cursa.toOrder,
      from_name: input.fromRo.trim(),
      to_name: input.toRo.trim(),
      departure_at: departureAt,
      seats: input.seats,
      price_per_seat: pricePerSeat,
      total,
      passenger_name: v.name,
      phone: v.phone,
      email: v.email,
      lang: v.lang,
      ip_hash: input.ipHash ?? '',
      test: opt.mod !== 'public',
      proba_fizica: opt.mod === 'proba',
      punct_urcare_id: punct?.id ?? null,
      punct_urcare_nume_ro: punct?.nume_ro ?? null,
      punct_urcare_nume_ru: punct?.nume_ru ?? null,
      punct_urcare_lat: punct?.lat ?? null,
      punct_urcare_lon: punct?.lon ?? null,
      // ION-239: locurile alese (retur) — verificate în funcție, sub lacătul cursei, împreună cu INSERT-ul
      locuri_alese: locuriAlese,
      // 546: promoția (reverificată în funcție, sub lacăt) și cota online a cursei
      pret_intreg: promo.reducere ? promo.pretIntreg : null,
      reducere_tip: promo.reducere?.tip ?? null,
      reducere_pct: promo.reducere?.pct ?? null,
      comanda_tur_id: promo.reducere?.turId ?? null,
      student_verificare_id: promo.reducere?.verificareId ?? null,
      nume_pasager_cheie: promo.reducere?.numeCheie ?? null,
      promo_pereche: promo.promoPereche,
      loc_cheie: cota.chei,
      cota_online: cota.cota,
      in_pachet: pachet != null,
      // 564 (N3): amprenta alegerii; rândul existent cu aceeași cheie se întoarce doar cu aceeași amprentă.
      amprenta,
    },
  });
  if (error) {
    if (/IDEMPOTENTA_CONTINUT/.test(error.message)) throw new ComandaError('idempotenta', MESAJ_ALT_CONTINUT);
    if (/RETUR_PACHET_EXISTENT/.test(error.message)) throw new ComandaError('idempotenta', 'comanda are deja un retur; reîncarcă pagina');
    // Funcția refuză locurile deja luate cu «LOC_OCUPAT:2,3» (bilet viu sau rezervare a altei comenzi deschise).
    const ocupat = /LOC_OCUPAT:([\d,]*)/.exec(error.message);
    if (ocupat) throw new ComandaError('loc_ocupat', 'unul sau mai multe locuri alese sunt deja luate', ocupat[1].split(',').filter(Boolean).map(Number));
    if (/LOC_(DOAR_RETUR|NUMAR|NEVALID)/.test(error.message)) throw new ComandaError('validare', 'locurile alese nu sunt valide');
    if (/PLAFON_GLOBAL/.test(error.message)) {
      // Excepția din funcție anulează orice INSERT din ea — alerta se scrie de aici.
      await db.from('bilete_alerte').insert({ tip: 'plafon_atins', detalii: 'plafonul global de comenzi deschise (50 / 30 min) a fost atins' });
    }
    const cotaPlina = /COTA_PLINA:(\d+)/.exec(error.message);
    if (cotaPlina) {
      const r = Number(cotaPlina[1]);
      throw new ComandaError('inchis', r > 0 ? `pe această cursă online mai sunt doar ${r} locuri` : 'locurile online pe această cursă s-au terminat; biletul se ia de la șofer');
    }
    if (/RETUR_(TUR_NEVALID|TERMEN|FOLOSIT|DUPA_TUR)/.test(error.message)) throw new ComandaError('validare', mesajFaraReducere('cod_retur'));
    if (/STUDENT_UN_LOC/.test(error.message)) throw new ComandaError('validare', mesajFaraReducere('student_locuri'));
    if (/STUDENT_(VERIFICARE|JETON_FOLOSIT|PLAFON)/.test(error.message)) throw new ComandaError('validare', mesajFaraReducere('student'));
    if (/PROMO_SOFER/.test(error.message)) throw new ComandaError('validare', mesajFaraReducere(input.studentJeton ? 'student' : 'cod_retur'));
    if (/PLAFON_PROBA/.test(error.message)) throw new ComandaError('plafon', 's-au făcut deja 10 comenzi de probă azi');
    if (/PLAFON_/.test(error.message)) throw new ComandaError('plafon', 'prea multe comenzi neplătite pe acest număr; încearcă peste câteva minute');
    throw new Error(`bilete_creeaza_comanda: ${error.message}`);
  }
  // A doua plasă (564): rândul întors (al nostru sau al unei cereri concurente) trebuie să fie exact alegerea de acum.
  // Fără coloană (migrația 564 neaplicată încă) câmpul lipsește din rând: plasa SQL lipsește și ea, comparația nu se face.
  if (rand && 'amprenta' in (rand as object) && ((rand as BileteComanda).amprenta ?? null) !== amprenta) throw new ComandaError('idempotenta', MESAJ_ALT_CONTINUT);
  return rand as BileteComanda;
}

/** Reducerea returului din pachet: −pct pe prețul cursei (sub minimul plății → refuz). */
function promoPachet(pret: number, pachet: { tur: BileteComanda; pct: number }, urcare: string, coborare: string) {
  // H1: și pe numele canonice ale opririlor (cele după care se judecă vânzarea), nu doar pe textul din formular.
  if (!perechePromo(urcare, coborare)) throw new ComandaError('validare', mesajFaraReducere('nu_e_pereche'));
  const redus = aplicaReducere(pret, pachet.pct);
  if (redus == null) throw new ComandaError('validare', mesajFaraReducere('pret_mic'));
  return {
    pretIntreg: pret, pret: redus, promoPereche: perechePromo(urcare, coborare),
    reducere: { tip: 'retur' as const, pct: pachet.pct, turId: pachet.tur.id, verificareId: undefined as string | undefined, numeCheie: undefined as string | undefined },
    motiv: undefined,
  };
}

/** Suma de plată a comenzii: turul + returul din pachet (548), fiecare rând cu totalul lui. */
export async function sumaDePlata(comanda: Pick<BileteComanda, 'id' | 'total'>): Promise<number> {
  const { data, error } = await getSupabase().from('bilete_comenzi').select('total').eq('comanda_tur_id', comanda.id).eq('in_pachet', true)
    .in('status', ['noua', 'eroare_creare', 'expirata', 'platita', 'platita_fara_bilet']);
  if (error) throw new Error(`bilete_comenzi (pachet): ${error.message}`);
  return Number(comanda.total) + (data || []).reduce((a: number, r: { total: number | string }) => a + Number(r.total), 0);
}

/**
 * Comanda are deja o sesiune → adresa ei. Altfel: dacă a mai existat o încercare (eroare_creare, reluare, revendicare
 * veche), căutăm sesiunea la maib după orderId și o refolosim; abia apoi creăm una nouă, sub revendicare.
 */
async function asiguraSesiunea(comanda: BileteComanda, opt: ComandaOptiuni): Promise<Rezultat> {
  const db = getSupabase();
  // 560: după rezervare (30 min, neprelungită) nu se mai dă adresa de plată — sesiunea veche o închide împăcarea.
  if (comanda.checkout_id && DESCHISE.has(comanda.status) && rezervareExpirata(comanda.created_at, Date.now())) {
    throw new ComandaError('idempotenta', 'rezervarea locului a expirat (30 de minute); reia comanda');
  }
  if (comanda.checkout_id) {
    const { data: ck } = await db.from('maib_checkouts').select('checkout_url').eq('checkout_id', comanda.checkout_id).maybeSingle();
    if (ck?.checkout_url) return { comanda, checkoutUrl: ck.checkout_url };
  }
  if (!DESCHISE.has(comanda.status)) throw new ComandaError('idempotenta', `comanda e deja ${comanda.status}`);

  // O încercare anterioară a putut crea sesiunea la bancă fără s-o scrie la noi (timeout, funcție oprită):
  // o căutăm întâi (Codex X2). O eroare la căutare NU e «nu există» — nu creăm alta pe orb.
  if (comanda.status === 'eroare_creare' || comanda.creare_incercari > 0 || comanda.creare_in_curs_la) {
    const recuperat = await recupereazaSesiunea(comanda, opt);
    if (recuperat) return recuperat;
  }

  // 560 (C2 + C4, Ion 10.10): rezervarea ține 30 de minute de la crearea comenzii și NU se prelungește — după ea nu se
  // deschide o sesiune nouă de plată (cea veche, dacă exista, a fost căutată mai sus și refolosită).
  if (rezervareExpirata(comanda.created_at, Date.now())) {
    throw new ComandaError('idempotenta', 'rezervarea locului a expirat (30 de minute); reia comanda');
  }

  // O singură sesiune maib pe comandă: revendicăm crearea (2 minute), apoi chemăm banca. Suma (turul + returul din
  // pachet) e o citire independentă de revendicare: pornește deodată cu ea, eroarea ei apare tot după a revendicării.
  const sumaCitita = porneste(sumaDePlata(comanda));
  const acum = new Date().toISOString();
  const { data: revendicat, error: rErr } = await db.from('bilete_comenzi')
    .update({ creare_in_curs_la: acum, updated_at: acum })
    .eq('id', comanda.id)
    .is('checkout_id', null)
    .in('status', [...DESCHISE])
    .or(`creare_in_curs_la.is.null,creare_in_curs_la.lt.${new Date(Date.now() - REVENDICARE_MS).toISOString()}`)
    .select('id');
  if (rErr) throw new Error(`revendicare: ${rErr.message}`);
  if (!revendicat || revendicat.length === 0) throw new ComandaError('in_lucru', 'comanda e deja în curs de plată; reîncearcă într-un minut');

  const sumaComenzii = await sumaCitita;
  const descr = sumaComenzii > Number(comanda.total) ? `${descriereDin(comanda)} + retur`.slice(0, 125) : descriereDin(comanda);
  const url = opt.urlBilet ?? urlBiletImplicit(opt.bazaSite);
  let checkout: { checkoutId: string; checkoutUrl: string };
  try {
    checkout = await createCheckout({
      amount: sumaComenzii,
      language: comanda.lang,
      orderId: comanda.id,
      description: descr,
      payer: { name: comanda.passenger_name, phone: `+${comanda.phone}` },
      callbackUrl: `${opt.bazaAdmin}/api/pay/maib/callback`,
      successUrl: url(comanda.cod, comanda.lang, true),
      failUrl: url(comanda.cod, comanda.lang, false),
    });
  } catch (e) {
    const refuzClar = e instanceof MaibError && e.status >= 400 && e.status < 500;
    // Condiționat pe «încă deschisă» (Codex Y2): un callback sosit între timp putea deja s-o plătească.
    await db.from('bilete_comenzi').update({
      status: refuzClar ? 'expirata' : 'eroare_creare',
      creare_incercari: comanda.creare_incercari + 1,
      creare_in_curs_la: null,
      updated_at: new Date().toISOString(),
    }).eq('id', comanda.id).in('status', [...DESCHISE]).is('checkout_id', null);
    throw new ComandaError('maib', refuzClar ? 'banca a refuzat sesiunea de plată' : 'banca nu a răspuns; încearcă din nou');
  }

  const legat = await scrieSiLeaga(comanda.id, { checkoutId: checkout.checkoutId, checkoutUrl: checkout.checkoutUrl, amount: sumaComenzii, description: descr }, opt);
  if (!legat.ok) {
    if (legat.platita) return { comanda: { ...comanda, status: 'platita' }, checkoutUrl: checkout.checkoutUrl };
    // Sesiunea există la maib, dar legătura nu s-a scris: următoarea încercare o găsește după orderId
    // (recupereazaSesiunea), iar un callback sosit între timp e legat de bilete_marcheaza_platita după order_id.
    await db.from('bilete_comenzi').update({ status: 'eroare_creare', creare_in_curs_la: null, updated_at: new Date().toISOString() })
      .eq('id', comanda.id).in('status', [...DESCHISE]).is('checkout_id', null);
    await db.from('bilete_alerte').insert({ comanda_id: comanda.id, tip: 'creare_esuata', detalii: `sesiunea ${checkout.checkoutId} creată la maib; scrierea a eșuat: ${legat.eroare}` });
    throw new ComandaError('maib', 'plata nu s-a putut înregistra; încearcă din nou');
  }
  return { comanda: { ...comanda, checkout_id: checkout.checkoutId, creare_in_curs_la: null }, checkoutUrl: checkout.checkoutUrl };
}

/**
 * Rândul maib_checkouts + legarea comenzii. Nu sunt o tranzacție (două tabele prin PostgREST), de aceea:
 * rândul poate exista deja (order_id e UNIQUE) → îl refolosim; legarea e condiționată pe `checkout_id IS NULL`,
 * ca să nu suprascrie o legare făcută între timp de callback (migr. 484) sau de altă încercare. Dacă între timp
 * comanda a fost plătită (callback-ul a legat-o după order_id), raportăm asta ca succes, nu ca eroare (Codex Y2).
 */
async function scrieSiLeaga(
  comandaId: string,
  ck: { checkoutId: string; checkoutUrl: string | null; amount: number; description: string | null },
  opt: ComandaOptiuni,
): Promise<{ ok: true } | { ok: false; eroare: string; platita?: boolean }> {
  const db = getSupabase();
  const { error: pErr } = await persistaCheckout({
    checkoutId: ck.checkoutId, orderId: comandaId, amount: ck.amount, description: ck.description,
    checkoutUrl: ck.checkoutUrl, createdBy: opt.createdBy ?? (opt.mod === 'public' ? 'site' : null),
  });
  if (pErr && !/duplicate key|unique/i.test(pErr)) return { ok: false, eroare: pErr };
  const { data, error: lErr } = await db.from('bilete_comenzi')
    .update({ checkout_id: ck.checkoutId, creare_in_curs_la: null, updated_at: new Date().toISOString() })
    .eq('id', comandaId).is('checkout_id', null).select('id');
  if (lErr) return { ok: false, eroare: lErr.message };
  if (!data || data.length === 0) {
    const { data: c } = await db.from('bilete_comenzi').select('checkout_id, status').eq('id', comandaId).maybeSingle();
    if (c?.checkout_id === ck.checkoutId) return { ok: true };
    return { ok: false, eroare: `comanda e legată de altă sesiune (${c?.checkout_id}, ${c?.status})`, platita: c?.status === 'platita' };
  }
  return { ok: true };
}

/**
 * Sesiunea maib a comenzii, dacă a fost creată într-o încercare anterioară și n-a fost scrisă: o legăm și o
 * refolosim în loc să creăm alta. Sesiunile încheiate (Expired/Cancelled/Failed/Abandoned) nu se refolosesc;
 * una Completed se leagă și se marchează plătită (funcția din bază verifică suma și starea plății — migr. 486).
 */
async function recupereazaSesiunea(comanda: BileteComanda, opt: ComandaOptiuni): Promise<Rezultat | null> {
  let gasit: Awaited<ReturnType<typeof findCheckoutByOrderId>>;
  try { gasit = await findCheckoutByOrderId(comanda.id); } catch (e) {
    throw new ComandaError('maib', `banca nu a răspuns la verificarea sesiunii (${e instanceof Error ? e.message : e}); încearcă din nou`);
  }
  if (!gasit) return null;
  const s = (gasit.status ?? '').toLowerCase();
  if (['expired', 'cancelled', 'failed', 'abandoned'].includes(s)) return null;
  // Audit H1 (548): sesiunea veche cu altă sumă decât comanda de acum (returul adăugat/scos) nu se refolosește — banii
  // ar ajunge fără bilete. Una neplătită cere comandă nouă; una plătită se leagă (callback-ul alertează suma).
  if (s !== 'completed' && Math.abs(Number(gasit.amount) - (await sumaDePlata(comanda))) >= 0.005) {
    throw new ComandaError('idempotenta', 'suma s-a schimbat față de încercarea de plată de dinainte; reîncarcă pagina');
  }
  const legat = await scrieSiLeaga(comanda.id, { checkoutId: gasit.id, checkoutUrl: gasit.url ?? null, amount: Number(gasit.amount), description: descriereDin(comanda) }, opt);
  if (!legat.ok) return legat.platita ? { comanda: { ...comanda, status: 'platita' }, checkoutUrl: gasit.url ?? '' } : null;
  if (s === 'completed') {
    const db = getSupabase();
    await db.from('maib_checkouts').update({
      status: gasit.status, payment_id: gasit.payment?.paymentId ?? null, payment_status: gasit.payment?.status ?? null,
      refunded_amount: Number(gasit.payment?.refundedAmount ?? 0), updated_at: new Date().toISOString(),
      ...(gasit.payment?.executedAt && Number.isFinite(Date.parse(gasit.payment.executedAt)) ? { executat_la: new Date(Date.parse(gasit.payment.executedAt)).toISOString() } : {}),
    }).eq('checkout_id', gasit.id);
    const { data: emise, error } = await db.rpc('bilete_marcheaza_platita', { p_checkout_id: gasit.id });
    if (error) console.error('[bilete] emiterea la recuperare:', error.message);
    else if (Number(emise ?? 0) > 0) { await anuntaBotul(gasit.id); await anuntaVanzarea(gasit.id); } // ION-274: și biletele emise la recuperare ajung în chat la secundă
  }
  return { comanda: { ...comanda, checkout_id: gasit.id, creare_in_curs_la: null }, checkoutUrl: gasit.url ?? '' };
}

/**
 * Pentru împăcare (ION-196): leagă de comandă o sesiune găsită la maib după orderId (rândul maib_checkouts +
 * checkout_id, cu aceleași garanții ca la creare). true = legată (sau era deja legată de aceeași sesiune).
 */
export async function leagaSesiuneExistenta(comanda: BileteComanda, gasit: MaibCheckout, createdBy: string): Promise<boolean> {
  const legat = await scrieSiLeaga(comanda.id, {
    checkoutId: gasit.id, checkoutUrl: gasit.url ?? null, amount: Number(gasit.amount), description: descriereDin(comanda),
  }, { mod: 'public', bazaAdmin: '', bazaSite: '', createdBy });
  if (!legat.ok) console.warn('[bilete] legarea sesiunii găsite:', legat.eroare);
  return legat.ok;
}

/** Codul HTTP pentru fiecare clasă de eroare a comenzii. */
export function statusPentru(e: ComandaError): number {
  switch (e.cod) {
    case 'validare': case 'inchis': return 400;
    case 'idempotenta': case 'in_lucru': case 'loc_ocupat': return 409;
    case 'plafon': return 429;
    case 'maib': return 503;
  }
}

export interface CotaPret {
  pretIntreg: number;
  pret: number;
  reducere: 'retur' | 'student' | null;
  /** Perechea are promoții (site-ul arată panoul «Reduceri»). */
  promoPereche: boolean;
  promoActiv: boolean;
  /** Textul pentru client când reducerea cerută nu se aplică (același la cod greșit și la altă persoană). */
  mesaj: string | null;
}

/**
 * Cota de preț pentru site (POST /api/bilete/pret, migr. 546): prețul întreg, prețul cu reducerea cerută și de ce nu se
 * aplică. Nu creează nimic; comanda recalculează totul pe server și în bază, sub lacăt.
 */
export async function cotaPret(input: Pick<ComandaInput, 'tripDate' | 'crmRouteId' | 'goingNorth' | 'fromRo' | 'toRo' | 'seats' | 'phone' | 'passengerName' | 'codRetur' | 'studentJeton'>): Promise<CotaPret> {
  const [promoCfg, cursa] = await Promise.all([citestePromoConfig(), gasesteCursa(input as ComandaInput)]);
  if (!cursa) throw new ComandaError('validare', 'cursa nu există între aceste opriri');
  const pret = cursa.trip.price;
  const departureAt = calculeazaDepartureAt(input.tripDate, cursa.trip.time, cursa.pornireRuta);
  const cerut = Boolean(input.codRetur || input.studentJeton);
  let phone = '';
  if (cerut) {
    const p = normalizeazaTelefonPasager(input.phone);
    if (!p) return { pretIntreg: pret, pret, reducere: null, promoPereche: false, promoActiv: promoCfg.activ, mesaj: 'scrie întâi telefonul (069 123 456 sau cu prefixul țării)' };
    phone = p;
  }
  const promo = await calculeazaPromo({
    mod: 'public', test: false, phone, passengerName: (input.passengerName ?? '').trim(), urcare: cursa.fromNameRo, coborare: cursa.toNameRo,
    goingNorth: input.goingNorth, crmRouteId: input.crmRouteId, tripDate: input.tripDate, departureAt, seats: input.seats,
    pret, codRetur: input.codRetur ?? null, studentJeton: input.studentJeton ?? null,
  }, promoCfg);
  return {
    pretIntreg: pret, pret: promo.pret, reducere: promo.reducere?.tip ?? null, promoPereche: promo.promoPereche, promoActiv: promoCfg.activ,
    mesaj: cerut && !promo.reducere ? mesajFaraReducere(promo.motiv) : null,
  };
}
