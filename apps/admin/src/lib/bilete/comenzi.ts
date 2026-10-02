import 'server-only';
import {
  buildReturAssignmentMap, buildTurAssignmentMap, calculeazaCurse, incarcaCurse, normalizeDriverPhone,
  parseTimeLabel, PhoneError, type BileteComanda, type CursaCuPret,
} from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { createCheckout, findCheckoutByOrderId, MaibError } from '@/lib/maib/client';
import { persistaCheckout } from '@/lib/maib/persist';
import { chisinauInstantIso, chisinauTodayIso } from '@/lib/chisinau-time';
import { calculeazaDepartureAt, vanzareDeschisa } from './reguli';

// Comanda de bilete online (ION-193, pasul 4 din planul ION-190): validare → preț din @translux/db (același ca pe
// site) → rând în bilete_comenzi (plafoanele sunt în bază) → O SINGURĂ sesiune maib pe comandă → maib_checkouts.
// Biletele apar abia la callback (bilete_marcheaza_platita, migr. 483). Nimic de aici nu se încrede în suma venită
// din browser: prețul se recalculează mereu.

export type ComandaCod = 'validare' | 'inchis' | 'plafon' | 'idempotenta' | 'in_lucru' | 'maib';

export class ComandaError extends Error {
  constructor(public readonly cod: ComandaCod, mesaj: string) {
    super(mesaj);
    this.name = 'ComandaError';
  }
}

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
}

