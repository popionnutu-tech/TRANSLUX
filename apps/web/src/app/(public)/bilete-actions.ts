'use server';

import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { comandaBilet, configBilete, locuriCursa, pretCuReducere, type RaspunsPret } from '@/lib/bilete-api';
import { emailOptional, mesajEroareComanda, normalizeazaTelefon, numeComplet, urlPlataSigur } from '@/lib/bilete-reguli';
import { mesajLocOcupat, parseazaLocuriAlese, type LocuriCursa } from '@/lib/locuri';

// «Cumpără bilet» (ION-197): formularul din fereastra rezultatelor → comanda la panou → pasagerul pleacă la maib.
// Validarea de aici e doar pentru mesaje bune; adevărul (cursa, prețul, fereastra, plafonul) îl spune API-ul.

export interface StareComanda {
  eroare?: string;
  /** ION-242: la «loc_ocupat» — locurile luate între timp; formularul le înnegrește și reîncarcă harta. */
  ocupate?: number[];
  /** Crește la fiecare răspuns, ca formularul să reacționeze și la două erori identice la rând. */
  nr?: number;
  /** 550: codul erorii panoului (politica cheilor tur-retur: «idempotenta», «maib», «in_lucru», …). */
  cod?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Harta locurilor cursei (ION-242), chemată din formular la deschidere, la schimbarea numărului de bilete și la
 * fiecare 30 s. Doar spre nord (plecarea din Chișinău); null = indisponibilă → se cumpără fără alegere.
 * Export din 'use server' = acțiune apelabilă de oricine: nu are secret, parametrii se verifică aici.
 */
/** Mesajul tur-retur: textul panoului (RO), cu un prefix RU când pagina e în rusă și fraza clară pentru cheia refuzată. */
function textTurRetur(eroareApi: string, cod: string | undefined, ru: boolean): string {
  if (cod === 'idempotenta') return ru ? 'Выбор изменился — нажмите «Оплатить» ещё раз.' : 'Alegerea s-a schimbat — apasă din nou «Plătește».';
  // 551: pagina rusă nu mai arată textul românesc al plafonului (captura lui Ion, 10.10).
  if (cod === 'plafon') return ru ? 'Слишком много неоплаченных заказов на этот номер. Попробуйте через несколько минут.' : 'Prea multe comenzi neplătite pe acest număr. Încearcă peste câteva minute.';
  const t = eroareApi.charAt(0).toUpperCase() + eroareApi.slice(1);
  return ru ? `Не получилось: ${t}.` : `${t}.`;
}

export async function locuriCursei(crmRouteId: number, tripDate: string, goingNorth: boolean): Promise<LocuriCursa | null> {
  if (goingNorth !== true) return null;
  if (!Number.isInteger(crmRouteId) || crmRouteId <= 0 || crmRouteId > 1_000_000) return null;
  if (typeof tripDate !== 'string' || !DATA_RE.test(tripDate)) return null;
  return locuriCursa(crmRouteId, tripDate, true);
}

export async function cumparaBilet(prev: StareComanda, fd: FormData): Promise<StareComanda> {
  const locale: 'ro' | 'ru' = fd.get('lang') === 'ru' ? 'ru' : 'ro';
  const ru = locale === 'ru';
  const nr = (prev?.nr ?? 0) + 1;
  const eroare = (text: string, extra: Omit<StareComanda, 'eroare' | 'nr'> = {}): StareComanda => ({ eroare: text, nr, ...extra });

  // Capcana pentru roboți: un câmp invizibil completat → răspuns «ok» fără comandă.
  if (String(fd.get('website') ?? '').trim()) return { nr };

  const nume = numeComplet(String(fd.get('lastName') ?? ''), String(fd.get('firstName') ?? ''));
  const telefon = normalizeazaTelefon(String(fd.get('phone') ?? ''));
  const email = emailOptional(String(fd.get('email') ?? ''));
  const seats = Number(fd.get('seats'));
  const idempotencyKey = String(fd.get('idempotencyKey') ?? '');
  const crmRouteId = Number(fd.get('crmRouteId'));
  const tripDate = String(fd.get('tripDate') ?? '');
  const goingNorth = fd.get('goingNorth') === 'true';
  const punctRaw = String(fd.get('punctUrcareId') ?? '').trim();
  const punctUrcareId = /^\d{1,12}$/.test(punctRaw) ? Number(punctRaw) : null;
  // ≥ 2 puncte pe cursă → alegerea e obligatorie (formularul o cere; aici doar mesajul, dacă browserul n-a cerut-o)
  if (fd.get('punctObligatoriu') === '1' && punctUrcareId == null) return eroare(ru ? 'Выберите, где вы сядете в автобус.' : 'Alege unde urci în autobuz.');

  if (!nume) return eroare(ru ? 'Введите фамилию и имя (не короче 2 букв).' : 'Scrie numele și prenumele (cel puțin 2 litere fiecare).');
  if (!telefon) return eroare(ru ? 'Введите номер: 069 123 456, или с кодом страны: +380 …' : 'Scrie numărul: 069 123 456, sau cu prefixul țării: +380 …');
  if (email === 'invalid') return eroare(ru ? 'Проверьте e-mail или оставьте поле пустым.' : 'Verifică e-mailul sau lasă câmpul gol.');
  if (!Number.isInteger(seats) || seats < 1 || seats > 4) return eroare(ru ? 'От 1 до 4 мест.' : 'Între 1 și 4 locuri.');
  if (fd.get('consent') !== 'on') return eroare(ru ? 'Нужно принять условия продажи и политику конфиденциальности.' : 'E nevoie să accepți condițiile de vânzare și politica de confidențialitate.');
  if (!UUID_RE.test(idempotencyKey) || !Number.isInteger(crmRouteId) || !DATA_RE.test(tripDate)) {
    return eroare(mesajEroareComanda('necunoscut', 400, locale));
  }
  // ION-242: locurile alese pe hartă (doar spre nord). Fără câmp = harta n-a răspuns → se cumpără fără alegere.
  const locuri = parseazaLocuriAlese(fd.get('locuriAlese'), seats, goingNorth);
  if (!locuri.ok) {
    return eroare(locuri.motiv === 'numar'
      ? (ru ? `Выберите на схеме ${seats === 1 ? '1 место' : `${seats} места`}.` : `Alege pe hartă ${seats === 1 ? '1 loc' : `${seats} locuri`}.`)
      : (ru ? 'Выбор мест повреждён, выберите заново.' : 'Alegerea locurilor s-a stricat, alege din nou.'));
  }

  // Locurile returului (tur-retur, doar când returul pleacă din Chișinău); fără câmp = harta n-a răspuns → automat.
  const locuriRetur = parseazaLocuriAlese(fd.get('returLocuri'), seats, fd.get('returGoingNorth') === 'true');
  if (!locuriRetur.ok) return eroare(ru ? `Выберите на схеме места обратного рейса (${seats}).` : `Alege pe hartă locurile la retur (${seats}).`);

  // Amprenta IP pentru plafonul panoului: sare proprie, obligatorie (fără ea nu trimitem o amprentă slabă).
  const sare = process.env.BILETE_IP_SALT;
  if (!sare) {
    console.error('[bilete] BILETE_IP_SALT lipsește');
    return eroare(mesajEroareComanda('config', 500, locale));
  }
  let ipHash: string | null = null;
  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || null;
    ipHash = ip ? createHash('sha256').update(`${sare}|${ip}`).digest('hex') : null;
  } catch { ipHash = null; }

