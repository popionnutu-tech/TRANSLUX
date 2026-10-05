import type { Locale } from '@/lib/i18n';
import { OPERATOR, type LegalDoc } from './legal-content';

/**
 * Condițiile de vânzare a biletelor online (ION-208), pe cele 7 secțiuni din modelul maib (ION-235, 05.10.2026:
 * «vă rugăm să vă asigurați că website-ul corespunde cerințelor» — docs.maibmerchants.md/main/ro/integration/requirements):
 * dispoziții generale; protecția datelor; înregistrarea și achitarea comenzii; livrarea; dreptul la retur;
 * politica de confidențialitate; datele de contact.
 *
 * Restituirea (din 05.10.2026, decizia lui Ion): grila online 24/12/6/4 h, în noimi din preț (135/120/105/90/0 lei),
 * aceeași ca `GRILA_RESTITUIRE` din apps/admin/src/lib/bilete/refund-reguli.ts. Ion: pct. 10 din HG 854/2006 e scris
 * pentru returnarea «în casa de bilete» a autogării, nu pentru biletul online. De verificat de un jurist.
 * Referința veche: Regulamentul transporturilor auto de călători și bagaje, aprobat prin HG nr. 854
 * din 28.07.2006, pct. 10 lit. b)–d) (textul citit pe 03.10.2026 din versiunea publicată de autogara.md), și pct. 28
 * (documentele de călătorie). Comision de vânzare preliminară nu se percepe online, deci nu se reține.
 * De verificat de un jurist înainte de lansare: statutul actual al HG 854/2006 și forma biletului cerută de ANTA.
 */

export const TERMS_UPDATED = { ro: "5 octombrie 2026", ru: "5 октября 2026" } as const;

const BOT = 'https://t.me/TransluxMoldova_bot';

