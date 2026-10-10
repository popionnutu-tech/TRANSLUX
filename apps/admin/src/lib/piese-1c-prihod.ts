import 'server-only';
import { C1C } from './piese-1c-spisanie';
import { CONTURI_1C } from './piese-1c-perem';

// Compune documentul 1C «ПрихНалоговаяНакладная» — recepția pe factură fiscală.
//
// Structura și, mai important, ÎNȚELESUL cifrelor sunt verificate pe un document real al contabilului din
// 10.10, care s-a dovedit a fi EXACT ACEEAȘI tranzacție pe care o avem și noi (documentul nostru 505):
// Caraus E.D., 10 bucăți de «Резинка лобового стекла-315/518.5439UWS».
//
//   la el: СумЛей 3600 · НДС 600 · Ставка20 · СуммаРозн 4500
//   la noi: 10 × 360 cost = 3600 · tva_cota 20 · 10 × 450 preț = 4500
//
// Trei lucruri se lămuresc din potrivirea asta, pe care altfel le-am fi ghicit:
//   1. Prețul pe care-l introduce Eduard e CU TVA. 3600 cu cotă 20 dă TVA 600 (3600/6), nu 720 — deci
//      3600 e suma brută, nu baza. Dacă am fi presupus invers, am fi trimis în contabilitate un TVA cu
//      20% prea mare și un cost umflat.
//   2. `СумЛей` e suma CU TVA, iar `НДС` e taxa dinăuntrul ei, nu adăugată peste.
//   3. Prețul nostru de vânzare e chiar `СуммаРозн` al lui — cele două 4500 coincid la bănuț. Deci
//      rozniţa se trimite; nu e un câmp pe care să-l lăsăm gol.
//
// Furnizorul NU se sincronizează după GUID, ca restul, ci după FISCKOD plus denumire — așa e în documentul
// lui. De aceea codul fiscal e obligatoriu la export, iar un furnizor fără el e refuzat din start.

const TVA_1C: Record<string, { nume: string; guid: string }> = {
  '20': { nume: 'Ставка20', guid: '94e3da75-b5d2-4284-a1dc-dba7c37d7093' },
};

const CONT_NDS = { nume: 'ОбязательстваПоНалогуНаДобавленнуюСтоимость', guid: '7ea0fe4d-5340-435c-88b2-90f1f4bb68aa' };
const CONT_FURNIZOR = { nume: 'СчетаОплатеВнутриСтраны', guid: 'eb491cd5-6891-47b7-a13a-6131999701d9' };
const TAXA_NDS = { nume: 'НДС', guid: 'a811a875-f525-439e-aff4-10d155f72e57' };
const TIP_PRET = { nume: 'ЗакупочнаяЦена', guid: '7d33eaa9-6039-42e0-b71d-db0ecbf98b50' };

export type LinieRecepcie = {
  partGuid: string;
  qty: number;
  sumaCuTva: number;    // qty × cost, cu TVA înăuntru — exact ce vede Eduard pe factură
  cota: number;         // cota TVA a piesei, în procente
  sumaRoznita: number;  // qty × prețul nostru de vânzare
};
export type DateRecepcie = {
  docGuid: string;
  data: string;             // YYYY-MM-DD — data facturii fiscale
  serie: string;
  numar: string;
  furnizorFiscCod: string;
  furnizorNume: string;
  depozitGuid: string;
  depozitCont: string;
  linii: LinieRecepcie[];
};