  const r = await comandaBilet({
    tripDate,
    crmRouteId,
    goingNorth,
    fromRo: String(fd.get('fromRo') ?? '').slice(0, 80),
    toRo: String(fd.get('toRo') ?? '').slice(0, 80),
    seats,
    passengerName: nume,
    phone: telefon,
    email,
    lang: locale,
    idempotencyKey,
    ipHash,
    punctUrcareId,
    // ION-249: din mini app-ul Telegram vine initData-ul contului (câmp ascuns); panoul îl verifică — aici doar se trimite.
    telegramInitData: String(fd.get('tgInitData') ?? '').slice(0, 4096) || null,
    inlocuieste: fd.getAll('inlocuieste').map(String).filter((k) => UUID_RE.test(k)).slice(0, 4),
    locuriAlese: locuri.locuri,
    // 546: promoțiile Bălți ⇄ Chișinău — panoul le verifică și recalculează prețul; aici doar formatul.
    codRetur: /^[0-9a-f]{64}$/.test(String(fd.get('codRetur') ?? '')) ? String(fd.get('codRetur')) : null,
    studentJeton: /^[A-Za-z0-9_-]{20,64}$/.test(String(fd.get('studentJeton') ?? '')) ? String(fd.get('studentJeton')) : null,
    // 548: tur-retur într-o singură plată (Ion, 10.10: «totul trebuie să fie achitare într-o pagină»).
    retur: DATA_RE.test(String(fd.get('returTripDate') ?? '')) && UUID_RE.test(String(fd.get('returKey') ?? '')) && Number.isInteger(Number(fd.get('returCrmRouteId')))
      ? { tripDate: String(fd.get('returTripDate')), crmRouteId: Number(fd.get('returCrmRouteId')), goingNorth: fd.get('returGoingNorth') === 'true',
          fromRo: String(fd.get('returFromRo') ?? '').slice(0, 80), toRo: String(fd.get('returToRo') ?? '').slice(0, 80), idempotencyKey: String(fd.get('returKey')),
          locuriAlese: locuriRetur.ok ? locuriRetur.locuri : null }
      : null,
  });
  if (!r.ok) {
    // ION-242: locurile s-au luat între două reîncărcări ale hărții → spunem care și formularul reîncarcă harta.
    if (r.cod === 'loc_ocupat') {
      const ocupate = r.ocupate?.length ? r.ocupate : (locuri.locuri ?? []);
      return eroare(mesajLocOcupat(ocupate, locale), { ocupate });
    }
    if (r.status >= 500 && r.cod !== 'maib') console.error('[bilete] comanda:', r.status, r.eroare);
    // Tur-retur: textul panoului spune exact ce s-a întâmplat (tur sau retur, plata de dinainte la bancă).
    const turRetur = fd.get('returKey') != null;
    return eroare(turRetur && r.eroare && r.cod !== 'maib' ? textTurRetur(r.eroare, r.cod, ru) : mesajEroareComanda(r.cod, r.status, locale, r.eroare), { cod: r.cod });
  }
  // Doar spre pagina de plată maib (https, domeniul băncii): un răspuns ciudat al panoului nu trimite omul altundeva.
  if (!urlPlataSigur(r.checkoutUrl)) {
    console.error("[bilete] checkoutUrl neașteptat de la panou");
    return eroare(mesajEroareComanda("necunoscut", 500, locale));
  }
  redirect(r.checkoutUrl); // aruncă NEXT_REDIRECT — rămâne în afara oricărui try/catch
}

