import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  parsePetrom, parseIntelect, finalizeaza, localChisinauLaUtc, detecteazaFormat, despartePortofel, placutaDinNume, esteDt, EroareFisier,
} from './combustibil-fisiere';

// Fișiere INVENTATE (repo public): aceeași structură ca rapoartele reale, coduri și nume fictive.
const PETROM = [
  'Карта\tРег. номер транспортного средства\tДата транзакции\tКоличество\tГород площадки\tУдалить продукт\tЦена за единицу',
  '9001\tXX AA 111\t2026-09-01 07:50:00\t54,25\tP00-ORAS\tMOTORINA STANDARD\t32,5',
  '9002\tREZERVA 99\t2026-09-30 22:59:00\t20\tP00-ORAS\tBENZINA STANDARD 95\t31',
  '9001\tXX AA 111\t2026-09-02 08:00:00\t0\tP00-ORAS\tMOTORINA STANDARD\t32,5',
].join('\r\n');

const gol = (n = 22) => Array<string>(n).fill('');
const rand = (cells: Record<number, string>) => { const r = gol(); for (const [k, v] of Object.entries(cells)) r[+k] = v; return r; };
const INTELECT: string[][] = [
  rand({ 0: 'Оборот по кошелькам клиента\nTest' }),
  rand({ 0: 'За период с 01-09-2026 по 30-09-2026' }),
  rand({ 0: 'Клиент/Пользователь:CLIENT TEST 0007 Sofer Fictiv' }),
  rand({ 0: 'Услуга :Motorina EURO' }),
  rand({ 0: 'Peco Fictiv', 2: 'Operator :', 6: 'Casier 1' }),
  rand({ 0: 'Услуга :Motorina EURO', 2: '32.50', 5: 'с', 6: '03.09.26 14:20:02' }),
  rand({ 2: '03.09.2026 14:20:02', 6: 'Motorina EURO', 12: '130.04', 15: '32.55', 17: '-2,016.47', 19: '4,449.91' }),
  rand({ 2: '03.09.2026 14:22:57', 6: 'Motorina EURO', 12: '62.39', 15: '32.55', 17: '-913.47', 19: '2,015.82' }),
  rand({ 2: '03.09.2026 14:22:57', 6: 'Motorina EURO', 12: '62.39', 15: '32.55', 17: '-913.47', 19: '2,015.82' }),
  rand({ 2: '04.09.2026 5:01:00', 6: 'Motorina EURO', 12: '0.00', 15: '32.55', 17: '0', 19: '0' }),
  rand({ 0: 'Итого по услуге:Motorina EURO', 12: '254.82' }),
  rand({ 0: 'Клиент/Пользователь:CLIENT TEST B00459 REZERVA-microbuse' }),
  rand({ 0: 'Услуга :Ad Blue Pompa' }),
  rand({ 2: '05.09.2026 10:00:00', 6: 'Ad Blue Pompa', 12: '10.00', 15: '14.00', 19: '140.00' }),
  rand({ 0: 'Итого по услуге:Ad Blue Pompa', 12: '10.00' }),
  rand({ 0: 'Total final' }),
  rand({ 0: 'CARD', 1: 'NR. DE INMAT' }),
  rand({ 2: '06.09.2026 10:00:00', 6: 'Motorina EURO', 12: '999.00' }),   // după «Total final»: sumar, nu tranzacție
];

describe('Petrom', () => {
  it('citește rândurile: zecimală cu virgulă, motorina e DT, benzina nu', () => {
    const t = parsePetrom(PETROM);
    expect(t).toHaveLength(3);
    expect(t[0]).toMatchObject({ cod: '9001', nume_fisier: 'XX AA 111', litri: 54.25, pret: 32.5, este_dt: true, local: '2026-09-01 07:50:00' });
    expect(t[1].este_dt).toBe(false);
  });
  it('refuză un antet străin', () => {
    expect(() => parsePetrom('Card\tPlate\n1\t2')).toThrow(EroareFisier);
  });
});

describe('Intelect', () => {
  it('citește pe portofele, sare sumarele, verifică totalul pe portofel', () => {
    const t = parseIntelect(INTELECT);
    expect(t.map((x) => x.litri)).toEqual([130.04, 62.39, 62.39, 0, 10]);
    expect(t[0]).toMatchObject({ cod: '0007', statie: 'Peco Fictiv', produs: 'Motorina EURO', este_dt: true, suma: 4449.91, reducere: -2016.47 });
    expect(t[4]).toMatchObject({ cod: 'B00459', este_dt: false });
    expect(t[3].local).toBe('2026-09-04 05:01:00');
  });
  it('refuză când totalul portofelului nu bate', () => {
    const rau = INTELECT.map((r) => [...r]);
    rau[10][12] = '300.00';
    expect(() => parseIntelect(rau)).toThrow(/nu bate/);
  });
  it('refuză alt raport', () => {
    expect(() => parseIntelect([rand({ 0: 'Alt raport' })])).toThrow(EroareFisier);
  });
});

