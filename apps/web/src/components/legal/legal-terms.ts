import type { Locale } from '@/lib/i18n';
import { OPERATOR, type LegalDoc } from './legal-content';

/**
 * Condițiile de vânzare a biletelor online (ION-208). Ion, 03.10.2026: «trebuie puse la cumpărarea biletului,
 * elaborează conform legislației RM, ANTA».
 *
 * Temeiul regulilor de restituire: Regulamentul transporturilor auto de călători și bagaje, aprobat prin HG nr. 854
 * din 28.07.2006, pct. 10 lit. b)–d) (textul citit pe 03.10.2026 din versiunea publicată de autogara.md), și pct. 28
 * (documentele de călătorie). Comision de vânzare preliminară nu se percepe online, deci nu se reține.
 * De verificat de un jurist înainte de lansare: statutul actual al HG 854/2006 și forma biletului cerută de ANTA.
 */

export const TERMS_UPDATED = { ro: '3 octombrie 2026', ru: '3 октября 2026' } as const;

const BOT = 'https://t.me/TransluxMoldova_bot';

export function termsDoc(locale: Locale): LegalDoc {
  if (locale === 'ru') {
    return {
      title: 'Условия продажи онлайн-билетов',
      intro:
        `Эти условия действуют при покупке билета на сайте ${OPERATOR.site} и составлены в соответствии с Положением об автомобильных перевозках пассажиров и багажа (Постановление Правительства № 854 от 28.07.2006), Законом № 284/2004 об электронной торговле и Законом № 105/2003 о защите прав потребителей. Оплачивая билет, вы принимаете эти условия.`,
      sections: [
        {
          title: '1. Продавец и перевозчик',
          body: [
            `${OPERATOR.name}, IDNO ${OPERATOR.idno}, ${OPERATOR.address}, работает под маркой ${OPERATOR.brand}.`,
            `Телефон: ${OPERATOR.phone}. Бот в Telegram: ${BOT}.`,
          ],
        },
        {
          title: '2. Онлайн-билет',
          body: [
            'Онлайн-билет подтверждает оплату и место на выбранном рейсе (дата, направление, остановки посадки и высадки, количество мест). На каждое место выдаётся отдельный QR-код.',
            'Билет приходит на странице билета на сайте, а если вы указали e-mail — и на почту. Сохраните ссылку: по ней билет открывается в любой момент.',
            'При посадке покажите QR-код водителю. Водитель сканирует код и выдаёт кассовый чек с отметкой об онлайн-оплате (п. 28 Положения).',
            'Онлайн продаются билеты по полному тарифу. Ребёнок до 7 лет включительно без отдельного места едет бесплатно; билет для ребёнка от 7 до 10 лет со скидкой 50% покупается у водителя (п. 10 а) Положения).',
          ],
        },
        {
          title: '3. Цена и оплата',
          body: [
            'Цена указана в леях и включает все сборы; комиссия за предварительную продажу не взимается.',
            'Оплата — банковской картой через защищённую страницу maib. Мы не видим и не храним данные вашей карты.',
            'Билет считается купленным после подтверждения оплаты банком. Если банк не подтвердил оплату, заказ отменяется, деньги не списываются.',
          ],
        },
        {
          title: '4. До какого времени продаются билеты',
          body: [
            '- рейсы с севера в Кишинёв — до отправления рейса из начального пункта;',
            '- рейсы из Кишинёва на север — не позднее чем за 2 часа до отправления с вашей остановки.',
          ],
        },
        {
          title: '5. Возврат билета',
          body: [
            'Деньги возвращаются по п. 10 Положения:',
            '- не позднее чем за 2 часа до отправления с вашей остановки — полная стоимость;',
            '- менее чем за 2 часа, но не позднее чем за 15 минут до отправления — стоимость за вычетом 15%;',
            '- если вы опоздали на автобус — в течение 3 часов после отправления стоимость за вычетом 25%; при болезни или несчастном случае — в течение 72 часов, с подтверждающими документами;',
            '- если автобус отправился с опозданием более чем на 1 час, рейс отменён по нашей вине или вам не предоставили место — полная стоимость.',
            'Билет, по которому вы уже сели в автобус (код отсканирован), не возвращается.',
            `Как подать заявку: в нашем боте в Telegram (${BOT}) или по телефону ${OPERATOR.phone}. Укажите ссылку на билет или номер телефона из заказа.`,
            'Деньги возвращаются на карту, с которой была оплата, через maib; срок зачисления зависит от банка, выпустившего карту.',
          ],
        },
        {
          title: '6. Багаж и правила поездки',
          body: [
            'Ручная кладь и багаж перевозятся по Положению об автомобильных перевозках пассажиров и багажа. Водитель может отказать в перевозке опасных предметов и багажа, мешающего другим пассажирам.',
          ],
        },
        {
          title: '7. Жалобы',
          body: [
            `Жалобы принимаем по телефону ${OPERATOR.phone} и в боте ${BOT}; ответим в течение 30 дней.`,
            'Если вы не согласны с ответом, вы можете обратиться в Агентство по защите прав потребителей и надзору за рынком (consumator.gov.md) или в суд.',
          ],
        },
        {
          title: '8. Персональные данные и изменения',
          body: [
            'Как мы обрабатываем данные заказа (имя, телефон, e-mail), описано в Политике конфиденциальности.',
            `Мы можем обновлять эти условия; к заказу применяется редакция, действовавшая в момент оплаты. Последнее обновление: ${TERMS_UPDATED.ru}.`,
          ],
        },
      ],
    };
  }

  return {
    title: 'Condițiile de vânzare a biletelor online',
    intro:
      `Aceste condiții se aplică la cumpărarea biletului pe ${OPERATOR.site} și sunt întocmite conform Regulamentului transporturilor auto de călători și bagaje (Hotărârea Guvernului nr. 854 din 28.07.2006), Legii nr. 284/2004 privind comerțul electronic și Legii nr. 105/2003 privind protecția consumatorilor. Plătind biletul, acceptați aceste condiții.`,
    sections: [
      {
        title: '1. Vânzătorul și transportatorul',
        body: [
          `${OPERATOR.name}, IDNO ${OPERATOR.idno}, ${OPERATOR.address}, activează sub marca ${OPERATOR.brand}.`,
          `Telefon: ${OPERATOR.phone}. Botul din Telegram: ${BOT}.`,
        ],
      },
      {
        title: '2. Biletul online',
        body: [
          'Biletul online confirmă plata și locul pe cursa aleasă (data, direcția, oprirea de urcare și cea de coborâre, numărul de locuri). Fiecare loc are codul QR propriu.',
          'Biletul îl primiți pe pagina biletului de pe site și, dacă ați lăsat e-mailul, pe e-mail. Păstrați linkul: biletul se deschide oricând de acolo.',
          'La urcare arătați codul QR șoferului. Șoferul scanează codul și eliberează bonul fiscal cu mențiunea plății online (pct. 28 din Regulament).',
          'Online se vând bilete la tarif întreg. Copilul de până la 7 ani inclusiv, fără loc separat, călătorește gratuit; biletul pentru copilul de 7–10 ani, cu reducere de 50%, se cumpără la șofer (pct. 10 lit. a) din Regulament).',
        ],
      },
      {
        title: '3. Prețul și plata',
        body: [
          'Prețul este în lei și include toate taxele; nu se percepe comision de vânzare preliminară.',
          'Plata se face cu cardul bancar pe pagina securizată maib. Noi nu vedem și nu păstrăm datele cardului.',
          'Biletul e cumpărat după ce banca confirmă plata. Dacă banca nu confirmă plata, comanda se anulează și banii nu se retrag.',
        ],
      },
      {
        title: '4. Până când se vând biletele',
        body: [
          '- cursele din nord spre Chișinău — până la plecarea cursei din capătul de pornire;',
          '- cursele din Chișinău spre nord — cel târziu cu 2 ore înainte de plecarea de la oprirea dumneavoastră.',
        ],
      },
      {
        title: '5. Restituirea biletului',
        body: [
          'Banii se restituie conform pct. 10 din Regulament:',
          '- cu cel puțin 2 ore înainte de plecarea de la oprirea dumneavoastră — costul integral;',
          '- cu mai puțin de 2 ore, dar cel puțin 15 minute înainte de plecare — costul minus 15%;',
          '- dacă ați întârziat la autobuz — în cel mult 3 ore de la plecare, costul minus 25%; în caz de boală sau accident — în cel mult 72 de ore, cu documente doveditoare;',
          '- dacă autobuzul a plecat cu o întârziere mai mare de o oră, cursa a fost anulată din vina noastră sau nu vi s-a acordat locul — costul integral.',
          'Biletul cu care ați urcat deja (codul a fost scanat) nu se restituie.',
          `Cum cereți restituirea: prin botul nostru din Telegram (${BOT}) sau la telefonul ${OPERATOR.phone}. Spuneți linkul biletului sau numărul de telefon din comandă.`,
          'Banii se întorc pe cardul cu care s-a plătit, prin maib; termenul în care apar pe card depinde de banca emitentă a cardului.',
        ],
      },
      {
        title: '6. Bagajele și regulile călătoriei',
        body: [
          'Bagajul de mână și bagajele se transportă conform Regulamentului transporturilor auto de călători și bagaje. Șoferul poate refuza transportul obiectelor periculoase și al bagajelor care îi incomodează pe ceilalți pasageri.',
        ],
      },
      {
        title: '7. Reclamațiile',
        body: [
          `Reclamațiile le primim la telefonul ${OPERATOR.phone} și în botul ${BOT}; răspundem în cel mult 30 de zile.`,
          'Dacă nu sunteți de acord cu răspunsul, vă puteți adresa Agenției pentru Protecția Consumatorilor și Supravegherea Pieței (consumator.gov.md) sau instanței de judecată.',
        ],
      },
      {
        title: '8. Datele personale și modificările',
        body: [
          'Cum prelucrăm datele comenzii (numele, telefonul, e-mailul) este descris în Politica de confidențialitate.',
          `Putem actualiza aceste condiții; comenzii i se aplică versiunea în vigoare la momentul plății. Ultima actualizare: ${TERMS_UPDATED.ro}.`,
        ],
      },
    ],
  };
}
