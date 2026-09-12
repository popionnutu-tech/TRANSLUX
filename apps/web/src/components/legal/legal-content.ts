import type { Locale } from '@/lib/i18n';

/**
 * Textele juridice ale site-ului public translux.md — politica de
 * confidențialitate și politica cookie, RO + RU, conform Legii nr. 195/2024
 * privind protecția datelor cu caracter personal (în vigoare din 23.08.2026).
 *
 * Datele operatorului stau într-un singur loc, mai jos. Dacă se schimbă
 * sediul, IDNO-ul sau adresa de contact, se corectează AICI, nu în texte.
 */
export const OPERATOR = {
  name: 'TRANSLUX S.R.L.',
  /** IDNO — se completează când e confirmat; gol = nu se afișează. */
  idno: '',
  address: 'mun. Edineț, Republica Moldova',
  phone: '+373 60 40 10 10',
  phoneHref: 'tel:+37360401010',
  email: 'admin@translux.md',
  site: 'translux.md',
} as const;

export const LAST_UPDATED = { ro: '12 septembrie 2026', ru: '12 сентября 2026' } as const;

export interface LegalSection {
  title: string;
  /** Paragrafe; un element care începe cu «- » devine listă. */
  body: string[];
}

export interface LegalDoc {
  title: string;
  intro: string;
  sections: LegalSection[];
}

const operatorLine = (locale: Locale) => {
  const idno = OPERATOR.idno ? (locale === 'ru' ? `, IDNO ${OPERATOR.idno}` : `, IDNO ${OPERATOR.idno}`) : '';
  return `${OPERATOR.name}${idno}, ${OPERATOR.address}`;
};