describe('finalizare', () => {
  it('sare 0 l și deosebește rândurile identice prin ordinal', () => {
    const f = finalizeaza(parseIntelect(INTELECT));
    expect(f).toHaveLength(4);
    const ids = f.map((x) => x.external_id);
    expect(new Set(ids).size).toBe(4);
    expect(ids[1].endsWith(':1')).toBe(true);
    expect(ids[2].endsWith(':2')).toBe(true);
  });
  it('aceleași rânduri dau aceleași chei (fișiere suprapuse)', () => {
    const a = finalizeaza(parseIntelect(INTELECT)).map((x) => x.external_id);
    const b = finalizeaza(parseIntelect(INTELECT)).map((x) => x.external_id);
    expect(a).toEqual(b);
  });
  it('ora locală Chișinău → UTC, cu ora de vară și de iarnă', () => {
    expect(localChisinauLaUtc('2026-09-30 22:59:00')).toBe('2026-09-30T19:59:00.000Z');   // vara: UTC+3
    expect(localChisinauLaUtc('2026-12-15 10:00:00')).toBe('2026-12-15T08:00:00.000Z');   // iarna: UTC+2
    expect(finalizeaza(parsePetrom(PETROM))[1].zi_local).toBe('2026-09-30');              // nu sare în 01.10
  });
});

describe('utilitare', () => {
  it('formatul după primii octeți', () => {
    expect(detecteazaFormat(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe('intelect');
    expect(detecteazaFormat(new Uint8Array([0xff, 0xfe, 0x1a, 0x04]))).toBe('petrom');
    expect(detecteazaFormat(new Uint8Array([0x50, 0x4b]))).toBeNull();
  });
  it('portofelul și plăcuța din nume', () => {
    expect(despartePortofel('CLIENT TEST 0007 Sofer Fictiv')).toEqual({ cod: '0007', nume: 'Sofer Fictiv' });
    expect(despartePortofel('CLIENT TEST F0227 054XYZ-Fictiv CLIENT')).toEqual({ cod: 'F0227', nume: '054XYZ-Fictiv CLIENT' });
    expect(placutaDinNume('BR AT 035')).toContain('035BRAT');
    expect(placutaDinNume('HMK 135')).toContain('HMK135');
    expect(placutaDinNume('054MLD')).toContain('054MLD');
    expect(placutaDinNume('054MLD-Fictiv CLIENT')).toEqual([]);     // plăcuță + persoană → fără propunere
    expect(placutaDinNume('REZERVA 28')).toEqual([]);
    expect(esteDt('Ad Blue Pompa')).toBe(false);
  });
});

// Fișierele reale stau doar local (repo public); testul se sare când lipsesc.
const REAL = '/Users/ionpop/Desktop/TRANSLUX/.orca/drops';
const realPetrom = `${REAL}/petrom (1).txt`;
const realXls = `${REAL}/Оборот по кошелькам клиента детальный по всем АЗС.xls`;
describe.skipIf(!existsSync(realPetrom) || !existsSync(realXls))('fișierele reale (local)', () => {
  it('Petrom: 144 de rânduri; motorina pe mașinile de la Florești = foaia pz_cd', () => {
    const t = parsePetrom(new TextDecoder('utf-16le').decode(readFileSync(realPetrom)));
    expect(t).toHaveLength(144);
    const pe = (n: string) => Math.round(t.filter((x) => x.nume_fisier === n).reduce((s, x) => s + x.litri, 0) * 100) / 100;
    expect(pe('BR AN 849')).toBe(785.18);
    expect(pe('BR AS 603')).toBe(562.49);
    expect(pe('BR AT 035')).toBe(800.71);
    expect(pe('BR AT 279')).toBe(487.23);
  });
  it('Intelect: motorina 40.965,55 l, toate totalurile de portofel bat', async () => {
    const { randuriXls } = await import('./combustibil-xls');
    const t = parseIntelect(randuriXls(new Uint8Array(readFileSync(realXls))));
    const dt = Math.round(t.filter((x) => x.este_dt).reduce((s, x) => s + x.litri, 0) * 100) / 100;
    expect(dt).toBe(40965.55);
    const f = finalizeaza(t);
    expect(new Set(f.map((x) => x.external_id)).size).toBe(f.length);
  });
});
