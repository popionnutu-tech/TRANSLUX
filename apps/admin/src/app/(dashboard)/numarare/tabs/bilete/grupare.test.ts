import { describe, it, expect } from 'vitest';
import { esteDupaBalti, nordDeBalti, pairNorm, stopNorm, sumPairs } from './grupare';

// Tariful 1 (Criva – Chișinău) și tariful 7 (Otaci + Briceni – Chișinău, două trasee cu km diferiți în același tarif).
const stops = [
  { tariff_id: 1, name_ro: 'Criva', km_from_start: '3.50' },
  { tariff_id: 1, name_ro: 'Briceni', km_from_start: '44.50' },
  { tariff_id: 1, name_ro: 'Edineț', km_from_start: '78.50' },
  { tariff_id: 1, name_ro: 'Corlăteni', km_from_start: '135.10' },
  { tariff_id: 1, name_ro: 'Bălți', km_from_start: '148.50' },
  { tariff_id: 1, name_ro: 'Bilicenii Noi', km_from_start: '158.20' },
  { tariff_id: 1, name_ro: 'Sîngerei', km_from_start: '174.70' },
  { tariff_id: 1, name_ro: 'Orhei', km_from_start: '234.50' },
  { tariff_id: 1, name_ro: 'Chișinău', km_from_start: '282.50' },
  { tariff_id: 7, name_ro: 'Otaci', km_from_start: '0.00' },
  { tariff_id: 7, name_ro: 'Ocnița', km_from_start: '47.00' },
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
  { tariff_id: 10, name_ro: 'Rîșcani', km_from_start: '176.00' },
];

describe('normalizare', () => {
  it('fără diacritice, fără GA, ordonat', () => {
    expect(stopNorm('Halahora de Sus')).toBe('halahora de sus');
    expect(stopNorm('Grinăuți-Raia')).toBe('grinauti raia');
    expect(stopNorm('GA Chișinău')).toBe('chisinau');
    expect(pairNorm('Balti - Chisinau')).toBe(pairNorm('Chisinau - Balti'));
  });
});

describe('nordDeBalti', () => {
  const nord = nordDeBalti(stops);
  it('stațiile de dincolo de Bălți intră, cele dintre Bălți și Chișinău nu', () => {
    expect([...nord].sort()).toEqual(['briceni', 'corlateni', 'criva', 'edinet', 'ocnita', 'otaci', 'riscani']);
  });
  it('al doilea traseu din tariful 7 nu trage Bilicenii Vechi la nord', () => {
    expect(nord.has('bilicenii vechi')).toBe(false);
    expect(nord.has('balti')).toBe(false);
    expect(nord.has('chisinau')).toBe(false);
  });
  it('perechile', () => {
    expect(esteDupaBalti('Chisinau - Briceni', nord)).toBe(true);
    expect(esteDupaBalti('Briceni - Chisinau', nord)).toBe(true);
    expect(esteDupaBalti('Chisinau - Balti', nord)).toBe(false);
    expect(esteDupaBalti('Chisinau - Singerei', nord)).toBe(false);
    expect(esteDupaBalti('Balti - Edinet', nord)).toBe(false);
    expect(esteDupaBalti('Chisinau - Zahareuca', nord)).toBe(false);
    expect(esteDupaBalti('Nedeterminat', nord)).toBe(false);
  });
  it('scrierile TIKI diferite de nomenclator', () => {
    const n = nordDeBalti([
      ...stops,
      { tariff_id: 1, name_ro: 'Beleavinți', km_from_start: '29.50' },
      { tariff_id: 1, name_ro: 'Coteala', km_from_start: '28.50' },
      { tariff_id: 1, name_ro: 'Gordineștii Noi', km_from_start: '23.00' },
      { tariff_id: 1, name_ro: 'Slobozia Șirăuți', km_from_start: '7.00' },
    ]);
    expect(esteDupaBalti('Chisinau - Beleavineti', n)).toBe(true);
    expect(esteDupaBalti('Chisinau - Cotelea', n)).toBe(true);
    expect(esteDupaBalti('Chisinau - Gordinesti', n)).toBe(true);
    expect(esteDupaBalti('Chisinau - sl. Sirauti', n)).toBe(true);
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
