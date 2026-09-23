// Ce știe asistentul de pe site în afara tool-urilor. UN singur loc, ca o
// schimbare de adresă sau de regulă să nu rămână veche într-o frază din prompt.
//
// Tot ce nu e aici și nu vine dintr-un tool, asistentul NU știe — și spune asta.

import { COMPANY_PHONE_LOCAL } from '@/lib/company-phone';

export interface Station {
  key: 'chisinau' | 'balti';
  name_ro: string;
  name_ru: string;
  address_ro: string;
  address_ru: string;
  /** Ce se caută în hărți. Căutare după adresă, nu coordonate scrise de mână. */
  query: string;
}

// Adresele sunt cele din get-company-info (sursa agentului de pe linie).
export const STATIONS: Station[] = [
  {
    key: 'chisinau',
    name_ro: 'Stația Chișinău (Autogara TRANSLUX)',
    name_ru: 'Станция Кишинёв (автовокзал ТРАНСЛЮКС)',
    address_ro: 'str. Calea Moșilor 2/a, Chișinău',
    address_ru: 'ул. Каля Мошилор 2/а, Кишинёв',
    query: 'Calea Moșilor 2/a, Chișinău, Moldova',
  },
  {
    key: 'balti',
    name_ro: 'Stația Bălți (Autogara, peroanele 15–16)',
    name_ru: 'Станция Бельцы (автовокзал, перроны 15–16)',
    address_ro: 'Autogara Bălți, str. Independenței, peroanele 15–16',
    address_ru: 'автовокзал Бельцы, ул. Индепенденцей, перроны 15–16',
    query: 'Autogara Bălți, strada Independenței, Bălți, Moldova',
  },
];

export const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
export const wazeUrl = (q: string) => `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;

/** Numărul liniei, în forma pe care o scrie omul: 060 401 010. */
export const LINE_PHONE = `${COMPANY_PHONE_LOCAL.slice(0, 3)} ${COMPANY_PHONE_LOCAL.slice(3, 6)} ${COMPANY_PHONE_LOCAL.slice(6)}`;

/**
 * Plata online și biletul online. Pe 23.09.2026 site-ul NU vinde bilete: căutarea
 * arată cursa, prețul și numărul șoferului, iar nota din migr. 310 spune că
 * rezervările «se rezolvă cu cumpărarea biletului online» — deci e un plan, nu un
 * serviciu. Până nu scrie Ion cum se plătește și cum se arată biletul, asistentul
 * spune exact atât, fără să inventeze un mod de plată.
 */
export const ONLINE_TICKETS_RO = 'Deocamdată pe translux.md nu se cumpără bilete online: site-ul arată cursele, prețul și numărul șoferului. Achitarea online și biletul electronic sunt în pregătire. Până atunci locul se rezervă sunând șoferul cursei, iar biletul se achită în autobuz.';
export const ONLINE_TICKETS_RU = 'Пока на translux.md билеты онлайн не продаются: сайт показывает рейсы, цену и номер водителя. Онлайн-оплата и электронный билет готовятся. До тех пор место бронируется звонком водителю рейса, а билет оплачивается в автобусе.';
