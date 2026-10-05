import type { Limba } from '../types.js';
import type { MotivDispecer, MotivFaraBani, CodRefuzOferta, OfertaRetur, StareRetur } from '../services/panouBilete.js';

// ION-244: textele returnării pentru client, RO + RU, pure (testate în retur-texte.test.ts). Botul promite doar ce a
// confirmat panoul: «banca a primit cererea» abia la `creat`/`finalizat`; în rest «verifică starea» sau dispecerul.

export const TELEFON_DISPECERAT = '+373 60 401 010';
const FUS = 'Europe/Chisinau';

type Bilingv = Record<Limba, string>;
const alege = (t: Bilingv, lang: Limba): string => t[lang];

export function dataOra(iso: string, lang: Limba): string {
  return new Date(iso).toLocaleString(lang === 'ru' ? 'ru-RU' : 'ro-RO', {
    timeZone: FUS, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function ora(iso: string, lang: Limba): string {
  return new Date(iso).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'ro-RO', { timeZone: FUS, hour: '2-digit', minute: '2-digit' });
}

/** Suma în lei: întreg fără zecimale, altfel cu două (virgulă în RO și RU). */
export function lei(suma: number): string {
  return Number.isInteger(suma) ? String(suma) : suma.toFixed(2).replace('.', ',');
}

/** Telefonul șoferului (373XXXXXXXX sau 0XXXXXXXX) ca «+373 69 123 456»; altă formă → null (nu arătăm ce nu înțelegem). */
export function telefonAfisat(telefon: string | null | undefined): string | null {
  const d = String(telefon ?? '').replace(/\D/g, '');
  const local = d.length === 11 && d.startsWith('373') ? d.slice(3) : d.length === 9 && d.startsWith('0') ? d.slice(1) : null;
  if (!local || local.length !== 8) return null;
  return `+373 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
}

export const T_RETUR = {
  indisponibil: { ro: `Returnarea momentan doar la telefon ${TELEFON_DISPECERAT}.`, ru: `Возврат сейчас только по телефону ${TELEFON_DISPECERAT}.` },
  seProceseaza: { ro: 'Se procesează…', ru: 'Обрабатывается…' },
  pastrat: { ro: 'Bine, biletul rămâne valabil.', ru: 'Хорошо, билет остаётся действительным.' },
  cereCifre: {
    ro: 'Pentru siguranță: scrie ultimele 4 cifre ale telefonului din comandă.',
    ru: 'Для безопасности: напишите последние 4 цифры телефона, указанного в заказе.',
  },
  doarCifre: { ro: 'Scrie doar 4 cifre, de exemplu 3456.', ru: 'Напишите только 4 цифры, например 3456.' },
  dispecer: { ro: 'Cererea ta a ajuns la dispecer, te contactează.', ru: 'Ваша заявка передана диспетчеру, с вами свяжутся.' },
  blocat: {
    ro: 'Prea multe încercări greșite. Cererea ta a ajuns la dispecer, te contactează.',
    ru: 'Слишком много неверных попыток. Ваша заявка передана диспетчеру, с вами свяжутся.',
  },
  faraBani: {
    ro: 'Cu mai puțin de 4 ore înainte de plecare biletul nu se mai returnează. Dacă ai întârziat, biletul e valabil azi pe altă cursă TRANSLUX în aceeași direcție, dacă șoferul are loc.',
    ru: 'Менее чем за 4 часа до отправления билет не возвращается. Если вы опоздали, билет действителен сегодня на другом рейсе TRANSLUX в том же направлении, если у водителя есть место.',
  },
  urcat: { ro: 'Biletul a fost deja scanat la urcare; nu se mai returnează.', ru: 'Билет уже отсканирован при посадке, вернуть его нельзя.' },
  nelegat: {
    ro: `Biletul e legat de alt cont Telegram. Returnarea o cere cel care l-a deschis primul în bot sau dispeceratul: ${TELEFON_DISPECERAT}.`,
    ru: `Билет привязан к другому аккаунту Telegram. Возврат может запросить тот, кто первым открыл его в боте, или диспетчер: ${TELEFON_DISPECERAT}.`,
  },
  stareComanda: {
    ro: 'Biletul nu mai poate fi returnat: e deja anulat, returnat sau neplătit.',
    ru: 'Билет нельзя вернуть: он уже отменён, возвращён или не оплачен.',
  },
  inexistent: { ro: 'Nu găsesc biletul. Deschide-l din nou din pagina biletului.', ru: 'Билет не найден. Откройте его заново со страницы билета.' },
  faraBilete: {
    ro: `Nu văd bilete active legate de acest cont. Pentru ajutor: ${TELEFON_DISPECERAT}.`,
    ru: `Не вижу активных билетов, привязанных к этому аккаунту. Помощь: ${TELEFON_DISPECERAT}.`,
  },
  alegeBilet: { ro: 'Biletele tale active. Alege biletul de returnat:', ru: 'Ваши активные билеты. Выберите билет для возврата:' },
  meniu: {
    ro: `Cu ce te pot ajuta? Poți returna un bilet cu butonul de mai jos. Pentru altceva: ${TELEFON_DISPECERAT}.`,
    ru: `Чем помочь? Вернуть билет можно кнопкой ниже. По другим вопросам: ${TELEFON_DISPECERAT}.`,
  },
  altceva: {
    ro: `Pentru asta te ajută dispeceratul: ${TELEFON_DISPECERAT}. Aici în bot poți returna biletul.`,
    ru: `С этим поможет диспетчер: ${TELEFON_DISPECERAT}. Здесь в боте можно вернуть билет.`,
  },
  dispecerVina: { ro: 'Am transmis dispecerului, te contactează.', ru: 'Мы передали диспетчеру, с вами свяжутся.' },
  escaladareEsuata: {
    ro: `Nu am putut transmite cererea acum. Sună la ${TELEFON_DISPECERAT}.`,
    ru: `Не удалось передать заявку. Позвоните по номеру ${TELEFON_DISPECERAT}.`,
  },
  escaladareDeja: {
    ro: `Cererea ta e deja la dispecer. Dacă e urgent: ${TELEFON_DISPECERAT}.`,
    ru: `Ваша заявка уже у диспетчера. Если срочно: ${TELEFON_DISPECERAT}.`,
  },
  verificaNereusit: {
    ro: 'Nu am putut afla rezultatul acum. Apasă «Verifică starea» peste un minut.',
    ru: 'Не удалось узнать результат. Нажмите «Проверить статус» через минуту.',
  },
} as const satisfies Record<string, Bilingv>;

export const BUTOANE = {
  returneaza: { ro: '↩️ Returnează biletul', ru: '↩️ Вернуть билет' },
  /** ION-251: deschide mini app-ul clientului pe harta «Acum» cu cursa lui (sub bilet și sub harta automată). */
  undeAutobuz: { ro: '📍 Vezi unde e autobuzul', ru: '📍 Где сейчас автобус' },
  pastrez: { ro: 'Păstrez biletul', ru: 'Оставить билет' },
  verifica: { ro: '🔄 Verifică starea', ru: '🔄 Проверить статус' },
  anuleaza: (suma: number): Bilingv => ({ ro: `Anulează biletul și primește ${lei(suma)} lei`, ru: `Отменить билет и получить ${lei(suma)} лей` }),
} as const;

export const text = (cheie: keyof typeof T_RETUR, lang: Limba): string => alege(T_RETUR[cheie], lang);
export const buton = (b: Bilingv, lang: Limba): string => alege(b, lang);

/** Eticheta scurtă a unui bilet pe buton: «Briceni → Chișinău · 14.10, 05:45». */
export function etichetaBilet(b: { from_name: string; to_name: string; departure_at: string }, lang: Limba): string {
  return `${b.from_name} → ${b.to_name} · ${dataOra(b.departure_at, lang)}`;
}

/** Minutele cât oferta mai e valabilă (rotunjit în jos, cel puțin 1, cel mult 15). */
export function minuteValabile(expiraLa: string, nowMs: number): number {
  const m = Math.floor((Date.parse(expiraLa) - nowMs) / 60_000);
  return Math.min(15, Math.max(1, Number.isFinite(m) ? m : 1));
}

/** Mesajul ofertei: biletul, suma, valabilitatea (15 minute sau mai puțin, cu ora-limită). */
export function textOferta(o: OfertaRetur, nowMs: number, sumaSchimbata = false): string {
  const lang = o.lang;
  const min = minuteValabile(o.expira_la, nowMs);
  const pana = ora(o.expira_la, lang);
  if (lang === 'ru') {
    return [
      sumaSchimbata ? 'Сумма изменилась, вот новая сумма.' : null,
      `🎫 ${o.from_name} → ${o.to_name}`,
      `${dataOra(o.departure_at, lang)}`,
      `Вернём ${lei(o.suma)} лей из ${lei(o.total)} лей.`,
      `Сумма действительна ${min} мин. (до ${pana}). Деньги придут на карту, которой вы платили.`,
    ].filter(Boolean).join('\n');
  }
  return [
    sumaSchimbata ? 'Suma s-a schimbat, uite noua sumă.' : null,
    `🎫 ${o.from_name} → ${o.to_name}`,
    `${dataOra(o.departure_at, lang)}`,
    `Primești înapoi ${lei(o.suma)} lei din ${lei(o.total)} lei.`,
    `Suma e valabilă ${min === 1 ? '1 minut' : `${min} minute`} (până la ${pana}). Banii ajung pe cardul cu care ai plătit.`,
  ].filter(Boolean).join('\n');
}

export function textFaraBani(motiv: MotivFaraBani, lang: Limba): string {
  return motiv === 'urcat' ? text('urcat', lang) : text('faraBani', lang);
}

export function textDispecer(motiv: MotivDispecer, lang: Limba): string {
  return motiv === 'blocat' ? text('blocat', lang) : text('dispecer', lang);
}

export function textRefuzOferta(cod: CodRefuzOferta, lang: Limba): string {
  if (cod === 'nelegat') return text('nelegat', lang);
  if (cod === 'stare') return text('stareComanda', lang);
  return text('inexistent', lang);
}

export function textCifreGresite(ramase: number, lang: Limba): string {
  return lang === 'ru'
    ? `Цифры не совпадают. Осталось попыток: ${ramase}.`
    : `Cifrele nu se potrivesc. ${ramase === 1 ? 'Mai ai 1 încercare.' : `Mai ai ${ramase} încercări.`}`;
}

/** Textul refuzului venit de la executor (`refuz:<motiv>`) și dacă biletele rămân valabile. */
function textRefuz(motiv: string | undefined, lang: Limba): string {
  const m = (motiv ?? '').toLowerCase();
  if (/urcat/.test(m)) return text('urcat', lang);
  const valabil = lang === 'ru' ? ' Билеты остаются действительными.' : ' Biletele rămân valabile.';
  if (/inchis|sub_4h|4h/.test(m)) return text('faraBani', lang);
  if (/maib_anulata/.test(m)) {
    return lang === 'ru' ? 'Банк отказал в возврате. Диспетчер займётся этим и свяжется с вами.' : 'Banca a refuzat returnarea. Dispecerul se ocupă și te contactează.';
  }
  if (/maib|banca|bank/.test(m)) {
    return (lang === 'ru' ? 'Банк отказал в возврате.' : 'Banca a refuzat returnarea.') + valabil;
  }
  return (lang === 'ru'
    ? `Возврат не удалось выполнить автоматически. Помощь: ${TELEFON_DISPECERAT}.`
    : `Returnarea nu s-a putut face automat. Pentru ajutor: ${TELEFON_DISPECERAT}.`) + valabil;
}

/** Ce vede clientul pentru starea returnării și dacă primește butonul «Verifică starea». */
export interface MesajStare {
  text: string;
  cuVerificare: boolean;
}

export function textStare(s: { stare: StareRetur; suma: number | null; motiv?: string }, lang: Limba): MesajStare {
  const suma = s.suma != null ? lei(s.suma) : null;
  const ru = lang === 'ru';
  switch (s.stare) {
    case 'creat':
    case 'finalizat':
      return {
        text: ru
          ? `Билет отменён. Банк получил запрос на возврат${suma ? ` ${suma} лей` : ''}; деньги придут на карту, которой вы платили.`
          : `Biletul e anulat. Banca a primit cererea de returnare${suma ? ` a ${suma} lei` : ''}; banii ajung pe cardul cu care ai plătit.`,
        cuVerificare: false,
      };
    case 'necunoscut':
      return { text: ru ? 'Мы отправили запрос; диспетчер проверяет результат.' : 'Am trimis cererea; dispecerul verifică rezultatul.', cuVerificare: true };
    case 'in_curs':
      return { text: ru ? 'Возврат обрабатывается. Проверьте статус через минуту.' : 'Returnarea se procesează. Verifică starea peste un minut.', cuVerificare: true };
    case 'nedeterminat':
      return { text: ru ? 'Результата пока нет. Проверьте статус через минуту.' : 'Încă nu am rezultatul. Verifică starea peste un minut.', cuVerificare: true };
    case 'refuz':
      return { text: textRefuz(s.motiv, lang), cuVerificare: false };
    case 'refuz_banca':
      return {
        text: ru ? 'Банк не выполнил возврат автоматически; этим займётся диспетчер и свяжется с вами.' : 'Banca n-a făcut returnarea automat; dispecerul se ocupă și te contactează.',
        cuVerificare: false,
      };
    case 'expirata':
      return { text: ru ? 'Время предложения истекло.' : 'Oferta a expirat.', cuVerificare: false };
    case 'neatinsa':
      return { text: ru ? 'Возврат ещё не подтверждён.' : 'Returnarea nu a fost confirmată încă.', cuVerificare: false };
    case 'inexistent':
      return {
        text: ru ? `Не нахожу эту заявку. Откройте билет заново или позвоните ${TELEFON_DISPECERAT}.` : `Nu găsesc cererea. Deschide biletul din nou sau sună la ${TELEFON_DISPECERAT}.`,
        cuVerificare: false,
      };
  }
}

/** «Am întârziat»: fără bani; biletul valabil azi pe altă cursă (ION-243) + telefonul șoferului dacă îl avem. */
export function textIntarziat(telefonSofer: string | null, lang: Limba): string {
  const tel = telefonAfisat(telefonSofer);
  const baza = lang === 'ru'
    ? 'Если вы опоздали на автобус, деньги не возвращаются, но билет действителен сегодня на другом рейсе TRANSLUX в том же направлении, если у водителя есть место.'
    : 'Dacă ai pierdut autobuzul, banii nu se returnează, dar biletul e valabil azi pe altă cursă TRANSLUX în aceeași direcție, dacă șoferul are loc.';
  if (!tel) return baza;
  return `${baza}\n${lang === 'ru' ? 'Телефон водителя вашего рейса' : 'Telefonul șoferului cursei tale'}: ${tel}`;
}
