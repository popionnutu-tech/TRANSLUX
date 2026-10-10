import 'server-only';
import { C1C } from './piese-1c-spisanie';

// Compune documentul 1C «Перемещение» — mutarea de marfă între depozite — în formatul «Конвертация
// данных 2.0». Structura e luată dintr-un document REAL exportat de contabil (10.10), nu dedusă.
//
// DE CE E DOCUMENTUL CEL MAI URGENT din cele trei: lipsa lui a produs chiar nepotrivirea semnalată la
// proba de casare. La noi marfa trecuse din Magazin în Briceni, dar mutarea nu ajungea la contabil — așa
// că piesele îi rămâneau în MAGAZIN TLX, iar casarea venea dintr-un depozit în care avea zero.
//
// ȘI MAI FACE CEVA, ce n-am bănuit până am văzut documentul: la ei mutarea nu doar deplasează marfa, ci o
// și TRECE DE PE UN CONT PE ALTUL. Recepția pune totul pe «ТоварыНаСкладах» (verificat pe două recepții
// reale, una chiar de piese); abia mutarea o duce pe «ЗапасныеЧасти». Contul nu e însă al documentului, ci
// al DEPOZITULUI — de aceea vine din `piese_warehouses.cont_1c` (migr. 408), nu scris aici în cod.

export const CONTURI_1C: Record<string, { nume: string; guid: string }> = {
  // Marfa de vânzare, pe raft în magazin. Recepțiile intră aici.
  'ТоварыНаСкладах': { nume: 'ТоварыНаСкладах', guid: '4ab73c84-982c-43b9-9d24-2b2659047000' },
  // Piese de schimb, în depozitele interne. Mutarea le aduce aici.
  'ЗапасныеЧасти': { nume: 'ЗапасныеЧасти', guid: 'a6ad6fcd-3f8f-449b-94d5-424e4af98210' },
};

export type LinieMutare = { partGuid: string; qty: number };
export type DateMutare = {
  docGuid: string;        // GUID stabil: reexportarea ACTUALIZEAZĂ documentul, nu-l dublează
  data: string;           // YYYY-MM-DD
  sursaGuid: string;
  sursaCont: string;      // numele contului 1C al depozitului de plecare
  destGuid: string;
  destCont: string;       // numele contului 1C al depozitului de sosire
  linii: LinieMutare[];
};

