import 'server-only';
import {
  buildReturAssignmentMap, buildTurAssignmentMap, calculeazaCurse, cursaAreLocalitateCuPlafon, cursaInLocalitatileVanzarii,
  incarcaCurse, normalizeazaTelefonPasager, parseazaDestinatii, parseazaLocalitatiVanzare, parseazaPlafoaneLocalitati, parseTimeLabel,
  pretVandabilOnline, SUMA_MINIMA_PLATA_MDL, verificaPlafonLocalitati, type BileteComanda, type ComandaPentruPlafon,
  type CursaCuPret, type LocalitatiVanzare, type PlafoaneLocalitati,
} from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { createCheckout, findCheckoutByOrderId, MaibError, type MaibCheckout } from '@/lib/maib/client';
import { persistaCheckout } from '@/lib/maib/persist';
import { chisinauInstantIso, chisinauTimeOf, chisinauTodayIso } from '@/lib/chisinau-time';
import { calculeazaDepartureAt, cursaDupaDataDeStart, vanzareDeschisa } from './reguli';
import { localitateaPunctului, puncteActive } from './puncte';
import { alegePunct, punctePentru } from './puncte-reguli';
import { anuntaBotul } from './anunta-botul';
import { calculeazaPromo, citestePromoConfig, cotaCursei, localitateNeinceputa, type MotivFaraReducere } from './promo-server';
import { hashJeton } from './student-ai';

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
const STARI_PLAFON = ['platita', ...DESCHISE];

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
 * încă nu sunt logați în Telegram scanare bilete să nu fie posibilă vânzarea». Ziua are grafic → șoferul din el; ziua n-are
 * încă grafic → șoferul aceleiași curse din cel mai nou grafic din ultimele 7 zile (același pe care îl arată site-ul).
 * `fara_grafic` = nu se știe deloc cine merge; `lipsa` = graficul zilei e făcut, dar ruta n-are șofer.
 */