/**
 * Prețul cu reducerea cerută (migr. 546), pentru formular: codul de retur sau jetonul de student. Export din
 * 'use server' = acțiune apelabilă de oricine; nu are secret, panoul răspunde același text la cod greșit și la altă
 * persoană, iar comanda recalculează totul.
 */
export async function pretBilet(a: { tripDate: string; crmRouteId: number; goingNorth: boolean; fromRo: string; toRo: string; seats: number; phone: string; passengerName: string; codRetur?: string | null; studentJeton?: string | null }): Promise<RaspunsPret | null> {
  if (!a || typeof a.tripDate !== 'string' || !DATA_RE.test(a.tripDate) || !Number.isInteger(a.crmRouteId) || a.crmRouteId <= 0) return null;
  const tel = normalizeazaTelefon(String(a.phone ?? ''));
  return pretCuReducere({
    tripDate: a.tripDate, crmRouteId: a.crmRouteId, goingNorth: a.goingNorth === true,
    fromRo: String(a.fromRo ?? '').slice(0, 80), toRo: String(a.toRo ?? '').slice(0, 80),
    seats: Math.max(1, Math.min(4, Number(a.seats) || 1)), phone: tel ?? '', passengerName: String(a.passengerName ?? '').slice(0, 80),
    codRetur: typeof a.codRetur === 'string' ? a.codRetur.slice(0, 64) : null,
    studentJeton: typeof a.studentJeton === 'string' ? a.studentJeton.slice(0, 64) : null,
  });
}