const esc = (s: unknown) => String(s ?? '').replace(/[<>&'"]/g, (c) => (
  { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));

function refSimpla(nr: number, guid: string): string {
  return `<Ссылка Нпп="${nr}">
	<Свойство Имя="{УникальныйИдентификатор}" Тип="Строка"><Значение>${esc(guid)}</Значение></Свойство>
	<Свойство Имя="ЭтоГруппа" Тип="Булево"><Значение>false</Значение></Свойство>
</Ссылка>`;
}
function refCont(nr: number, numeCont: string): string {
  const c = CONTURI_1C[numeCont];
  // Un cont necunoscut e o eroare de configurare, nu o lipsă de date: mai bine refuzăm aici decât să
  // trimitem un document care postează pe contul greșit.
  if (!c) throw new Error(`Cont 1C necunoscut: „${numeCont}". Verifică piese_warehouses.cont_1c.`);
  return `<Ссылка Нпп="${nr}">
	<Свойство Имя="{ИмяПредопределенногоЭлемента}" Тип="Строка"><Значение>${esc(c.nume)}</Значение></Свойство>
	<Свойство Имя="{УникальныйИдентификатор}" Тип="Строка"><Значение>${esc(c.guid)}</Значение></Свойство>
</Ссылка>`;
}

export function buildPeremXML(d: DateMutare, acum: string, reguli: string | null): string {
  let nr = 1;
  const luna = d.data.slice(0, 7);
  const [an, mm] = luna.split('-').map(Number);
  const urm = mm === 12 ? `${an + 1}-01` : `${an}-${String(mm + 1).padStart(2, '0')}`;

  const prop = (nume: string, tip: string, val: string) =>
    `\t<Свойство Имя="${nume}" Тип="${tip}"><Значение>${esc(val)}</Значение></Свойство>`;
  const propRef = (nume: string, tip: string, inner: string) =>
    `<Свойство Имя="${nume}" Тип="${tip}">${inner}</Свойство>`;
  const propGol = (nume: string, tip: string) =>
    `<Свойство Имя="${nume}" Тип="${tip}">\n\t<Пусто/>\n</Свойство>`;

  // Rândul poartă marfa pe AMBELE picioare ale înregistrării: `Дебет` e unde intră, `Кредит` e de unde
  // pleacă. Piesa e aceeași în ambele; diferă doar depozitul.
  //
  // `Сумма` PLEACĂ GOALĂ, deși prima reacție ar fi să trimitem costul nostru. Trei motive, în ordinea
  // greutății:
  //   1. În documentul lor real `Сумма` e `<Пусто/>` — 1C își calculează singur costul din propria
  //      evidență a depozitului de plecare. Ne potrivim cu ce face programul lor, nu cu ce am presupus noi.
  //   2. Costul AUTORITAR pentru contabilitate e al lui, nu al nostru.
  //   3. Și e și periculos: la noi, din lipsa stocului inițial, 2/3 din liniile de mutare au cost zero.
  //      Trimis ca atare, ar duce marfa în contabilitate la valoare zero.
  // Asta nu contrazice decizia Marianei («в перемещениях мы используем себестоимость, никакой наценки») —
  // costul se folosește, fără adaos; doar că îl pune 1C. `Ост` e la fel: e soldul CALCULAT de 1C.
  const randuri = d.linii.map((l) => `	<Запись>
${propRef('Дебет1', 'СправочникСсылка.Номенклатура', refSimpla(nr++, l.partGuid))}
${propRef('Дебет2', 'СправочникСсылка.Склады', refSimpla(nr++, d.destGuid))}
${prop('Колво', 'Число', String(l.qty))}
${propRef('Кредит1', 'СправочникСсылка.Номенклатура', refSimpla(nr++, l.partGuid))}
${propRef('Кредит2', 'СправочникСсылка.Склады', refSimpla(nr++, d.sursaGuid))}
${propGol('Ост', 'Число')}
${propGol('Сумма', 'Число')}
${propRef('Счет', 'ПланСчетовСсылка.Хозрасчетный', refCont(nr++, d.sursaCont))}
	</Запись>`).join('\n');

  const doc = `<Объект Нпп="${nr++}" Тип="ДокументСсылка.Перемещение" ИмяПравила="Перемещение"><Ссылка Нпп="${nr++}">
	<Свойство Имя="{УникальныйИдентификатор}" Тип="Строка"><Значение>${esc(d.docGuid)}</Значение></Свойство>
</Ссылка>
${prop('Дата', 'Дата', `${d.data}T00:00:00`)}
${propRef('Автор', 'СправочникСсылка.Пользователи', refSimpla(nr++, C1C.autor))}
${prop('ВидОперации', 'ПеречислениеСсылка.ВидТМЦНаПеремещение_УУ', 'Товар')}
${propRef('Дебет', 'ПланСчетовСсылка.Хозрасчетный', refCont(nr++, d.destCont))}
${propRef('Кредит', 'ПланСчетовСсылка.Хозрасчетный', refCont(nr++, d.sursaCont))}
${prop('ПометкаУдаления', 'Булево', 'false')}
${prop('ПризнакУчетаХозрасчетный', 'Булево', 'true')}
${propRef('Склад', 'СправочникСсылка.Склады', refSimpla(nr++, d.sursaGuid))}
${propRef('СкладПрих', 'СправочникСсылка.Склады', refSimpla(nr++, d.destGuid))}
${propRef('Фирма', 'СправочникСсылка.Фирмы', refSimpla(nr++, C1C.firma))}
<ТабличнаяЧасть Имя="ТабличнаяЧасть1">
${randuri}
</ТабличнаяЧасть></Объект>`;

  // Blocul de reguli nu se inventează: se păstrează exact cum l-a trimis contabilul și se pune la loc.
  return `<?xml version="1.0" encoding="UTF-8"?>
<ФайлОбмена ВерсияФормата="2.0" ДатаВыгрузки="${esc(acum)}" НачалоПериодаВыгрузки="${luna}-01T00:00:00" ОкончаниеПериодаВыгрузки="${urm}-01T00:00:00" ИмяКонфигурацииИсточника="${C1C.configuratie}" ИмяКонфигурацииПриемника="${C1C.configuratie}" ИдПравилКонвертации="${C1C.idReguli}" Комментарий="">
${reguli ?? ''}
${doc}
</ФайлОбмена>`;
}
