import { describe, it, expect } from 'vitest';
import { zonaPerechii, zoneBalti, pairNorm, stopNorm, sumPairs, type ZoneBalti } from './grupare';

// Tariful 1 (Criva – Chișinău) și tariful 7 (Otaci + Briceni – Chișinău, două trasee cu km diferiți în același tarif).
const stops = [
  { tariff_id: 1, name_ro: 'Criva', km_from_start: '3.50', district: 'briceni' },
  { tariff_id: 1, name_ro: 'Briceni', km_from_start: '44.50', district: 'briceni' },
  { tariff_id: 1, name_ro: 'Lopatnic', km_from_start: '33.00', district: 'edinet' },
  { tariff_id: 1, name_ro: 'Edineț', km_from_start: '78.50', district: 'edinet' },
  { tariff_id: 1, name_ro: 'Cupcini', km_from_start: '85.10', district: 'edinet' },
  { tariff_id: 1, name_ro: 'Corlăteni', km_from_start: '135.10', district: 'riscani' },
  { tariff_id: 1, name_ro: 'Intersecția Pelenia', km_from_start: '130.20', district: 'drochia' },
  { tariff_id: 1, name_ro: 'Hlinaia', km_from_start: '66.70' },
  { tariff_id: 1, name_ro: 'Bălți', km_from_start: '148.50' },
  { tariff_id: 1, name_ro: 'Bilicenii Noi', km_from_start: '158.20' },
  { tariff_id: 1, name_ro: 'Bilicenii Vechi', km_from_start: '163.10' },
  { tariff_id: 1, name_ro: 'Sîngerei', km_from_start: '174.70' },
  { tariff_id: 1, name_ro: 'Orhei', km_from_start: '234.50' },
  { tariff_id: 1, name_ro: 'Chișinău', km_from_start: '282.50' },
  { tariff_id: 7, name_ro: 'Otaci', km_from_start: '0.00', district: 'ocnita' },
  { tariff_id: 7, name_ro: 'Ocnița', km_from_start: '47.00', district: 'ocnita' },
  { tariff_id: 7, name_ro: 'Bălți', km_from_start: '154.00' },
  { tariff_id: 7, name_ro: 'Bălți', km_from_start: '133.00' },
  { tariff_id: 7, name_ro: 'Bilicenii Vechi', km_from_start: '147.60' },
  { tariff_id: 7, name_ro: 'Chișinău', km_from_start: '287.00' },
  { tariff_id: 7, name_ro: 'Chișinău', km_from_start: '266.00' },
  // tarif fără Chișinău: nu contează
  { tariff_id: 9, name_ro: 'Bălți', km_from_start: '0.00' },
  { tariff_id: 9, name_ro: 'Glodeni', km_from_start: '30.00' },
  // tarif cu Chișinău la km 0 (sens invers)
  { tariff_id: 10, name_ro: 'Chișinău', km_from_start: '0.00' },
  { tariff_id: 10, name_ro: 'Bălți', km_from_start: '134.00' },
  { tariff_id: 10, name_ro: 'Rîșcani', km_from_start: '176.00', district: 'riscani' },
];

describe('normalizare', () => {
  it('fără diacritice, fără GA, ordonat', () => {
    expect(stopNorm('Halahora de Sus')).toBe('halahora de sus');
    expect(stopNorm('Grinăuți-Raia')).toBe('grinauti raia');
    expect(stopNorm('GA Chișinău')).toBe('chisinau');
    expect(pairNorm('Balti - Chisinau')).toBe(pairNorm('Chisinau - Balti'));
  });
});

describe('zoneBalti', () => {
  const z: ZoneBalti = zoneBalti(stops);
  it('intre = între Chișinău și Bălți; dincolo de Bălți pe raioane', () => {
    expect([...z.intre].sort()).toEqual(['bilicenii noi', 'bilicenii vechi', 'orhei', 'singerei']);
    expect([...z.edinet].sort()).toEqual(['cupcini', 'edinet', 'lopatnic']);
    expect([...z.riscani].sort()).toEqual(['corlateni', 'intersectia pelenia', 'riscani']);
    expect([...z.briceni].sort()).toEqual(['briceni', 'criva']);
    expect([...z.ocnita].sort()).toEqual(['ocnita', 'otaci']);
    expect([...z.nord].sort()).toEqual(['hlinaia']);
  });
  it('al doilea traseu din tariful 7 nu trage Bilicenii Vechi la nord (147,6 < 154 pe tariful 7, dar 163,1 > 148,5 pe tariful 1)', () => {
    expect(z.nord.has('bilicenii vechi')).toBe(false);
    expect(z.nord.has('balti')).toBe(false);
    expect(z.intre.has('chisinau')).toBe(false);
  });
  it('perechile', () => {
    expect(zonaPerechii('Chisinau - Briceni', z)).toBe('briceni');
    expect(zonaPerechii('Chisinau - Otaci', z)).toBe('ocnita');
    expect(zonaPerechii('Chisinau - lopatnic', z)).toBe('edinet');
    expect(zonaPerechii('Chisinau - Riscani', z)).toBe('riscani');
    expect(zonaPerechii('Chisinau - Hlinaia', z)).toBe('nord');
    expect(zonaPerechii('Chisinau - Edinet', z)).toBe('edinet');
    expect(zonaPerechii('Chisinau - Cupcini', z)).toBe('edinet');
    expect(zonaPerechii('Briceni - Chisinau', z)).toBe('briceni');
    expect(zonaPerechii('Chisinau - Singerei', z)).toBe('intre');
    expect(zonaPerechii('Chisinau - alexandreni', z)).toBe('intre');
    expect(zonaPerechii('Chisinau - Balti', z)).toBeNull();
    expect(zonaPerechii('Balti - Edinet', z)).toBeNull();
    expect(zonaPerechii('Chisinau - Zahareuca', z)).toBeNull();
    expect(zonaPerechii('Nedeterminat', z)).toBeNull();
  });
  it('scrierile TIKI diferite de nomenclator', () => {
    const n = zoneBalti([
      ...stops,
      { tariff_id: 1, name_ro: 'Beleavinți', km_from_start: '29.50', district: 'briceni' },
      { tariff_id: 1, name_ro: 'Coteala', km_from_start: '28.50', district: 'briceni' },
      { tariff_id: 1, name_ro: 'Gordineștii Noi', km_from_start: '23.00', district: 'briceni' },
      { tariff_id: 1, name_ro: 'Slobozia Șirăuți', km_from_start: '7.00', district: 'briceni' },
    ]);
    expect(zonaPerechii('Chisinau - Beleavineti', n)).toBe('briceni');
    expect(zonaPerechii('Chisinau - Cotelea', n)).toBe('briceni');
    expect(zonaPerechii('Chisinau - Gordinesti', n)).toBe('briceni');
    expect(zonaPerechii('Chisinau - sl. Sirauti', n)).toBe('briceni');
  });
});

describe('sumPairs', () => {
  it('însumează toate coloanele', () => {
    const s = sumPairs([
      { pair: 'Chisinau - Briceni', tickets: 10, lei: 2500, tur: 6, retur: 4, fara_sens: 0, statii: 8, dedus: 2 },
      { pair: 'Chisinau - Edinet', tickets: 5, lei: 1000, tur: 2, retur: 3, fara_sens: 1, statii: 5, dedus: 0 },
    ], 'G');
    expect(s).toEqual({ pair: 'G', tickets: 15, lei: 3500, tur: 8, retur: 7, fara_sens: 1, statii: 13, dedus: 2 });
  });
});
