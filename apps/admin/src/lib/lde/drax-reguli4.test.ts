import { describe, it, expect } from 'vitest';
import { liniiR1, liniiR4, randuriReguli4, textR1, textR3, textR4, type Reguli4Drax, type Reguli4Masina } from './drax-reguli4';

const m = (x: Partial<Reguli4Masina>): Reguli4Masina => ({ m: 'X', R1: null, R2: 0, R4: 0, R4laCapat: 0, R4laUzina: 0, balti: 0, total: 0, ...x });
const r = (x: Partial<Reguli4Drax>): Reguli4Drax => ({ versiune: '', rulat: '', esantion: 159, zileLV: 189, factor: 1.19,
  flota: {} as Reguli4Drax['flota'], R3: { candidati: [], perechiVerificate: 703, masiniEligibile: 21, masiniCuZileExcluse: 17, prag: 50, capacitate: 'de confirmat' }, masini: [], ...x });

describe('ION-120 — cele 4 reguli pe pagină', () => {
  it('regula 1 propusă: unde doarme, km, distanța șoferului', () => {
    expect(textR1(m({ R1: { propus: true, km: 155.2, kmSapt: 194, nopti: 4, X: 'Florești', soferKm: 15.6, motiv: null } }))).toBe('Florești · 155 · șofer 16 km');
  });
  it('regula 1 sub prag: se spune, nu se propune', () => {
    expect(textR1(m({ R1: { propus: false, km: 35.7, kmSapt: 59.5, nopti: 4, X: 'Nicolaevca', soferKm: 5.2, motiv: 'sub prag' } }))).toBe('sub prag (60/săpt.)');
  });
  it('regula 4: unde așteaptă', () => {
    expect(textR4(m({ R4: 350.5, R4laCapat: 120, R4laUzina: 230.5 }))).toBe('351 · capăt 120 / uzină 231');
  });
  it('regula 3 fără schimb: spune de ce', () => {
    expect(textR3(r({}))).toContain('Niciun schimb nu scade flota cu ≥ 50 km/săpt.');
  });
  it('regula 3 cu schimb: totalul flotei și fiecare mașină', () => {
    expect(textR3(r({ R3: { candidati: [{ A: '446ASB', B: '925FTI', net: 60.2, castigA: -121.6, castigB: 181.8 }], perechiVerificate: 1, masiniEligibile: 2, masiniCuZileExcluse: 0, prag: 50, capacitate: 'de confirmat' } })))
      .toBe('446ASB ↔ 925FTI: flota −60 km/săpt. (446ASB +122, 925FTI −182) · locuri: de confirmat');
  });
  it('rândurile: după total, fără mașinile fără nimic', () => {
    const rows = randuriReguli4(r({ masini: [m({ m: 'A', total: 10 }), m({ m: 'B' }), m({ m: 'C', total: 300 }), m({ m: 'D', balti: 50 })] }));
    expect(rows.map((x) => x.m)).toEqual(['C', 'A', 'D']);
  });
});

describe('rândul deschis (Ion 28.09: «nu pot apăsa pe auto»)', () => {
  it('regula 1: o linie pe noapte', () => {
    expect(liniiR1(m({ R1: { propus: true, km: 37.1, kmSapt: 149, nopti: 1, X: 'Lazo', soferKm: 6.3, motiv: null, detaliu: [{ noapte: '2026-09-14→2026-09-15', ora: '00:48 → 05:39', X: 'Lazo', seara: 17.9, dim: 19.2 }] } })))
      .toEqual(['lun 14.09 → mar 15.09 (00:48 → 05:39), la Lazo: seara 18 + dimineața 19 = 37 km']);
  });
  it('regula 3: o linie pe drum', () => {
    expect(liniiR4(m({ R4: 34.6, R4lista: [{ z: '2026-09-14', ora: '06:09–14:01', km: 34.6, unde: 'la capătul Lazo' }] })))
      .toEqual(['lun 14.09 06:09–14:01 · 35 km · așteaptă la capătul Lazo, nu acasă']);
  });
});