export function privacyDoc(locale: Locale): LegalDoc {
  if (locale === 'ru') {
    return {
      title: 'Политика конфиденциальности',
      intro:
        `Настоящая политика объясняет, какие персональные данные обрабатывает ${OPERATOR.name} («мы»), с какой целью и какие права у вас есть. Она составлена в соответствии с Законом Республики Молдова № 195/2024 о защите персональных данных.`,
      sections: [
        {
          title: '1. Оператор данных',
          body: [
            `Оператор: ${operatorLine('ru')}.`,
            `Телефон: ${OPERATOR.phone}. Электронная почта: ${OPERATOR.email}.`,
            'По любому вопросу о ваших данных пишите или звоните нам — ответим не позднее одного месяца.',
          ],
        },
        {
          title: '2. Какие данные мы обрабатываем и зачем',
          body: [
            'Посетители сайта translux.md. При просмотре страниц мы сохраняем адрес страницы, страну (определяется по IP-адресу; сам IP-адрес не сохраняется), тип устройства (телефон, планшет, компьютер) и сайт, с которого вы пришли. Эти данные не содержат идентификаторов, не связываются с cookie и не позволяют узнать вас. Цель — понимать, какие маршруты интересуют пассажиров. Основание — законный интерес.',
            'Кнопка «Позвонить» в результатах поиска. Мы фиксируем маршрут и номер водителя, по которому позвонили, чтобы знать, какие рейсы востребованы. Ваш собственный номер телефона сайт не получает.',
            `Звонки в колл-центр ${OPERATOR.phone}. На звонки отвечает автоматический голосовой ассистент (искусственный интеллект). Обрабатываются: ваш номер телефона, запись и расшифровка разговора, содержание обращения (расписание, жалоба, забытая вещь, просьба перезвонить) и имя, если вы его называете. Жалобы и сообщения о забытых вещах передаются диспетчерам и, при необходимости, водителю рейса — без вашего номера телефона. Основание — исполнение обязательств перевозчика, законный интерес в качестве обслуживания и, для записи разговора, ваше согласие, о котором ассистент предупреждает в начале звонка.`,
            'Портал «Verificare» для партнёров и водителей. Обрабатываются данные входа и cookie сессии (30 дней). Основание — договорные отношения с партнёром.',
            'Ссылки на Facebook и TikTok ведут на внешние сайты. Мы не загружаем на translux.md их скрипты и пиксели; их политики применяются только после перехода.',
          ],
        },
        {
          title: '3. Кому передаются данные',
          body: [
            'Мы используем поставщиков, которые обрабатывают данные по нашему поручению и по договору:',
            '- Vercel Inc. (США/ЕС) — хостинг сайта;',
            '- Supabase Inc. (ЕС) — база данных;',
            '- ElevenLabs Inc. (США) — телефония и голосовой ассистент;',
            '- поставщики языковых моделей (например, Anthropic PBC, США) — понимание речи ассистентом;',
            '- Telegram — внутренние группы диспетчеров и водителей.',
            'Часть этих поставщиков находится за пределами Республики Молдова (ЕС, США). Передача происходит на основании договорных гарантий защиты данных, предусмотренных Законом № 195/2024. Данные не продаются и не передаются третьим лицам в рекламных целях. Государственным органам данные передаются только по законному требованию.',
          ],
        },
        {
          title: '4. Сколько хранятся данные',
          body: [
            '- статистика посещений — в агрегированном виде, без идентификаторов;',
            '- записи и расшифровки звонков — пока это нужно для решения обращения и контроля качества ассистента, после чего удаляются или обезличиваются;',
            '- жалобы и сообщения о забытых вещах — до закрытия дела и в течение срока, установленного законодательством о перевозках и бухгалтерском учёте;',
            '- данные партнёров — на срок действия договора.',
          ],
        },
        {
          title: '5. Ваши права',
          body: [
            'В соответствии с Законом № 195/2024 вы имеете право: получить доступ к своим данным; исправить неточные данные; потребовать удаления; ограничить обработку; получить данные в переносимом формате; возразить против обработки, основанной на законном интересе; отозвать согласие в любой момент (это не влияет на законность обработки до отзыва).',
            `Для этого свяжитесь с нами: ${OPERATOR.email}, ${OPERATOR.phone}. Мы можем попросить подтвердить личность, чтобы не выдать данные постороннему.`,
            'Если вы считаете, что ваши права нарушены, вы можете подать жалобу в Национальный центр по защите персональных данных Республики Молдова (CNPDCP): datepersonale.md.',
          ],
        },
        {
          title: '6. Cookie',
          body: [
            'Сайт использует только строго необходимые cookie. Подробности — в Политике cookie.',
          ],
        },
        {
          title: '7. Изменения',
          body: [
            `Мы можем обновлять эту политику; актуальная версия всегда опубликована на этой странице с датой обновления. Последнее обновление: ${LAST_UPDATED.ru}.`,
          ],
        },
      ],
    };
  }

  return {
    title: 'Politica de confidențialitate',
    intro:
      `Această politică explică ce date cu caracter personal prelucrează ${OPERATOR.name} («noi»), în ce scop și ce drepturi aveți. Este întocmită conform Legii Republicii Moldova nr. 195/2024 privind protecția datelor cu caracter personal.`,
    sections: [
      {
        title: '1. Operatorul de date',
        body: [
          `Operator: ${operatorLine('ro')}.`,
          `Telefon: ${OPERATOR.phone}. E-mail: ${OPERATOR.email}.`,
          'Pentru orice întrebare despre datele dumneavoastră scrieți-ne sau sunați — răspundem în cel mult o lună.',
        ],
      },
      {
        title: '2. Ce date prelucrăm și de ce',
        body: [
          'Vizitatorii site-ului translux.md. La vizitarea paginilor reținem adresa paginii, țara (dedusă din adresa IP; adresa IP nu se stochează), tipul dispozitivului (telefon, tabletă, calculator) și site-ul de pe care ați venit. Aceste date nu conțin identificatori, nu sunt legate de cookie-uri și nu permit recunoașterea dumneavoastră. Scopul: să înțelegem ce rute interesează pasagerii. Temei: interesul legitim.',
          'Butonul «Sună» din rezultatele căutării. Reținem ruta și numărul șoferului apelat, ca să știm ce curse sunt căutate. Numărul dumneavoastră de telefon nu ajunge la site.',
          `Apelurile la call-center ${OPERATOR.phone}. La apeluri răspunde un asistent vocal automat (inteligență artificială). Se prelucrează: numărul de telefon, înregistrarea și transcrierea convorbirii, conținutul solicitării (orar, reclamație, obiect uitat, cerere de reapelare) și numele, dacă îl comunicați. Reclamațiile și obiectele uitate se transmit dispecerilor și, la nevoie, șoferului cursei — fără numărul dumneavoastră de telefon. Temei: executarea obligațiilor de transportator, interesul legitim în calitatea deservirii și, pentru înregistrarea convorbirii, consimțământul dumneavoastră, anunțat de asistent la începutul apelului.`,
          'Portalul «Verificare» pentru parteneri și șoferi. Se prelucrează datele de autentificare și un cookie de sesiune (30 de zile). Temei: relația contractuală cu partenerul.',
          'Linkurile către Facebook și TikTok duc pe site-uri externe. Nu încărcăm pe translux.md scripturile sau pixelii acestora; politicile lor se aplică doar după ce le accesați.',
        ],
      },
      {
        title: '3. Cui transmitem datele',
        body: [
          'Folosim furnizori care prelucrează datele în numele nostru, pe bază de contract:',
          '- Vercel Inc. (SUA/UE) — găzduirea site-ului;',
          '- Supabase Inc. (UE) — baza de date;',
          '- ElevenLabs Inc. (SUA) — telefonia și asistentul vocal;',
          '- furnizori de modele lingvistice (de ex. Anthropic PBC, SUA) — înțelegerea vorbirii de către asistent;',
          '- Telegram — grupurile interne ale dispecerilor și șoferilor.',
          'O parte din acești furnizori se află în afara Republicii Moldova (UE, SUA). Transferul are loc pe baza garanțiilor contractuale de protecție a datelor prevăzute de Legea nr. 195/2024. Datele nu se vând și nu se transmit terților în scop publicitar. Autorităților publice le transmitem date doar la cerere legală.',
        ],
      },
      {
        title: '4. Cât timp păstrăm datele',
        body: [
          '- statistica vizitelor — agregat, fără identificatori;',
          '- înregistrările și transcrierile apelurilor — cât este necesar soluționării solicitării și controlului calității asistentului, după care se șterg sau se anonimizează;',
          '- reclamațiile și obiectele uitate — până la închiderea dosarului și pe termenul cerut de legislația transporturilor și de cea contabilă;',
          '- datele partenerilor — pe durata contractului.',
        ],
      },
      {
        title: '5. Drepturile dumneavoastră',
        body: [
          'Conform Legii nr. 195/2024 aveți dreptul: de acces la datele dumneavoastră; de rectificare a datelor inexacte; de ștergere; de restricționare a prelucrării; de portabilitate; de opoziție față de prelucrarea bazată pe interes legitim; de a vă retrage consimțământul oricând (fără a afecta legalitatea prelucrării de până atunci).',
          `Pentru exercitarea drepturilor ne contactați la ${OPERATOR.email} sau ${OPERATOR.phone}. Putem cere confirmarea identității, ca să nu dăm date unei persoane străine.`,
          'Dacă considerați că drepturile v-au fost încălcate, puteți depune o plângere la Centrul Național pentru Protecția Datelor cu Caracter Personal (CNPDCP): datepersonale.md.',
        ],
      },
      {
        title: '6. Cookie-uri',
        body: ['Site-ul folosește doar cookie-uri strict necesare. Detalii în Politica cookie.'],
      },
      {
        title: '7. Modificări',
        body: [
          `Putem actualiza această politică; versiunea curentă este publicată mereu pe această pagină, cu data actualizării. Ultima actualizare: ${LAST_UPDATED.ro}.`,
        ],
      },
    ],
  };
}

