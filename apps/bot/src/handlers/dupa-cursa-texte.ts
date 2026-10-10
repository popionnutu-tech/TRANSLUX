import type { Limba } from '../types.js';
import { dataOra } from './retur-texte.js';

// ION-252: textele de după cursă și ale plângerii, RO + RU, pure (testate în dupa-cursa.test.ts). Textele vin de la
// Ion (05.10): «Mulțumim că ai călătorit cu TRANSLUX», «👍 Totul a fost bine» / «👎 Am o plângere».

type Bilingv = Record<Limba, string>;

export const T_DUPA_CURSA = {
  bine: { ro: 'Mulțumim! Ne bucurăm.', ru: 'Спасибо! Мы рады.' },
  cerePlangere: {
    ro: 'Scrie-ne ce s-a întâmplat (poți trimite și o poză).',
    ru: 'Напишите нам, что случилось (можно приложить фото).',
  },
  plangerePrimita: { ro: 'Plângerea ta a ajuns la noi. Mulțumim!', ru: 'Ваша жалоба получена. Спасибо!' },
  plangerePlafon: {
    ro: 'Azi ai trimis deja 3 plângeri; le-am primit pe toate. Mâine poți scrie din nou.',
    ru: 'Сегодня вы уже отправили 3 жалобы; мы получили все. Завтра можно написать снова.',
  },
  plangereEsuata: {
    ro: 'Nu am putut trimite plângerea acum. Încearcă să o trimiți din nou peste câteva minute.',
    ru: 'Не удалось отправить жалобу. Попробуйте отправить её ещё раз через несколько минут.',
  },
  cereText: {
    ro: 'Am primit poza. Scrie-ne și în câteva cuvinte ce s-a întâmplat.',
    ru: 'Фото получено. Напишите в нескольких словах, что случилось.',
  },
  doarTextSauPoza: {
    ro: 'Scrie plângerea în cuvinte (poți adăuga o poză).',
    ru: 'Напишите жалобу словами (можно добавить фото).',
  },
  nuEBiletulTau: { ro: 'Acest bilet e legat de alt cont.', ru: 'Этот билет привязан к другому аккаунту.' },
} as const satisfies Record<string, Bilingv>;

export const BUTOANE_DUPA_CURSA = {
  bine: { ro: '👍 Totul a fost bine', ru: '👍 Всё было хорошо' },
  plangere: { ro: '👎 Am o plângere', ru: '👎 У меня жалоба' },
} as const satisfies Record<string, Bilingv>;

export const textDupaCursa = (cheie: keyof typeof T_DUPA_CURSA, lang: Limba): string => T_DUPA_CURSA[cheie][lang];

/** «🚌 Mulțumim că ai călătorit cu TRANSLUX! Cum a fost cursa Briceni → Chișinău din 14.10, 05:45?» */
export function textMultumire(c: { from_name: string; to_name: string; departure_at: string }, lang: Limba): string {
  const cand = dataOra(c.departure_at, lang);
  return lang === 'ru'
    ? `🚌 Спасибо, что ездите с TRANSLUX! Как прошла поездка ${c.from_name} → ${c.to_name} ${cand}?`
    : `🚌 Mulțumim că ai călătorit cu TRANSLUX! Cum a fost cursa ${c.from_name} → ${c.to_name} din ${cand}?`;
}