export interface ComandaOptiuni {
  /** `test_admin` ocolește steagurile de vânzare; permis DOAR dintr-o acțiune cu requireRole('ADMIN'). */
  mod: 'public' | 'test_admin';
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
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Peste atâtea zile nu vindem: tariful se poate schimba, graficul nu există încă. */
const ZILE_INAINTE_MAX = 30;

export async function citesteConfigBilete(): Promise<ConfigBilete> {
  const { data } = await getSupabase().from('app_config').select('key, value')
    .in('key', ['bilete_online_activ', 'bilete_inchidere_tur_min', 'bilete_inchidere_retur_min']);
  const m = new Map((data || []).map((r: { key: string; value: string }) => [r.key, r.value]));
  return {
    activ: m.get('bilete_online_activ') === 'true',
    inchidereTurMin: Number(m.get('bilete_inchidere_tur_min') ?? 0) || 0,
    inchidereReturMin: Number(m.get('bilete_inchidere_retur_min') ?? 120) || 0,
  };
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
  let phone: string;
  try { phone = normalizeDriverPhone(input.phone); } catch (e) {
    if (e instanceof PhoneError) throw new ComandaError('validare', 'telefonul nu e valid (+373 …)');
    throw e;
  }
  const email = (input.email ?? '').trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ComandaError('validare', 'e-mailul nu e valid');
  const lang = input.lang === 'ru' ? 'ru' : 'ro';
  return { phone, name, lang, email };
}

/** Cursa cerută, din aceleași date și reguli ca pe site; null când nu există. */
async function gasesteCursa(input: ComandaInput): Promise<{ trip: CursaCuPret; fromOrder: number; toOrder: number; pornireRuta: string | null } | null> {
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
  return { trip, fromOrder: from.stop_order, toOrder: to.stop_order, pornireRuta: pornire && /^\d{2}:\d{2}$/.test(pornire) ? pornire : null };
}

/** Șoferul atribuit cursei PE ziua cerută (fără căderea pe ziua anterioară de pe site). */
async function areSofer(tripDate: string, crmRouteId: number, goingNorth: boolean): Promise<boolean> {
  const db = getSupabase();
  const sel = 'crm_route_id, driver_id, vehicle_id, vehicle_id_retur, driver_id_retur, retur_route_id';
  const [{ data: a }, { data: b }] = await Promise.all([
    db.from('daily_assignments').select(sel).eq('assignment_date', tripDate).eq('crm_route_id', crmRouteId),
    db.from('daily_assignments').select(sel).eq('assignment_date', tripDate).eq('retur_route_id', crmRouteId),
  ]);
  const all = [...(a || []), ...(b || [])];
  const map = goingNorth ? buildReturAssignmentMap(all) : buildTurAssignmentMap(all);
  return Boolean(map.get(crmRouteId)?.driver_id);
}

async function directiaDeschisa(crmRouteId: number, goingNorth: boolean): Promise<boolean> {
  const { data } = await getSupabase().from('crm_routes').select('bilete_online_tur, bilete_online_retur').eq('id', crmRouteId).maybeSingle();
  if (!data) return false;
  return goingNorth ? Boolean(data.bilete_online_retur) : Boolean(data.bilete_online_tur);
}

function cheileComenzii(c: Pick<BileteComanda, 'trip_date' | 'crm_route_id' | 'going_north' | 'seats' | 'phone' | 'from_stop_order' | 'to_stop_order'>): string {
  return [c.trip_date, c.crm_route_id, c.going_north, c.seats, c.phone, c.from_stop_order, c.to_stop_order].join('|');
}

/**
 * Creează comanda și sesiunea de plată. Aruncă ComandaError cu cod: validare (400), inchis (400), plafon (429),
 * idempotenta (409), in_lucru (409), maib (503).
 */
export async function creeazaComanda(input: ComandaInput, opt: ComandaOptiuni): Promise<{ comanda: BileteComanda; checkoutUrl: string }> {
  const v = valideaza(input);
  if (opt.mod === 'public' && !input.ipHash) throw new ComandaError('validare', 'ip_hash lipsește');
  const db = getSupabase();

  // Cele patru citiri sunt independente: în paralel (o rundă, nu patru), erorile în aceeași ordine ca înainte.
  const [cfg, directie, cursa, sofer] = await Promise.all([
    citesteConfigBilete(),
    opt.mod === 'public' ? directiaDeschisa(input.crmRouteId, input.goingNorth) : Promise.resolve(true),
    gasesteCursa(input),
    areSofer(input.tripDate, input.crmRouteId, input.goingNorth),
  ]);
  if (opt.mod === 'public') {
    if (!cfg.activ) throw new ComandaError('inchis', 'vânzarea online nu e deschisă');
    if (!directie) throw new ComandaError('inchis', 'vânzarea online nu e deschisă pe această cursă');
  }
  if (!cursa) throw new ComandaError('validare', 'cursa nu există între aceste opriri');
  if (!(cursa.trip.price > 1)) throw new ComandaError('validare', 'prețul cursei nu e cunoscut încă');
  if (!sofer) throw new ComandaError('inchis', 'cursa nu are încă șofer atribuit pe ziua aleasă');

  const departureAt = calculeazaDepartureAt(input.tripDate, cursa.trip.time, cursa.pornireRuta);
  const pornireRutaAt = chisinauInstantIso(input.tripDate, cursa.pornireRuta ?? cursa.trip.time);
  if (!vanzareDeschisa({ goingNorth: input.goingNorth, departureAt, pornireRutaAt, nowMs: Date.now(), inchidereTurMin: cfg.inchidereTurMin, inchidereReturMin: cfg.inchidereReturMin })) {
    throw new ComandaError('inchis', 'vânzarea pentru această cursă s-a închis');
  }

  const pricePerSeat = cursa.trip.price;
  const total = Number((pricePerSeat * input.seats).toFixed(2));

  // Plafoanele și INSERT-ul, atomic, în bază (migr. 483). Aceeași idempotency_key → același rând.
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
      test: opt.mod === 'test_admin',
    },
  });
  if (error) {
    if (/PLAFON_GLOBAL/.test(error.message)) {
      // Excepția din funcție anulează orice INSERT din ea — alerta se scrie de aici.
      await db.from('bilete_alerte').insert({ tip: 'plafon_atins', detalii: 'plafonul global de comenzi deschise (50 / 30 min) a fost atins' });
    }
    if (/PLAFON_/.test(error.message)) throw new ComandaError('plafon', 'prea multe comenzi; încearcă peste câteva minute');
    throw new Error(`bilete_creeaza_comanda: ${error.message}`);
  }
  const comanda = rand as BileteComanda;
  if (cheileComenzii(comanda) !== cheileComenzii({ trip_date: input.tripDate, crm_route_id: input.crmRouteId, going_north: input.goingNorth, seats: input.seats, phone: v.phone, from_stop_order: cursa.fromOrder, to_stop_order: cursa.toOrder })) {
    throw new ComandaError('idempotenta', 'aceeași cheie, alt conținut');
  }

  // Sesiunea există deja (reluare după un răspuns pierdut): întoarcem adresa ei.
  if (comanda.checkout_id) {
    const { data: ck } = await db.from('maib_checkouts').select('checkout_url').eq('checkout_id', comanda.checkout_id).maybeSingle();
    if (ck?.checkout_url) return { comanda, checkoutUrl: ck.checkout_url };
  }
  if (comanda.status !== 'noua' && comanda.status !== 'eroare_creare') {
    throw new ComandaError('idempotenta', `comanda e deja ${comanda.status}`);
  }

  // Comanda a mai încercat o dată (eroare_creare) sau e reluată: poate că sesiunea EXISTĂ la maib, dar n-am apucat
  // s-o scriem. O căutăm după orderId (= id) înainte să creăm alta — altfel pasagerul ar putea plăti sesiunea
  // veche, iar callback-ul ei ar găsi comanda legată de cea nouă (revizia de cod, 03.10).
  if (comanda.status === 'eroare_creare' || comanda.creare_incercari > 0) {
    const recuperat = await recupereazaSesiunea(comanda, descriere(input, cursa.trip.time), opt);
    if (recuperat) return recuperat;
  }

  // O singură sesiune maib pe comandă: revendicăm crearea (2 minute), apoi chemăm banca.
  const { data: revendicat } = await db.from('bilete_comenzi')
    .update({ creare_in_curs_la: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', comanda.id)
    .is('checkout_id', null)
    .or(`creare_in_curs_la.is.null,creare_in_curs_la.lt.${new Date(Date.now() - 2 * 60_000).toISOString()}`)
    .select('id');
  if (!revendicat || revendicat.length === 0) throw new ComandaError('in_lucru', 'comanda e deja în curs de plată; reîncearcă într-un minut');

  // Plata se construiește din COMANDA salvată (la o reluare după schimbarea tarifului, suma trimisă băncii trebuie
  // să fie cea a comenzii, altfel bilete_marcheaza_platita refuză emiterea — Codex X3).
  const sumaComenzii = Number(comanda.total);
  const descr = descriere(input, cursa.trip.time);
  let checkout: { checkoutId: string; checkoutUrl: string };
  try {
    checkout = await createCheckout({
      amount: sumaComenzii,
      language: v.lang,
      orderId: comanda.id,
      description: descr,
      payer: { name: v.name, phone: `+${v.phone}` },
      callbackUrl: `${opt.bazaAdmin}/api/pay/maib/callback`,
      successUrl: (opt.urlBilet ?? urlBiletImplicit(opt.bazaSite))(comanda.cod, v.lang, true),
      failUrl: (opt.urlBilet ?? urlBiletImplicit(opt.bazaSite))(comanda.cod, v.lang, false),
    });
  } catch (e) {
    const refuzClar = e instanceof MaibError && e.status >= 400 && e.status < 500;
    await db.from('bilete_comenzi').update({
      status: refuzClar ? 'expirata' : 'eroare_creare',
      creare_incercari: comanda.creare_incercari + 1,
      creare_in_curs_la: null,
      updated_at: new Date().toISOString(),
    }).eq('id', comanda.id);
    throw new ComandaError('maib', refuzClar ? 'banca a refuzat sesiunea de plată' : 'banca nu a răspuns; încearcă din nou');
  }

  const legat = await scrieSiLeaga(comanda.id, { checkoutId: checkout.checkoutId, checkoutUrl: checkout.checkoutUrl, amount: sumaComenzii, description: descr }, opt);
  if (!legat.ok) {
    // Sesiunea există la maib, dar legătura nu s-a scris: la următoarea încercare recupereazaSesiunea() o găsește
    // după orderId, iar un callback sosit între timp e legat de bilete_marcheaza_platita după order_id (migr. 484).
    await db.from('bilete_comenzi').update({ status: 'eroare_creare', creare_in_curs_la: null, updated_at: new Date().toISOString() }).eq('id', comanda.id);
    await db.from('bilete_alerte').insert({ comanda_id: comanda.id, tip: 'creare_esuata', detalii: `sesiunea ${checkout.checkoutId} creată la maib; scrierea a eșuat: ${legat.eroare}` });
    throw new ComandaError('maib', 'plata nu s-a putut înregistra; încearcă din nou');
  }

  return { comanda: { ...comanda, checkout_id: checkout.checkoutId, creare_in_curs_la: null }, checkoutUrl: checkout.checkoutUrl };
}

function descriere(input: ComandaInput, ora: string): string {
  return `Bilet ${input.fromRo.trim()} → ${input.toRo.trim()}, ${input.tripDate} ${ora}, ${input.seats} loc.`.slice(0, 125);
}

/**
 * Rândul maib_checkouts + legarea comenzii. Nu sunt o tranzacție (două tabele prin PostgREST), de aceea:
 * rândul poate exista deja (order_id e UNIQUE) → îl refolosim; legarea e condiționată pe `checkout_id IS NULL`,
 * ca să nu suprascrie o legare făcută între timp de callback (migr. 484) sau de altă încercare.
 */
async function scrieSiLeaga(
  comandaId: string,
  ck: { checkoutId: string; checkoutUrl: string | null; amount: number; description: string | null },
  opt: ComandaOptiuni,
): Promise<{ ok: true } | { ok: false; eroare: string }> {
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
    // Altcineva a legat deja comanda (callback sau altă încercare): e în regulă dacă e aceeași sesiune.
    const { data: c } = await db.from('bilete_comenzi').select('checkout_id').eq('id', comandaId).maybeSingle();
    if (c?.checkout_id !== ck.checkoutId) return { ok: false, eroare: `comanda e legată de altă sesiune (${c?.checkout_id})` };
  }
  return { ok: true };
}

