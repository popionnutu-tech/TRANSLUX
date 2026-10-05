'use server';

import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { comandaBilet, locuriCursa } from '@/lib/bilete-api';
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
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Harta locurilor cursei (ION-242), chemată din formular la deschidere, la schimbarea numărului de bilete și la
 * fiecare 30 s. Doar spre nord (plecarea din Chișinău); null = indisponibilă → se cumpără fără alegere.
 * Export din 'use server' = acțiune apelabilă de oricine: nu are secret, parametrii se verifică aici.
 */
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
  if (!telefon) return eroare(ru ? 'Введите молдавский номер: 069 123 456.' : 'Scrie un număr moldovenesc: 069 123 456.');
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
    locuriAlese: locuri.locuri,
  });
  if (!r.ok) {
    // ION-242: locurile s-au luat între două reîncărcări ale hărții → spunem care și formularul reîncarcă harta.
    if (r.cod === 'loc_ocupat') {
      const ocupate = r.ocupate?.length ? r.ocupate : (locuri.locuri ?? []);
      return eroare(mesajLocOcupat(ocupate, locale), { ocupate });
    }
    if (r.status >= 500 && r.cod !== 'maib') console.error('[bilete] comanda:', r.status, r.eroare);
    return eroare(mesajEroareComanda(r.cod, r.status, locale, r.eroare));
  }
  // Doar spre pagina de plată maib (https, domeniul băncii): un răspuns ciudat al panoului nu trimite omul altundeva.
  if (!urlPlataSigur(r.checkoutUrl)) {
    console.error("[bilete] checkoutUrl neașteptat de la panou");
    return eroare(mesajEroareComanda("necunoscut", 500, locale));
  }
  redirect(r.checkoutUrl); // aruncă NEXT_REDIRECT — rămâne în afara oricărui try/catch
}