export function termsDoc(locale: Locale): LegalDoc {
  if (locale === 'ru') {
    return {
      title: 'Условия продажи онлайн-билетов',
      intro:
        `Эти условия действуют при покупке билета на сайте ${OPERATOR.site}. Оплачивая билет, вы принимаете эти условия.`,
      sections: [
        {
          title: '1. Общие положения',
          body: [
            `Продавец и перевозчик — ${OPERATOR.name}, IDNO ${OPERATOR.idno}, работает под маркой ${OPERATOR.brand}. Мы продаём онлайн билеты на наши регулярные автобусные рейсы между Кишинёвом и севером Молдовы.`,
            'Условия составлены в соответствии с Положением об автомобильных перевозках пассажиров и багажа (Постановление Правительства № 854 от 28.07.2006), Законом № 284/2004 об электронной торговле и Законом № 105/2003 о защите прав потребителей.',
            `Мы можем обновлять эти условия; к заказу применяется редакция, действовавшая в момент оплаты. Последнее обновление: ${TERMS_UPDATED.ru}.`,
          ],
        },
        {
          title: '2. Защита персональных данных',
          body: [
            'Для заказа мы обрабатываем фамилию и имя пассажира, телефон и, если вы его указали, e-mail; а также рейс, места, сумму и статус оплаты и данные о посадке. Цель — продать и отправить билет, допустить к посадке, вернуть деньги и рассмотреть жалобу. Основание — исполнение договора перевозки и требования закона.',
            'Данные карты обрабатывает только банк maib; мы их не видим и не храним. Данные не продаются и не передаются третьим лицам для рекламы.',
          ],
        },
        {
          title: '3. Оформление и оплата заказа',
          body: [
            '- найдите рейс на главной странице и нажмите «Купить билет» у нужного рейса;',
            '- укажите фамилию, имя, телефон, при желании e-mail, количество мест (1–4);',
            '- отметьте согласие с этими условиями и политикой конфиденциальности;',
            '- оплатите на защищённой странице банка maib картой Visa или Mastercard.',
            'Цена указана в молдавских леях (MDL) и включает все сборы; комиссия за предварительную продажу не взимается. Билет считается купленным после подтверждения оплаты банком; если банк не подтвердил оплату, заказ отменяется и деньги не списываются.',
            'Билеты продаются: на рейсы с севера в Кишинёв — до отправления рейса из начального пункта; на рейсы из Кишинёва на север — не позднее чем за 2 часа до отправления с вашей остановки.',
          ],
        },
        {
          title: '4. Получение билета и поездка',
          body: [
            'Билет электронный и приходит сразу после оплаты: на странице билета (номер заказа, рейс, места, дата оплаты), а если вы указали e-mail — и на почту. На каждое место выдаётся отдельный QR-код. Ссылку на билет можно открыть в любой момент.',
            'При посадке покажите QR-код водителю. Водитель сканирует код и выдаёт кассовый чек с отметкой об онлайн-оплате (п. 28 Положения).',
            'Онлайн продаются билеты по полному тарифу. Ребёнок до 7 лет включительно без отдельного места едет бесплатно; билет для ребёнка от 7 до 10 лет со скидкой 50% покупается у водителя (п. 10 а) Положения).',
            'Ручная кладь и багаж перевозятся по Положению. Водитель может отказать в перевозке опасных предметов и багажа, мешающего другим пассажирам.',
          ],
        },
        {
          title: '5. Возврат билета',
          body: [
            'Онлайн-билет возвращается по таблице ниже; время считается до отправления автобуса с вашей остановки (пример — билет за 135 лей):',
            '- более 24 часов — полная стоимость (135 лей);',
            '- от 24 до 12 часов — 8/9 стоимости (120 лей);',
            '- от 12 до 6 часов — 7/9 стоимости (105 лей);',
            '- от 6 до 4 часов — 6/9 стоимости (90 лей);',
            '- менее 4 часов, а также при опоздании на автобус — билет не возвращается.',
            'Если рейс отменён по нашей вине, автобус отправился с опозданием более чем на 1 час или вам не предоставили место — возвращается полная стоимость, независимо от времени.',
            'Билет, по которому вы уже сели в автобус (код отсканирован), не возвращается.',
            `Заявка на возврат — в нашем боте в Telegram (${BOT}) или по телефону ${OPERATOR.phone}; укажите номер заказа или ссылку на билет. Деньги возвращаются на карту, с которой была оплата, через maib; срок зачисления зависит от банка, выпустившего карту.`,
          ],
        },
        {
          title: '6. Политика конфиденциальности',
          body: [
            'Подробно о том, какие данные мы обрабатываем, кому их передаём, сколько храним и какие у вас права, — в Политике конфиденциальности на этом сайте. Сайт использует только необходимые cookie (Политика cookie).',
          ],
        },
        {
          title: '7. Контактные данные',
          body: [
            `${OPERATOR.name}, IDNO ${OPERATOR.idno}, юридический адрес: ${OPERATOR.address}.`,
            `Телефон: ${OPERATOR.phone}. Бот в Telegram: ${BOT}. Сайт: ${OPERATOR.site}.`,
            'Жалобы принимаем по телефону и в боте; ответим в течение 30 дней. Если вы не согласны с ответом, вы можете обратиться в Агентство по защите прав потребителей и надзору за рынком (consumator.gov.md) или в суд.',
          ],
        },
      ],
    };
  }

  return {
    title: 'Condițiile de vânzare a biletelor online',
    intro:
      `Aceste condiții se aplică la cumpărarea biletului pe ${OPERATOR.site}. Plătind biletul, acceptați aceste condiții.`,
    sections: [
      {
        title: '1. Dispoziții generale',
        body: [
          `Vânzătorul și transportatorul este ${OPERATOR.name}, IDNO ${OPERATOR.idno}, care activează sub marca ${OPERATOR.brand}. Vindem online bilete la cursele noastre regulate de autobuz dintre Chișinău și nordul Moldovei.`,
          'Condițiile sunt întocmite conform Regulamentului transporturilor auto de călători și bagaje (Hotărârea Guvernului nr. 854 din 28.07.2006), Legii nr. 284/2004 privind comerțul electronic și Legii nr. 105/2003 privind protecția consumatorilor.',
          `Putem actualiza aceste condiții; comenzii i se aplică versiunea în vigoare la momentul plății. Ultima actualizare: ${TERMS_UPDATED.ro}.`,
        ],
      },
      {
        title: '2. Protecția datelor cu caracter personal',
        body: [
          'Pentru comandă prelucrăm numele și prenumele pasagerului, telefonul și, dacă l-ați lăsat, e-mailul; apoi cursa, locurile, suma și starea plății și datele urcării. Scopul: să vindem și să vă trimitem biletul, să vă admitem la urcare, să restituim banii și să soluționăm reclamațiile. Temeiul: executarea contractului de transport și obligațiile legale.',
          'Datele cardului le prelucrează doar banca maib; noi nu le vedem și nu le păstrăm. Datele nu se vând și nu se transmit terților în scop publicitar.',
        ],
      },
      {
        title: '3. Înregistrarea și achitarea comenzii',
        body: [
          '- căutați cursa pe pagina principală și apăsați «Cumpără bilet» la cursa dorită;',
          '- scrieți numele, prenumele, telefonul, dacă doriți e-mailul, și numărul de locuri (1–4);',
          '- bifați acordul cu aceste condiții și cu politica de confidențialitate;',
          '- plătiți pe pagina securizată a băncii maib, cu cardul Visa sau Mastercard.',
          'Prețul este în lei moldovenești (MDL) și include toate taxele; nu se percepe comision de vânzare preliminară. Biletul e cumpărat după ce banca confirmă plata; dacă banca nu confirmă plata, comanda se anulează și banii nu se retrag.',
          'Biletele se vând: la cursele din nord spre Chișinău — până la plecarea cursei din capătul de pornire; la cursele din Chișinău spre nord — cel târziu cu 2 ore înainte de plecarea de la oprirea dumneavoastră.',
        ],
      },
      {
        title: '4. Livrarea biletului și călătoria',
        body: [
          'Biletul e electronic și îl primiți imediat după plată: pe pagina biletului (numărul comenzii, cursa, locurile, data plății) și, dacă ați lăsat e-mailul, pe e-mail. Fiecare loc are codul QR propriu. Linkul biletului se deschide oricând.',
          'La urcare arătați codul QR șoferului. Șoferul scanează codul și eliberează bonul fiscal cu mențiunea plății online (pct. 28 din Regulament).',
          'Online se vând bilete la tarif întreg. Copilul de până la 7 ani inclusiv, fără loc separat, călătorește gratuit; biletul pentru copilul de 7–10 ani, cu reducere de 50%, se cumpără la șofer (pct. 10 lit. a) din Regulament).',
          'Bagajul de mână și bagajele se transportă conform Regulamentului. Șoferul poate refuza transportul obiectelor periculoase și al bagajelor care îi incomodează pe ceilalți pasageri.',
        ],
      },
      {
        title: '5. Dreptul la retur',
        body: [
          'Biletul online se restituie după grila de mai jos; timpul se socotește până la plecarea autobuzului de la oprirea dumneavoastră (exemplu — biletul de 135 de lei):',
          '- cu peste 24 de ore înainte — costul integral (135 lei);',
          '- între 24 și 12 ore — 8/9 din cost (120 lei);',
          '- între 12 și 6 ore — 7/9 din cost (105 lei);',
          '- între 6 și 4 ore — 6/9 din cost (90 lei);',
          '- cu mai puțin de 4 ore înainte, precum și dacă ați întârziat la autobuz — biletul nu se restituie.',
          'Dacă cursa a fost anulată din vina noastră, autobuzul a plecat cu o întârziere mai mare de o oră sau nu vi s-a acordat locul — se restituie costul integral, indiferent de timp.',
          'Biletul cu care ați urcat deja (codul a fost scanat) nu se restituie.',
          `Cererea de restituire: prin botul nostru din Telegram (${BOT}) sau la telefonul ${OPERATOR.phone}; spuneți numărul comenzii sau linkul biletului. Banii se întorc pe cardul cu care s-a plătit, prin maib; termenul în care apar pe card depinde de banca emitentă.`,
        ],
      },
      {
        title: '6. Politica de confidențialitate',
        body: [
          'Ce date prelucrăm, cui le transmitem, cât timp le păstrăm și ce drepturi aveți găsiți în detaliu în Politica de confidențialitate de pe acest site. Site-ul folosește doar cookie-uri strict necesare (Politica cookie).',
        ],
      },
      {
        title: '7. Datele de contact',
        body: [
          `${OPERATOR.name}, IDNO ${OPERATOR.idno}, adresa juridică: ${OPERATOR.address}.`,
          `Telefon: ${OPERATOR.phone}. Botul din Telegram: ${BOT}. Site: ${OPERATOR.site}.`,
          'Reclamațiile le primim la telefon și în bot; răspundem în cel mult 30 de zile. Dacă nu sunteți de acord cu răspunsul, vă puteți adresa Agenției pentru Protecția Consumatorilor și Supravegherea Pieței (consumator.gov.md) sau instanței de judecată.',
        ],
      },
    ],
  };
}