const esc = (s: unknown) => String(s ?? '').replace(/[<>&'"]/g, (c) => (
  { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
const n2 = (x: number) => (Math.round(Number(x) * 100) / 100).toFixed(2);

// TVA-ul e DINĂUNTRUL sumei: la cotă 20, din 3600 revin 600, nu 720. Verificat pe documentul lui.
export const tvaDinSuma = (sumaCuTva: number, cota: number): number =>
  Math.round((Number(sumaCuTva) * Number(cota)) / (100 + Number(cota)) * 100) / 100;

function refGuid(nr: number, guid: string, cuGrup = true): string {
  return `<Ссылка Нпп="${nr}">
	<Свойство Имя="{УникальныйИдентификатор}" Тип="Строка"><Значение>${esc(guid)}</Значение></Свойство>${cuGrup
    ? `\n\t<Свойство Имя="ЭтоГруппа" Тип="Булево"><Значение>false</Значение></Свойство>` : ''}
</Ссылка>`;
}
function refNume(nr: number, c: { nume: string; guid?: string }): string {
  return `<Ссылка Нпп="${nr}">
	<Свойство Имя="{ИмяПредопределенногоЭлемента}" Тип="Строка"><Значение>${esc(c.nume)}</Значение></Свойство>${c.guid
    ? `\n\t<Свойство Имя="{УникальныйИдентификатор}" Тип="Строка"><Значение>${esc(c.guid)}</Значение></Свойство>` : ''}
</Ссылка>`;
}

export function buildPrihodXML(d: DateRecepcie, acum: string, reguli: string | null): string {
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

  const cota1C = (cota: number) => {
    const c = TVA_1C[String(Math.round(Number(cota)))];
    // Doar cota 20 e confirmată pe un document real. Pentru oricare alta n-avem identificatorul din 1C, iar
    // o cotă greșită în contabilitate e exact felul de eroare care se descoperă la control. Mai bine
    // refuzăm și cerem GUID-ul contabilului.
    if (!c) throw new Error(`Cota TVA ${cota}% nu are încă identificator 1C. Confirmată e doar 20%; cere-i contabilului GUID-ul cotei.`);
    return c;
  };

  const tvaTotal = d.linii.reduce((s, l) => s + tvaDinSuma(l.sumaCuTva, l.cota), 0);
  const brutTotal = d.linii.reduce((s, l) => s + Number(l.sumaCuTva), 0);
  const roznTotal = d.linii.reduce((s, l) => s + Number(l.sumaRoznita), 0);

  const randuri = d.linii.map((l) => `	<Запись>
${propGol('Акциз', 'Число')}
${propGol('ВидТМЦ_УУ', 'ПеречислениеСсылка.ВидТМЦПриход_УУ')}
${propGol('Импорт', 'СправочникСсылка.Импорт')}
${prop('Количество', 'Число', String(l.qty))}
${prop('НДС', 'Число', n2(tvaDinSuma(l.sumaCuTva, l.cota)))}
${propRef('СтНДС', 'СправочникСсылка.СтавкиНДС', refNume(nr++, cota1C(l.cota)))}
${propGol('СумВал', 'Число')}
${prop('СумЛей', 'Число', n2(l.sumaCuTva))}
${prop('СуммаРозн', 'Число', n2(l.sumaRoznita))}
${propRef('СчетТМЦ', 'ПланСчетовСсылка.Хозрасчетный', refNume(nr++, CONTURI_1C[d.depozitCont]!))}
${propRef('ТМЦ1', 'СправочникСсылка.Номенклатура', refGuid(nr++, l.partGuid))}
${propRef('ТМЦ2', 'СправочникСсылка.Склады', refGuid(nr++, d.depozitGuid))}
${/* `ЕдИзм` nu se trimite: în documentul lui e o referință la clasificator după COD (459), iar noi nu
       ținem codurile alea. Lăsat afară, 1C ia unitatea de bază a piesei din propriul nomenclator — care e
       oricum cea corectă, fiindcă piesa există deja la el. */ ''}
${propGol('Цена', 'Число')}
${propGol('ЦенаРозничная', 'Число')}
	</Запись>`).join('\n');

  const doc = `<Объект Нпп="${nr++}" Тип="ДокументСсылка.ПрихНалоговаяНакладная" ИмяПравила="ПрихНалоговаяНакладная"><Ссылка Нпп="${nr++}">
	<Свойство Имя="{УникальныйИдентификатор}" Тип="Строка"><Значение>${esc(d.docGuid)}</Значение></Свойство>
</Ссылка>
${prop('Дата', 'Дата', `${d.data}T00:00:00`)}
${propRef('Автор', 'СправочникСсылка.Пользователи', refGuid(nr++, C1C.autor))}
${propRef('Валюта', 'СправочникСсылка.Валюты', refNume(nr++, { nume: 'LEI' }))}
${prop('ВидОперации', 'ПеречислениеСсылка.ВидыПриходов', 'ПриходнаяНН')}
${prop('ДатаВыписки', 'Дата', `${d.data}T00:00:00`)}
${prop('НДС_Итог', 'Число', n2(tvaTotal))}
${prop('НомерСФ', 'Строка', d.numar)}
${prop('Основание', 'Строка', 'Создан программно.')}
${prop('ПересчетАвансов', 'Булево', 'false')}
${prop('ПометкаУдаления', 'Булево', 'false')}
${prop('ПредставлениеКонтрагента', 'Строка', d.furnizorNume)}
${prop('ПризнакУчетаХозрасчетный', 'Булево', 'true')}
${prop('РежимУУ', 'Булево', 'false')}
${prop('СерияСФ', 'Строка', d.serie)}
${prop('Сторно', 'Булево', 'false')}
${prop('флПроводкаПодотч', 'Булево', 'false')}
${propRef('СубкНДС', 'СправочникСсылка.Налоги', refNume(nr++, TAXA_NDS))}
${propRef('СубкПоставщика1', 'СправочникСсылка.Контрагенты', `<Ссылка Нпп="${nr++}">
	<Свойство Имя="ФискКод" Тип="Строка"><Значение>${esc(d.furnizorFiscCod)}</Значение></Свойство>
	<Свойство Имя="Наименование" Тип="Строка"><Значение>${esc(d.furnizorNume)}</Значение></Свойство>
</Ссылка>`)}
${propGol('СубкПоставщика2', 'СправочникСсылка.Договора')}
${prop('СумЛей_Итог', 'Число', n2(brutTotal))}
${prop('СуммаДокумента', 'Число', n2(brutTotal))}
${prop('СуммаРозн_Итог', 'Число', n2(roznTotal))}
${propRef('СчетНДС', 'ПланСчетовСсылка.Хозрасчетный', refNume(nr++, CONT_NDS))}
${propRef('СчетПоставщика', 'ПланСчетовСсылка.Хозрасчетный', refNume(nr++, CONT_FURNIZOR))}
${propRef('СчетТМЦпоУм', 'ПланСчетовСсылка.Хозрасчетный', refNume(nr++, CONTURI_1C[d.depozitCont]!))}
${propRef('ТипЦен', 'СправочникСсылка.ТипыЦенНоменклатуры', refNume(nr++, TIP_PRET))}
${propRef('Фирма', 'СправочникСсылка.Фирмы', refGuid(nr++, C1C.firma, false))}
${/* `Склад` rămâne gol intenționat, ca în documentul lui: depozitul stă pe fiecare rând, în `ТМЦ2`. */ ''}
${propGol('Склад', 'СправочникСсылка.Склады')}
<ТабличнаяЧасть Имя="ТМЦ">
${randuri}
</ТабличнаяЧасть></Объект>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<ФайлОбмена ВерсияФормата="2.0" ДатаВыгрузки="${esc(acum)}" НачалоПериодаВыгрузки="${luna}-01T00:00:00" ОкончаниеПериодаВыгрузки="${urm}-01T00:00:00" ИмяКонфигурацииИсточника="${C1C.configuratie}" ИмяКонфигурацииПриемника="${C1C.configuratie}" ИдПравилКонвертации="${C1C.idReguli}" Комментарий="">
${reguli ?? ''}
${doc}
</ФайлОбмена>`;
}