export async function stareSoferCursa(tripDate: string, crmRouteId: number, goingNorth: boolean): Promise<'fara_grafic' | 'lipsa' | 'nelegat' | 'legat'> {
  const db = getSupabase();
  let id = await soferulCursei(tripDate, crmRouteId, goingNorth);
  if (!id) {
    const { count, error } = await db.from('daily_assignments').select('id', { count: 'exact', head: true }).eq('assignment_date', tripDate);
    if (error) throw new Error(`daily_assignments: ${error.message}`);
    if ((count ?? 0) > 0) return 'lipsa';
    const deLa = new Date(Date.parse(`${tripDate}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
    const { data: z, error: eZ } = await db.from('daily_assignments').select('assignment_date')
      .lt('assignment_date', tripDate).gte('assignment_date', deLa).order('assignment_date', { ascending: false }).limit(1);
    if (eZ) throw new Error(`daily_assignments: ${eZ.message}`);
    const ziRezerva = (z?.[0] as { assignment_date: string } | undefined)?.assignment_date;
    if (ziRezerva) id = await soferulCursei(ziRezerva, crmRouteId, goingNorth);
    if (!id) return 'fara_grafic';
  }
  const { data, error } = await db.from('drivers').select('telegram_id, active').eq('id', id).maybeSingle();
  if (error) throw new Error(`drivers: ${error.message}`);
  const d = data as { telegram_id: number | null; active: boolean } | null;
  return d?.telegram_id != null && d.active ? 'legat' : 'nelegat';
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
    .select('from_name, to_name, seats, status, created_at')
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
async function verificaPlafonulLocalitatii(plafoane: PlafoaneLocalitati | null, cursa: CursaGasita, input: ComandaInput): Promise<void> {
  if (!plafoane) throw new ComandaError('inchis', 'vânzarea online e temporar închisă (configurația plafoanelor pe localitate)');
  if (!cursaAreLocalitateCuPlafon(plafoane, cursa.fromNameRo, cursa.toNameRo)) return;
  const verdict = verificaPlafonLocalitati({
    plafoane, urcare: cursa.fromNameRo, coborare: cursa.toNameRo, seats: input.seats,
    comenziCursa: await comenzileCurseiPentruPlafon(input), nowMs: Date.now(),
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

// Punctul de urcare NU intră în cheie: o reluare cu altă alegere întoarce comanda inițială, cu punctul ei (ION-198).
function cheileComenzii(c: Pick<BileteComanda, 'trip_date' | 'crm_route_id' | 'going_north' | 'seats' | 'phone'>): string {
  return [c.trip_date, c.crm_route_id, c.going_north, c.seats, c.phone].join('|');
}

/** Turul din codul de retur și verificarea din jeton, cum le-a trimis clientul (pentru reluare), sau null. */
async function idPromoDinIntrare(input: ComandaInput): Promise<{ turId: string | null; verificareId: string | null }> {
  const db = getSupabase();
  let turId: string | null = null, verificareId: string | null = null;
  if (input.codRetur && /^[0-9a-f]{64}$/.test(input.codRetur)) {
    const { data } = await db.from('bilete_comenzi').select('id').eq('cod_retur', input.codRetur).maybeSingle();
    turId = (data as { id: string } | null)?.id ?? null;
  }
  if (input.studentJeton && /^[A-Za-z0-9_-]{20,64}$/.test(input.studentJeton)) {
    const { data } = await db.from('bilete_studenti_verificari').select('id').eq('jeton_hash', hashJeton(input.studentJeton)).maybeSingle();
    verificareId = (data as { id: string } | null)?.id ?? null;
  }
  return { turId, verificareId };
}

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

  // 1. Reluare? Comanda există deja pentru cheia asta → nu re-validăm vânzarea, îi dăm sesiunea ei.
  const { data: existenta, error: eErr } = await db.from('bilete_comenzi').select('*').eq('idempotency_key', input.idempotencyKey).maybeSingle();
  if (eErr) throw new Error(`bilete_comenzi: ${eErr.message}`);
  if (existenta) {
    const comanda = existenta as BileteComanda;
    if (cheileComenzii(comanda) !== cheileComenzii({ trip_date: input.tripDate, crm_route_id: input.crmRouteId, going_north: input.goingNorth, seats: input.seats, phone: v.phone })) {
      throw new ComandaError('idempotenta', 'aceeași cheie, alt conținut');
    }
    // 546 (BLA-3/N11): reluarea compară INTRAREA promoției (turul din cod, verificarea din jeton), nu reducerea calculată;
    // jetonul deja legat de această comandă nu e motiv de refuz.
    const promoIntrare = await idPromoDinIntrare(input);
    if ((comanda.comanda_tur_id ?? null) !== promoIntrare.turId || (comanda.student_verificare_id ?? null) !== promoIntrare.verificareId) {
      throw new ComandaError('idempotenta', 'aceeași cheie, altă reducere');
    }
    return await asiguraSesiunea(comanda, opt);
  }

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
  if ((sofer === 'nelegat' || sofer === 'fara_grafic') && opt.mod === 'public') throw new ComandaError('inchis', 'pe această cursă biletul se ia deocamdată de la șofer');

  const departureAt = calculeazaDepartureAt(input.tripDate, cursa.trip.time, cursa.pornireRuta);
  const pornireRutaAt = chisinauInstantIso(input.tripDate, cursa.pornireRuta ?? cursa.trip.time);
  // Proba fizică (Ion, 08.10: «fă cursa de test»): aplicația șoferului scanează doar cursele de AZI, deci la probă se
  // cumpără orice cursă de azi, și una a cărei vânzare s-a închis; biletul de probă îl scanează doar șoferul de probă.
  if (opt.mod !== 'proba' && !vanzareDeschisa({ goingNorth: input.goingNorth, departureAt, pornireRutaAt, nowMs: Date.now(), inchidereTurMin: cfg.inchidereTurMin, inchidereReturMin: cfg.inchidereReturMin })) {
    throw new ComandaError('inchis', 'vânzarea pentru această cursă s-a închis');
  }
  if (opt.mod === 'public') await verificaPlafonulLocalitatii(cfg.plafoaneLocalitati, cursa, input);

  // Proba fizică (Ion, 08.10: «pui să fie biletul 10 lei»): prețul forțat; totalul se socotește după, deci amount = total.
  // Promoțiile Bălți ⇄ Chișinău (546): reducerea doar la public / test_admin; cerută dar neaplicabilă → refuz cu motivul
  // (clientul a văzut cota și nu trebuie să plătească alt preț decât a crezut).
  const promo = await calculeazaPromo({
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
  const active = await puncteActive().catch((e: unknown) => { console.warn('[bilete] puncte indisponibile:', e instanceof Error ? e.message : e); return []; });
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
    },
  });
  if (error) {
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
    if (/PLAFON_/.test(error.message)) throw new ComandaError('plafon', 'prea multe comenzi; încearcă peste câteva minute');
    throw new Error(`bilete_creeaza_comanda: ${error.message}`);
  }
  return await asiguraSesiunea(rand as BileteComanda, opt);
}

/**
 * Comanda are deja o sesiune → adresa ei. Altfel: dacă a mai existat o încercare (eroare_creare, reluare, revendicare
 * veche), căutăm sesiunea la maib după orderId și o refolosim; abia apoi creăm una nouă, sub revendicare.
 */
async function asiguraSesiunea(comanda: BileteComanda, opt: ComandaOptiuni): Promise<Rezultat> {
  const db = getSupabase();
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

  // O singură sesiune maib pe comandă: revendicăm crearea (2 minute), apoi chemăm banca.
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

  const sumaComenzii = Number(comanda.total);
  const descr = descriereDin(comanda);
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
  const legat = await scrieSiLeaga(comanda.id, { checkoutId: gasit.id, checkoutUrl: gasit.url ?? null, amount: Number(gasit.amount), description: descriereDin(comanda) }, opt);
  if (!legat.ok) return legat.platita ? { comanda: { ...comanda, status: 'platita' }, checkoutUrl: gasit.url ?? '' } : null;
  if (s === 'completed') {
    const db = getSupabase();
    await db.from('maib_checkouts').update({
      status: gasit.status, payment_id: gasit.payment?.paymentId ?? null, payment_status: gasit.payment?.status ?? null,
      refunded_amount: Number(gasit.payment?.refundedAmount ?? 0), updated_at: new Date().toISOString(),
    }).eq('checkout_id', gasit.id);
    const { data: emise, error } = await db.rpc('bilete_marcheaza_platita', { p_checkout_id: gasit.id });
    if (error) console.error('[bilete] emiterea la recuperare:', error.message);
    else if (Number(emise ?? 0) > 0) await anuntaBotul(gasit.id); // ION-274: și biletele emise la recuperare ajung în chat la secundă
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
