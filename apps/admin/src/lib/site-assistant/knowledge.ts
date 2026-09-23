// Ce știe asistentul de pe site în afara tool-urilor. UN singur loc, ca o
// schimbare de adresă sau de regulă să nu rămână veche într-o frază din prompt.
//
// Tot ce nu e aici și nu vine dintr-un tool, asistentul NU știe — și spune asta.

import { COMPANY_PHONE_LOCAL } from '@/lib/company-phone';
import { formatPhone } from './voice-to-text';

export interface Station {
  key: 'chisinau' | 'balti' | 'edinet' | 'briceni';
  name_ro: string;
  name_ru: string;
  address_ro: string;
  address_ru: string;
  /** Ce se caută în hărți, când stația n-are punct confirmat. */
  query: string;
  /**
   * Punctul exact, DOAR când l-a dat Ion (nu ghicit din adresă). Cu el, butoanele
   * duc fix la stație, nu la o stradă.
   */
  point?: { lat: number; lon: number; googlePlace?: string };
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
    // Ion, 23.09: «locația autogării noastre Chișinău» — locul «TransLux: Chișinău-Bălți» pe Google Maps.
    point: {
      lat: 47.0237536,
      lon: 28.8627521,
      googlePlace: 'https://www.google.com/maps/place/TransLux:+Chi%C8%99in%C4%83u-B%C4%83l%C8%9Bi/@47.0237536,28.8627521,17z/data=!4m6!3m5!1s0x40c97d0041a0af4f:0x8df77b357a3b1102!8m2!3d47.0237536!4d28.8627521!16s%2Fg%2F11ykwbcl7h',
    },
  },
  {
    key: 'balti',
    name_ro: 'Stația Bălți (Autogara, peroanele 15–16)',
    name_ru: 'Станция Бельцы (автовокзал, перроны 15–16)',
    address_ro: 'Autogara Bălți, str. Independenței, peroanele 15–16',
    address_ru: 'автовокзал Бельцы, ул. Индепенденцей, перроны 15–16',
    query: 'Autogara Bălți, strada Independenței, Bălți, Moldova',
    // Ion, 23.09: «locație exactă peron Bălți la auto noastre». Linkul lui duce la
    // «PayNet Partener Terminal de plată», lângă peron — de aici DOAR coordonatele,
    // fără locul Google, ca omul să nu vadă numele terminalului în hartă.
    point: { lat: 47.7697219, lon: 27.9417474 },
  },
  {
    key: 'edinet',
    name_ro: 'Oprirea Edineț',
    name_ru: 'Остановка Единец',
    address_ro: 'str. Independenței 122, Edineț',
    address_ru: 'ул. Индепенденцей 122, Единец',
    query: 'Strada Independenței 122, Edineț, Moldova',
    // Ion, 23.09: «locație exactă oprire Edineț».
    point: {
      lat: 48.1665595,
      lon: 27.3096485,
      googlePlace: 'https://www.google.com/maps/place/Strada+Independen%C8%9Bei+122,+Edine%C5%A3,+Moldova/@48.1665595,27.3096485,18z/data=!4m6!3m5!1s0x47335ca5d50ea857:0xb4a4d0498652c38d!8m2!3d48.1665595!4d27.3096485!16s%2Fg%2F11w1qwlybh',
    },
  },
  {
    key: 'briceni',
    name_ro: 'Oprirea Briceni',
    name_ru: 'Остановка Бричень',
    // Linkul lui Ion e un punct fără adresă; nu inventăm strada.
    address_ro: 'Briceni — punctul exact e pe hartă',
    address_ru: 'Бричень — точное место на карте',
    query: 'Briceni, Moldova',
    // Ion, 23.09: «locație exactă oprire Briceni».
    point: { lat: 48.357826, lon: 27.092106 },
  },
];

export const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
export const wazeUrl = (q: string) => `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;

/** Google Maps al stației: locul confirmat de Ion, altfel căutarea după adresă. */
export const stationMaps = (s: Station): string =>
  s.point?.googlePlace
  ?? (s.point ? `https://www.google.com/maps/search/?api=1&query=${s.point.lat},${s.point.lon}` : mapsUrl(s.query));

/** Waze al stației: navigare la punct, altfel căutare după adresă. */
export const stationWaze = (s: Station): string =>
  (s.point ? `https://waze.com/ul?ll=${s.point.lat},${s.point.lon}&navigate=yes` : wazeUrl(s.query));

/** Numărul liniei, în forma pe care o scrie omul: +373 60 401 010. */
export const LINE_PHONE = formatPhone(COMPANY_PHONE_LOCAL) ?? COMPANY_PHONE_LOCAL;

/**
 * Plata online și biletul online. Pe 23.09.2026 site-ul NU vinde bilete: căutarea
 * arată cursa, prețul și numărul șoferului, iar nota din migr. 310 spune că
 * rezervările «se rezolvă cu cumpărarea biletului online» — deci e un plan, nu un
 * serviciu. Până nu scrie Ion cum se plătește și cum se arată biletul, asistentul
 * spune exact atât, fără să inventeze un mod de plată.
 */
export const ONLINE_TICKETS_RO = 'Deocamdată pe translux.md nu se cumpără bilete online: site-ul arată cursele, prețul și numărul șoferului. Achitarea online și biletul electronic sunt în pregătire. Până atunci locul se rezervă sunând șoferul cursei, iar biletul se achită în autobuz.';
export const ONLINE_TICKETS_RU = 'Пока на translux.md билеты онлайн не продаются: сайт показывает рейсы, цену и номер водителя. Онлайн-оплата и электронный билет готовятся. До тех пор место бронируется звонком водителю рейса, а билет оплачивается в автобусе.';
