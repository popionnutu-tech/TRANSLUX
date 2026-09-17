import 'server-only';

// Compune documentul 1C `VS_СписаниеЗапчастей` în formatul de schimb „Конвертация данных 2.0".
//
// Funcție PURĂ: primește date deja citite și verificate, întoarce XML. Scrisă așa ca să poată fi probată
// fără bază — structura fișierului e partea în care o greșeală nu se vede decât în contabilitate, luni
// mai târziu.

// Constante luate din documentul-model al contabilei (15.09) și confirmate de ea pe 16.09 ca fiind mereu
// aceleași. `ВидРабот` NU se completează — «вид работ nu se foloseste».
export const C1C = {
  idReguli: 'f796ad10-b4b4-432f-9f24-d13374ddc65d',
  configuratie: 'БухгалтерияДляМолдовы',
  firma: '599e7f3a-877f-11e4-9285-70f395a1a7ca',
  autor: '10d21051-3c87-11ec-8117-2cfda1bbfecf',
  contMarfa: { nume: 'ТоварыНаСкладах', guid: '4ab73c84-982c-43b9-9d24-2b2659047000' },
  contCheltuieli: { nume: 'ПрямыеМатериальныеЗатраты', guid: 'c8c4eab8-cbc4-4a5d-a06f-2bee1b80738b' },
  cheltuieli: 'c6c274ab-880a-11e4-9285-70f395a1a7ca',
  // Lanțul de grupe-părinte al articolului de cheltuieli, exact ca în model. 1C îl ignoră dacă găsește
  // articolul după GUID; contează doar dacă nu-l găsește — atunci l-ar crea la rădăcină, nu în grupa lui.
  cheltuieliParinti: [
    'd8a9e415-ccee-11eb-8115-2cfda1bbfecf',
    '0678cd8b-cdd9-11eb-8115-2cfda1bbfecf',
    'd8a9e414-ccee-11eb-8115-2cfda1bbfecf',
  ],
  // ATENȚIE, nu e greșeală de tipar la noi: în PARTEA TABELARĂ atributul se numește „СчетАвтозачастей",
  // fără „п" — greșeala e în metadatele configurației 1C. În antet, același lucru e scris corect
  // („СчетАвтозапчастейПоУмолчанию"). Scris corect în rând, 1C nu găsește atributul și contul mărfii se
  // pierde TĂCUT. Prins comparând câmp cu câmp cu documentul-model; citind, nu s-ar fi văzut.
  atributContMarfaRand: 'СчетАвтозачастей',
} as const;

export type LinieSpisanie = {
  partGuid: string; partNume: string; qty: number; suma: number;
};
export type DateSpisanie = {
  docGuid: string;           // GUID stabil al documentului — reexportarea ACTUALIZEAZĂ, nu dublează
  data: string;              // YYYY-MM-DD
  comentariu: string;
  depozitGuid: string;
  // Mașina intră DOAR ca «вид деятельности». `ТранспортноеСредство` (ОсновныеСредства) rămâne gol —
  // așa e și în documentul-model al contabilei, iar ea a confirmat de ce: «duc evidenta ca cost».
  // Câmpul se emite oricum, gol, ca structura rândului să rămână identică cu a lor.
  masinaGuid: string | null; // ОсновныеСредства — de regulă null
  activitateGuid: string;    // ВидыДеятельности — mașina, pentru evidența pe costuri
  lacatusGuid: string | null;
  linii: LinieSpisanie[];
};