/** Returul ales în formularul turului (547), ținut în sessionStorage până după plata turului. */
export interface PlanRetur {
  tripDate: string; crmRouteId: number; goingNorth: boolean; fromRo: string; toRo: string; seats: number;
  lastName: string; firstName: string; phone: string; email: string; lang: 'ro' | 'ru'; idempotencyKey: string;
}

/**
 * Pasul 2 al tur-returului (547, Ion 10.10: «tur-returul facem doar dacă cumpără în același moment»): după plata turului,
 * pagina biletului cumpără returul ales în formular cu codul de retur al turului. Panoul verifică totul (tur plătit acum
 * ≤ 30 min, sens opus, altă rută, aceeași persoană) și recalculează prețul. Întoarce adresa băncii sau eroarea.
 */
export async function cumparaRetur(plan: PlanRetur, codRetur: string): Promise<{ url?: string; eroare?: string }> {
  const ru = plan?.lang === 'ru';
  const locale: 'ro' | 'ru' = ru ? 'ru' : 'ro';
  const nume = numeComplet(String(plan?.lastName ?? ''), String(plan?.firstName ?? ''));
  const telefon = normalizeazaTelefon(String(plan?.phone ?? ''));
  const email = emailOptional(String(plan?.email ?? ''));
  const seats = Number(plan?.seats);
  if (!nume || !telefon || email === 'invalid' || !Number.isInteger(seats) || seats < 1 || seats > 4
      || !UUID_RE.test(String(plan?.idempotencyKey ?? '')) || !Number.isInteger(plan?.crmRouteId) || !DATA_RE.test(String(plan?.tripDate ?? ''))
      || !/^[0-9a-f]{64}$/.test(String(codRetur ?? ''))) {
    return { eroare: mesajEroareComanda('necunoscut', 400, locale) };
  }
  const sare = process.env.BILETE_IP_SALT;
  if (!sare) return { eroare: mesajEroareComanda('config', 500, locale) };
  let ipHash: string | null = null;
  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || null;
    ipHash = ip ? createHash('sha256').update(`${sare}|${ip}`).digest('hex') : null;
  } catch { ipHash = null; }
  const r = await comandaBilet({
    tripDate: plan.tripDate, crmRouteId: plan.crmRouteId, goingNorth: plan.goingNorth === true,
    fromRo: String(plan.fromRo ?? '').slice(0, 80), toRo: String(plan.toRo ?? '').slice(0, 80), seats,
    passengerName: nume, phone: telefon, email, lang: locale, idempotencyKey: plan.idempotencyKey, ipHash,
    punctUrcareId: null, locuriAlese: null, codRetur,
  });
  if (!r.ok) return { eroare: mesajEroareComanda(r.cod, r.status, locale, r.eroare) };
  if (!urlPlataSigur(r.checkoutUrl)) return { eroare: mesajEroareComanda('necunoscut', 500, locale) };
  return { url: r.checkoutUrl };
}

/** Procentul reducerii la retur din configurația panoului (546 `bilete_promo_pct`), pentru prețul afișat în tur-retur. */
export async function procentRetur(): Promise<number> {
  const c = await configBilete();
  return c.promo?.activ ? Number(c.promo.pct) || 20 : 0;
}
