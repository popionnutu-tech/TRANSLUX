'use server';

import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { comandaBilet } from '@/lib/bilete-api';
import { mesajEroareComanda, normalizeazaTelefon, numeComplet, urlPlataSigur } from '@/lib/bilete-reguli';

// «Cumpără bilet» (ION-197): formularul din fereastra rezultatelor → comanda la panou → pasagerul pleacă la maib.
// Validarea de aici e doar pentru mesaje bune; adevărul (cursa, prețul, fereastra, plafonul) îl spune API-ul.

export interface StareComanda { eroare?: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function cumparaBilet(_prev: StareComanda, fd: FormData): Promise<StareComanda> {
  const locale: 'ro' | 'ru' = fd.get('lang') === 'ru' ? 'ru' : 'ro';
  const ru = locale === 'ru';

  // Capcana pentru roboți: un câmp invizibil completat → răspuns «ok» fără comandă.
  if (String(fd.get('website') ?? '').trim()) return {};

  const nume = numeComplet(String(fd.get('lastName') ?? ''), String(fd.get('firstName') ?? ''));
  const telefon = normalizeazaTelefon(String(fd.get('phone') ?? ''));
  const seats = Number(fd.get('seats'));
  const idempotencyKey = String(fd.get('idempotencyKey') ?? '');
  const crmRouteId = Number(fd.get('crmRouteId'));
  const tripDate = String(fd.get('tripDate') ?? '');

  if (!nume) return { eroare: ru ? 'Введите фамилию и имя (не короче 2 букв).' : 'Scrie numele și prenumele (cel puțin 2 litere fiecare).' };
  if (!telefon) return { eroare: ru ? 'Введите молдавский номер: 069 123 456.' : 'Scrie un număr moldovenesc: 069 123 456.' };
  if (!Number.isInteger(seats) || seats < 1 || seats > 4) return { eroare: ru ? 'От 1 до 4 мест.' : 'Între 1 și 4 locuri.' };
  if (fd.get('consent') !== 'on') return { eroare: ru ? 'Нужно согласие на обработку данных.' : 'E nevoie de acordul pentru prelucrarea datelor.' };
  if (!UUID_RE.test(idempotencyKey) || !Number.isInteger(crmRouteId) || !/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) {
    return { eroare: mesajEroareComanda('necunoscut', 400, locale) };
  }

  // Amprenta IP pentru plafonul panoului: sare proprie, obligatorie (fără ea nu trimitem o amprentă slabă).
  const sare = process.env.BILETE_IP_SALT;
  if (!sare) {
    console.error('[bilete] BILETE_IP_SALT lipsește');
    return { eroare: mesajEroareComanda('config', 500, locale) };
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
    goingNorth: fd.get('goingNorth') === 'true',
    fromRo: String(fd.get('fromRo') ?? '').slice(0, 80),
    toRo: String(fd.get('toRo') ?? '').slice(0, 80),
    seats,
    passengerName: nume,
    phone: telefon,
    lang: locale,
    idempotencyKey,
    ipHash,
  });
  if (!r.ok) {
    if (r.status >= 500 && r.cod !== 'maib') console.error('[bilete] comanda:', r.status, r.eroare);
    return { eroare: mesajEroareComanda(r.cod, r.status, locale, r.eroare) };
  }
  // Doar spre pagina de plată maib (https, domeniul băncii): un răspuns ciudat al panoului nu trimite omul altundeva.
  if (!urlPlataSigur(r.checkoutUrl)) {
    console.error("[bilete] checkoutUrl neașteptat de la panou");
    return { eroare: mesajEroareComanda("necunoscut", 500, locale) };
  }
  redirect(r.checkoutUrl); // aruncă NEXT_REDIRECT — rămâne în afara oricărui try/catch
}