const esc = (s: unknown) => String(s ?? '').replace(/[<>&'"]/g, (c) => (
  { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
const n2 = (x: number) => (Math.round(Number(x) * 100) / 100).toFixed(2);

// `Нпп` e numărul de ordine al referinței în fișier. 1C îl folosește ca să nu repete un obiect deja
// descris; noi îl dăm crescător și nu reutilizăm — un fișier puțin mai mare, dar fără riscul ca două
// entități diferite să ajungă sub același număr.
function refSimpla(nr: number, guid: string, grup = false): string {
  return `<Ссылка Нпп="${nr}">
	<Свойство Имя="{УникальныйИдентификатор}" Тип="Строка"><Значение>${esc(guid)}</Значение></Свойство>
	<Свойство Имя="ЭтоГруппа" Тип="Булево"><Значение>${grup}</Значение></Свойство>
</Ссылка>`;
}
// Referință cu lanțul de părinți, ca în model: fiecare nivel îl conține pe următorul, iar ultimul are
// `Родитель` gol.
function refCheltuieli(next: () => number): string {
  const inner = C1C.cheltuieliParinti.reduceRight(
    (acc, guid) => `<Свойство Имя="Родитель" Тип="СправочникСсылка.Затраты"><Ссылка Нпп="${next()}">
	<Свойство Имя="{УникальныйИдентификатор}" Тип="Строка"><Значение>${guid}</Значение></Свойство>
	${acc}
	<Свойство Имя="ЭтоГруппа" Тип="Булево"><Значение>true</Значение></Свойство>
</Ссылка>
</Свойство>`,
    '<Свойство Имя="Родитель" Тип="СправочникСсылка.Затраты">\n\t<Пусто/>\n</Свойство>');
  return `<Ссылка Нпп="${next()}">
	<Свойство Имя="{УникальныйИдентификатор}" Тип="Строка"><Значение>${C1C.cheltuieli}</Значение></Свойство>
	${inner}
	<Свойство Имя="ЭтоГруппа" Тип="Булево"><Значение>false</Значение></Свойство>
</Ссылка>`;
}
function refCont(nr: number, c: { nume: string; guid: string }): string {
  return `<Ссылка Нпп="${nr}">
	<Свойство Имя="{ИмяПредопределенногоЭлемента}" Тип="Строка"><Значение>${esc(c.nume)}</Значение></Свойство>
	<Свойство Имя="{УникальныйИдентификатор}" Тип="Строка"><Значение>${esc(c.guid)}</Значение></Свойство>
</Ссылка>`;
}

export function buildSpisanieXML(d: DateSpisanie, acum: string, reguli: string | null): string {
  let nr = 1;
  const luna = d.data.slice(0, 7);
  const inceput = `${luna}-01T00:00:00`;
  // Sfârșitul perioadei în modelul contabilei e ÎNCEPUTUL lunii următoare, nu ultima zi.
  const [an, mm] = luna.split('-').map(Number);
  const urm = mm === 12 ? `${an + 1}-01` : `${an}-${String(mm + 1).padStart(2, '0')}`;

  const prop = (nume: string, tip: string, val: string) =>
    `\t<Свойство Имя="${nume}" Тип="${tip}"><Значение>${esc(val)}</Значение></Свойство>`;
  const propRef = (nume: string, tip: string, inner: string) =>
    `<Свойство Имя="${nume}" Тип="${tip}">${inner}</Свойство>`;
  const propGol = (nume: string, tip: string) =>
    `<Свойство Имя="${nume}" Тип="${tip}">\n\t<Пусто/>\n</Свойство>`;

  const randuri = d.linii.map((l) => `	<Запись>
${propRef('Запчасть', 'СправочникСсылка.Номенклатура', refSimpla(nr++, l.partGuid))}
${propRef('Склад', 'СправочникСсылка.Склады', refSimpla(nr++, d.depozitGuid))}
${propRef('СчетЗатрат', 'ПланСчетовСсылка.Хозрасчетный', refCont(nr++, C1C.contCheltuieli))}
${propRef('Затраты', 'СправочникСсылка.Затраты', refCheltuieli(() => nr++))}
${propRef('ВидыДеятельности', 'СправочникСсылка.ВидыДеятельности', refSimpla(nr++, d.activitateGuid))}
${prop('Количество', 'Число', String(l.qty))}
${propRef(C1C.atributContMarfaRand, 'ПланСчетовСсылка.Хозрасчетный', refCont(nr++, C1C.contMarfa))}
${d.masinaGuid
  ? propRef('ТранспортноеСредство', 'СправочникСсылка.ОсновныеСредства', refSimpla(nr++, d.masinaGuid))
  : propGol('ТранспортноеСредство', 'СправочникСсылка.ОсновныеСредства')}
${prop('Сумма', 'Число', n2(l.suma))}
${prop('РучнаяКорректировка', 'Булево', 'false')}
${d.lacatusGuid
  ? propRef('Слесарь', 'СправочникСсылка.Сотрудники', refSimpla(nr++, d.lacatusGuid))
  : propGol('Слесарь', 'СправочникСсылка.Сотрудники')}
${propGol('ВидРабот', 'СправочникСсылка.Номенклатура')}
	</Запись>`).join('\n');

  const doc = `<Объект Нпп="${nr++}" Тип="ДокументСсылка.VS_СписаниеЗапчастей" ИмяПравила="VS_СписаниеЗапчастей"><Ссылка Нпп="${nr++}">
	<Свойство Имя="{УникальныйИдентификатор}" Тип="Строка"><Значение>${esc(d.docGuid)}</Значение></Свойство>
</Ссылка>
${propRef('Автор', 'СправочникСсылка.Пользователи', refSimpla(nr++, C1C.autor))}
${prop('Дата', 'Дата', `${d.data}T00:00:00`)}
${prop('ПометкаУдаления', 'Булево', 'false')}
${propRef('Фирма', 'СправочникСсылка.Фирмы', refSimpla(nr++, C1C.firma))}
${prop('Комментарий', 'Строка', d.comentariu)}
${propRef('СчетАвтозапчастейПоУмолчанию', 'ПланСчетовСсылка.Хозрасчетный', refCont(nr++, C1C.contMarfa))}
${propRef('СчетЗатратПоУмолчанию', 'ПланСчетовСсылка.Хозрасчетный', refCont(nr++, C1C.contCheltuieli))}
${propRef('ЗатратыПоУмолчанию', 'СправочникСсылка.Затраты', refCheltuieli(() => nr++))}
${propRef('ВидДеятельностиПоУмолчанию', 'СправочникСсылка.ВидыДеятельности', refSimpla(nr++, d.activitateGuid))}
${prop('СозданИзУТ', 'Булево', 'false')}
${propGol('ПредседательКомиссии', 'СправочникСсылка.Сотрудники')}
${propGol('ОтветственныйПолучил', 'СправочникСсылка.Сотрудники')}
${propRef('Склад', 'СправочникСсылка.Склады', refSimpla(nr++, d.depozitGuid))}
<ТабличнаяЧасть Имя="Автозапчасти">
${randuri}
</ТабличнаяЧасть></Объект>`;

  // Blocul de reguli: în modelul contabilei ocupă 66% din fișier. Nu-l inventăm — se păstrează exact cum
  // l-a trimis ea și se pune la loc. Dacă lipsește, fișierul rămâne valid ca structură, dar 1C ar putea
  // refuza importul; de aceea `reguli` e obligatoriu în practică, chiar dacă opțional ca tip.
  return `<?xml version="1.0" encoding="UTF-8"?>
<ФайлОбмена ВерсияФормата="2.0" ДатаВыгрузки="${esc(acum)}" НачалоПериодаВыгрузки="${inceput}" ОкончаниеПериодаВыгрузки="${urm}-01T00:00:00" ИмяКонфигурацииИсточника="${C1C.configuratie}" ИмяКонфигурацииПриемника="${C1C.configuratie}" ИдПравилКонвертации="${C1C.idReguli}" Комментарий="">
${reguli ?? ''}
${doc}
</ФайлОбмена>`;
}
