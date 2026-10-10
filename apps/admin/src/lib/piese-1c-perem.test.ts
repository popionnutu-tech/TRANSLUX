import { describe, it, expect } from 'vitest';
import { buildPeremXML } from './piese-1c-perem';

// Verificările se măsoară față de un document «Перемещение» REAL, exportat de contabil pe 10.10 (mutare de
// piese din 24.06, Magazin piese → Bălți). Valorile de mai jos sunt citite din el, nu alese de noi.

const date = {
  docGuid: '11111111-2222-3333-4444-555555555555',
  data: '2026-10-09',
  sursaGuid: 'ce43ec8b-8ed7-11ea-80ea-2cfda1bbfecf', sursaCont: 'ТоварыНаСкладах',
  destGuid: '2c833e9f-4def-11ec-8118-2cfda1bbfecf', destCont: 'ЗапасныеЧасти',
  linii: [{ partGuid: 'e03f085c-7d5c-11ed-812a-2cfda1bbfecf', qty: 2 },
          { partGuid: 'aaaaaaaa-7d5c-11ed-812a-2cfda1bbfecf', qty: 0.5 }],
};
const xml = buildPeremXML(date, '2026-10-10T15:00:00', null);

describe('Перемещение pentru 1C', () => {
  it('poartă tipul și regula de conversie exacte', () => {
    expect(xml).toContain('Тип="ДокументСсылка.Перемещение" ИмяПравила="Перемещение"');
    expect(xml).toContain('ВерсияФормата="2.0"');
  });

  it('pune depozitul de plecare pe Склад și pe cel de sosire pe СкладПрих', () => {
    const iSursa = xml.indexOf('Имя="Склад"');
    const iDest = xml.indexOf('Имя="СкладПрих"');
    expect(iSursa).toBeGreaterThan(0);
    expect(xml.slice(iSursa, iDest)).toContain(date.sursaGuid);
    expect(xml.slice(iDest, iDest + 400)).toContain(date.destGuid);
  });

  // Miezul documentului: contul se SCHIMBĂ. Debitul e contul depozitului de sosire, creditul e al celui de
  // plecare. Inversarea lor ar posta marfa pe contul greșit fără să dea nicio eroare la import.
  it('debitează contul destinației și creditează contul sursei', () => {
    const deb = xml.slice(xml.indexOf('Имя="Дебет"'), xml.indexOf('Имя="Кредит"'));
    expect(deb).toContain('ЗапасныеЧасти');
    expect(deb).toContain('a6ad6fcd-3f8f-449b-94d5-424e4af98210');
    const cred = xml.slice(xml.indexOf('Имя="Кредит"'), xml.indexOf('Имя="ПометкаУдаления"'));
    expect(cred).toContain('ТоварыНаСкладах');
    expect(cred).toContain('4ab73c84-982c-43b9-9d24-2b2659047000');
  });

  it('pune fiecare piesă pe ambele picioare ale rândului, cu depozitele inversate', () => {
    const r = xml.slice(xml.indexOf('<Запись>'), xml.indexOf('</Запись>'));
    const deb1 = r.slice(r.indexOf('Имя="Дебет1"'), r.indexOf('Имя="Дебет2"'));
    const deb2 = r.slice(r.indexOf('Имя="Дебет2"'), r.indexOf('Имя="Колво"'));
    const cred2 = r.slice(r.indexOf('Имя="Кредит2"'), r.indexOf('Имя="Ост"'));
    expect(deb1).toContain(date.linii[0].partGuid);
    expect(deb2).toContain(date.destGuid);     // intră la destinație
    expect(cred2).toContain(date.sursaGuid);   // pleacă din sursă
  });

  // Cantitățile fracționare sunt reale: Eduard toarnă jumătăți de litru. Dacă s-ar rotunji la întreg,
  // 0,5 l ar pleca în contabilitate ca 0 sau ca 1.
  it('nu rotunjește cantitățile', () => {
    expect(xml).toContain('<Значение>0.5</Значение>');
  });

  // `Сумма` și `Ост` pleacă GOALE, exact ca în documentul lor: costul îl calculează 1C din evidența
  // depozitului de plecare. La noi, până la încărcarea stocului inițial, 2 din 3 linii au cost zero —
  // trimise ca atare, ar duce marfa în contabilitate la valoare zero.
  it('nu trimite nici suma, nici soldul', () => {
    const r = xml.slice(xml.indexOf('<Запись>'), xml.indexOf('</Запись>'));
    expect(r).toMatch(/Имя="Сумма" Тип="Число">\s*<Пусто\/>/);
    expect(r).toMatch(/Имя="Ост" Тип="Число">\s*<Пусто\/>/);
    expect(r).not.toContain('СуммаРозн');
  });

  it('refuză un cont neconfigurat în loc să ghicească', () => {
    expect(() => buildPeremXML({ ...date, destCont: 'Склад42' }, '2026-10-10T15:00:00', null))
      .toThrow(/Cont 1C necunoscut/);
  });

  it('păstrează blocul de reguli al contabilei neatins', () => {
    const cu = buildPeremXML(date, '2026-10-10T15:00:00', '<ПравилаКонвертации>X</ПравилаКонвертации>');
    expect(cu).toContain('<ПравилаКонвертации>X</ПравилаКонвертации>');
  });
});