/**
 * Sesiunea maib a comenzii, dacă a fost creată într-o încercare anterioară și n-a fost scrisă: o legăm și o
 * refolosim în loc să creăm alta. Sesiunile încheiate (Expired/Cancelled/Failed/Abandoned) nu se refolosesc;
 * una Completed se leagă și se marchează plătită.
 */
async function recupereazaSesiunea(comanda: BileteComanda, descr: string, opt: ComandaOptiuni): Promise<{ comanda: BileteComanda; checkoutUrl: string } | null> {
  let gasit: Awaited<ReturnType<typeof findCheckoutByOrderId>>;
  try { gasit = await findCheckoutByOrderId(comanda.id); } catch (e) {
    console.warn('[bilete] căutarea sesiunii după orderId:', e instanceof Error ? e.message : e);
    return null;
  }
  if (!gasit) return null;
  const s = (gasit.status ?? '').toLowerCase();
  if (['expired', 'cancelled', 'failed', 'abandoned'].includes(s)) return null;
  const legat = await scrieSiLeaga(comanda.id, { checkoutId: gasit.id, checkoutUrl: gasit.url ?? null, amount: Number(gasit.amount), description: descr }, opt);
  if (!legat.ok) return null;
  if (s === 'completed') {
    const db = getSupabase();
    await db.from('maib_checkouts').update({ status: gasit.status, payment_id: gasit.payment?.paymentId ?? null, payment_status: gasit.payment?.status ?? null, updated_at: new Date().toISOString() }).eq('checkout_id', gasit.id);
    await db.rpc('bilete_marcheaza_platita', { p_checkout_id: gasit.id });
  }
  return { comanda: { ...comanda, checkout_id: gasit.id, creare_in_curs_la: null }, checkoutUrl: gasit.url ?? '' };
}

function urlBiletImplicit(bazaSite: string) {
  return (cod: string, lang: 'ro' | 'ru', ok: boolean) => `${bazaSite}/${lang}/bilet/${cod}${ok ? '' : '?plata=nu'}`;
}

/** Codul HTTP pentru fiecare clasă de eroare a comenzii. */
export function statusPentru(e: ComandaError): number {
  switch (e.cod) {
    case 'validare': case 'inchis': return 400;
    case 'idempotenta': case 'in_lucru': return 409;
    case 'plafon': return 429;
    case 'maib': return 503;
  }
}