export function cookiesDoc(locale: Locale): LegalDoc {
  if (locale === 'ru') {
    return {
      title: 'Политика cookie',
      intro:
        'Cookie — небольшие файлы, которые сайт сохраняет в браузере. Сайт translux.md использует только строго необходимые cookie: без них сайт не мог бы работать так, как вы ожидаете. Согласие на них не требуется, но мы обязаны о них рассказать.',
      sections: [
        {
          title: '1. Какие cookie мы используем',
          body: [
            '- translux_consent — запоминает, что вы видели уведомление о cookie. Срок: 12 месяцев. Ставится сайтом translux.md.',
            '- translux-verificare — cookie сессии портала «Verificare» для партнёров и водителей; ставится только после входа на /verificare. Срок: 30 дней. Недоступен скриптам (httpOnly).',
          ],
        },
        {
          title: '2. Чего мы не используем',
          body: [
            'На translux.md нет рекламных и отслеживающих cookie, нет пикселей Facebook, TikTok или Google Analytics, нет сторонних скриптов. Шрифты размещены на нашем сервере и не запрашиваются у Google.',
            'Статистика посещений (страница, страна, тип устройства, источник) собирается без cookie и без идентификаторов — подробнее в Политике конфиденциальности.',
          ],
        },
        {
          title: '3. Как управлять cookie',
          body: [
            'Вы можете удалить или заблокировать cookie в настройках браузера. Если заблокировать translux_consent, уведомление будет показываться при каждом визите; если заблокировать translux-verificare, вход в портал партнёров будет невозможен.',
            `Вопросы: ${OPERATOR.email}. Последнее обновление: ${LAST_UPDATED.ru}.`,
          ],
        },
      ],
    };
  }

  return {
    title: 'Politica cookie',
    intro:
      'Cookie-urile sunt fișiere mici pe care site-ul le păstrează în browser. Site-ul translux.md folosește doar cookie-uri strict necesare: fără ele site-ul nu ar funcționa așa cum vă așteptați. Pentru acestea nu se cere consimțământ, dar avem obligația să vă informăm.',
    sections: [
      {
        title: '1. Ce cookie-uri folosim',
        body: [
          '- translux_consent — reține că ați văzut notificarea despre cookie-uri. Durată: 12 luni. Setat de translux.md.',
          '- translux-verificare — cookie-ul de sesiune al portalului «Verificare» pentru parteneri și șoferi; se setează doar după autentificarea pe /verificare. Durată: 30 de zile. Inaccesibil scripturilor (httpOnly).',
        ],
      },
      {
        title: '2. Ce nu folosim',
        body: [
          'Pe translux.md nu există cookie-uri de publicitate sau de urmărire, pixeli Facebook, TikTok ori Google Analytics, nici scripturi ale terților. Fonturile sunt găzduite pe serverul nostru și nu se cer de la Google.',
          'Statistica vizitelor (pagină, țară, tip de dispozitiv, sursă) se adună fără cookie-uri și fără identificatori — detalii în Politica de confidențialitate.',
        ],
      },
      {
        title: '3. Cum controlați cookie-urile',
        body: [
          'Puteți șterge sau bloca cookie-urile din setările browserului. Dacă blocați translux_consent, notificarea va apărea la fiecare vizită; dacă blocați translux-verificare, autentificarea în portalul partenerilor nu va funcționa.',
          `Întrebări: ${OPERATOR.email}. Ultima actualizare: ${LAST_UPDATED.ro}.`,
        ],
      },
    ],
  };
}
