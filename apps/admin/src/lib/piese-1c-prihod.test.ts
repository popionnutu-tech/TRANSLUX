import { describe, it, expect } from 'vitest';
import { buildPrihodXML, tvaDinSuma } from './piese-1c-prihod';

// Cifrele de aici sunt CELE REALE din documentul contabilului din 10.10, care e aceeași tranzacție cu
// recepția noastră 505: Caraus E.D., INC 88201, 01.10.2026, 10 bucăți, 3600 cu TVA 600, rozniță 4500.
const date = {
  docGuid: '11111111-2222-3333-4444-555555555555',
  data: '2026-10-01',
  serie: 'INC', numar: '88201',
  furnizorFiscCod: '1003600096513', furnizorNume: 'Caraus E.D. SRL',
  depozitGuid: 'ce43ec8b-8ed7-11ea-80ea-2cfda1bbfecf', depozitCont: 'ТоварыНаСкладах',
  linii: [{ partGuid: '817437b5-97c3-11f0-8160-2cfda1bbfecf', qty: 10,
            sumaCuTva: 3600, cota: 20, sumaRoznita: 4500 }],
};
const xml = buildPrihodXML(date, '2026-10-10T15:00:00', null);

describe('ПрихНалоговаяНакладная pentru 1C', () => {
  // Miezul: TVA-ul e DINĂUNTRU. 3600 la cotă 20 dă 600, nu 720. Dacă s-ar aplica peste, am trimite în
  // contabilitate un TVA cu 20% mai mare și un cost umflat — exact ce confirmă documentul lui că nu e așa.
  it('scoate TVA-ul din sumă, nu îl adaugă peste', () => {
    expect(tvaDinSuma(3600, 20)).toBe(600);
    expect(tvaDinSuma(100, 20)).toBe(16.67);
    expect(tvaDinSuma(0, 20)).toBe(0);
  });

  it('reproduce exact cifrele documentului contabilului', () => {
    expect(xml).toContain('Имя="СумЛей" Тип="Число"><Значение>3600.00');
    expect(xml).toContain('Имя="НДС" Тип="Число"><Значение>600.00');
    expect(xml).toContain('Имя="СуммаРозн" Тип="Число"><Значение>4500.00');
    expect(xml).toContain('Имя="СуммаДокумента" Тип="Число"><Значение>3600.00');
    expect(xml).toContain('Имя="НДС_Итог" Тип="Число"><Значение>600.00');
    expect(xml).toContain('Имя="СуммаРозн_Итог" Тип="Число"><Значение>4500.00');
    expect(xml).toContain('Ставка20');
  });

  it('poartă tipul, operațiunea și factura fiscală', () => {
    expect(xml).toContain('Тип="ДокументСсылка.ПрихНалоговаяНакладная" ИмяПравила="ПрихНалоговаяНакладная"');
    expect(xml).toContain('<Значение>ПриходнаяНН</Значение>');
    expect(xml).toContain('Имя="СерияСФ" Тип="Строка"><Значение>INC');
    expect(xml).toContain('Имя="НомерСФ" Тип="Строка"><Значение>88201');
    expect(xml).toContain('Имя="ДатаВыписки" Тип="Дата"><Значение>2026-10-01T00:00:00');
  });

  // Furnizorul NU se caută după GUID ca restul catalogelor, ci după cod fiscal plus denumire. Dacă s-ar
  // trimite cu GUID, 1C i-ar crea contabilului un contragent nou în loc să-l recunoască pe cel existent.
  it('identifică furnizorul după cod fiscal, nu după GUID', () => {
    const blk = xml.slice(xml.indexOf('Имя="СубкПоставщика1"'), xml.indexOf('Имя="СубкПоставщика2"'));
    expect(blk).toContain('ФискКод');
    expect(blk).toContain('1003600096513');
    expect(blk).toContain('Caraus E.D. SRL');
    expect(blk).not.toContain('УникальныйИдентификатор');
  });

  it('pune depozitul pe rând, iar pe cap îl lasă gol — ca în documentul lui', () => {
    const r = xml.slice(xml.indexOf('<Запись>'), xml.indexOf('</Запись>'));
    expect(r.slice(r.indexOf('Имя="ТМЦ2"'))).toContain(date.depozitGuid);
    expect(xml).toMatch(/Имя="Склад" Тип="СправочникСсылка\.Склады">\s*<Пусто\/>/);
  });

  it('pune marfa pe contul depozitului', () => {
    expect(xml).toContain('ТоварыНаСкладах');
    expect(xml).toContain('4ab73c84-982c-43b9-9d24-2b2659047000');
  });

  // O cotă pe care n-am confirmat-o pe un document real n-are identificator în 1C. O cotă greșită în
  // contabilitate e genul de eroare care se descoperă la control, deci refuzăm în loc să ghicim.
  it('refuză o cotă TVA necunoscută în loc să ghicească', () => {
    expect(() => buildPrihodXML({ ...date, linii: [{ ...date.linii[0], cota: 8 }] }, 'x', null))
      .toThrow(/Cota TVA 8%/);
  });

  it('însumează corect mai multe rânduri', () => {
    const x = buildPrihodXML({ ...date, linii: [
      { ...date.linii[0], sumaCuTva: 1200, sumaRoznita: 1500 },
      { ...date.linii[0], sumaCuTva: 2400, sumaRoznita: 3000 },
    ] }, 'x', null);
    expect(x).toContain('Имя="СумЛей_Итог" Тип="Число"><Значение>3600.00');
    expect(x).toContain('Имя="НДС_Итог" Тип="Число"><Значение>600.00');
    expect(x).toContain('Имя="СуммаРозн_Итог" Тип="Число"><Значение>4500.00');
  });
});
