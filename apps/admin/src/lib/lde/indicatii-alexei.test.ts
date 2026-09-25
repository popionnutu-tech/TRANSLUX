import { describe, it, expect } from 'vitest';
import { indicatiiLear, PRAG_INDICATII_KM_SAPT, type RandLear } from './indicatii-alexei';
import { PLAFON } from './timp-liber';

// cifrele reale din lde_analiza_reguli, săptămâna 14–20.09.2026 (km/zi, 5 zile lucrate)
const rute = (a: string, b: string): RandLear['rute'] => [
  { id: a, tura: 'A', capat: '', loc: 20, etalon: 0, acoperire: 1 },
  { id: b, tura: 'B', capat: '', loc: 20, etalon: 0, acoperire: 1 },
];
const m = (masina: string, casa: string | null, r: string, r1: number | null, r2: { km: number; A: string; B: string } | null, r3: number | null, liber?: RandLear['liber']): RandLear => ({
  masina, casa, zile_lucrate: 5, rute: rute(...(r.split(' + ') as [string, string])),
  r1: r1 == null ? undefined : { zi: 0, km: r1, lei: 0 },
  r2: r2 == null ? undefined : { km: r2.km, lei: 0, rute: { A: r2.A, B: r2.B } },
  r3: r3 == null ? undefined : { zi: 0, km: r3, lei: 0 }, liber,
});
const FLORESTI: RandLear[] = [
  m('849BRAN', 'Cașunca', 'A1 + B2', -59.1, { km: 0, A: 'A1', B: 'B2' }, -31.5),
  m('894BRAX', 'Pohoarna', 'A2 + B3', 31, { km: 78.5, A: 'A6', B: 'B5' }, 18.9),
  m('035BRAT', 'Bulboci', 'A5 + B4', -67.7, { km: 0, A: 'A5', B: 'B4' }, -10.9),
  m('603BRAS', null, 'A3 + B1', null, null, null),
  m('279BRAT', 'Țîra', 'A6 + B5', 11, { km: -25.9, A: 'A2', B: 'B3' }, 23.4),
];
const U = { nume: 'LEAR Florești', uz: 'floresti' };
const BASE = 'https://central-hub-md.vercel.app';

describe('indicatiiLear', () => {
  it('Florești 14–20.09: schimbul 894BRAX ↔ 279BRAT la regula 2, 279BRAT nu mai apare și la regula 3', () => {
    const t = indicatiiLear({ saptamina: '2026-09-14', pana_la: '2026-09-20', masini: FLORESTI }, U, BASE)!;
    expect(t).toContain('LEAR Florești · ce facem săptămâna asta</b> · 14–20 septembrie');
    // net pe flotă: (78,5 − 25,9) × 5 = 263
    expect(t).toContain('Rutele împărțite altfel (regula 2)</b> — pe flotă −263 km/săpt.');
    expect(t).toContain('<b>894BRAX</b> (Pohoarna): ia A6 + B5 de la 279BRAT, dă A2 + B3 — −393 km/săpt.');
    expect(t).toContain('↳ 279BRAT ia A2 + B3 (+130 km/săpt.)');
    // 279BRAT e partener la regula 2; regula 3 (117 km/săpt.) e sub regula 2 pe flotă? nu — e a lui, dar cea mai bună
    // regulă a lui e 3 (r2 negativ), deci apare la regula 3
    expect(t).toContain('Între ture nu pleacă acasă (regula 3)');
    expect(t).toContain('<b>279BRAT</b> (Țîra) — −117 km/săpt.');
    // r1/r3 negative nu se propun
    expect(t).not.toMatch(/849BRAN|035BRAT|603BRAS/);
    expect(t).toContain('href="https://central-hub-md.vercel.app/lde/reguli?saptamina=2026-09-14&uz=floresti"');
    // totalul flotei: 894BRAX 393 + 279BRAT 117 = 510
    expect(t).toContain('<b>−510 km/săpt.</b>');
  });
  it('regula 2 nu se propune când flota nu câștigă net, chiar dacă o mașină ar câștiga mult', () => {
    const masini = [
      m('X', 'Sat', 'A1 + B1', 5, { km: 40, A: 'A2', B: 'B2' }, 30),
      m('Y', 'Alt', 'A2 + B2', 0, { km: -40, A: 'A1', B: 'B1' }, 0),
    ];
    const t = indicatiiLear({ saptamina: '2026-09-14', pana_la: '2026-09-20', masini }, U, BASE)!;
    expect(t).not.toContain('regula 2');
    // X cade pe regula 3: 30 × 5 = 150 ≥ prag
    expect(t).toContain('<b>X</b> (Sat) — −150 km/săpt.');
  });
  it('sub prag → null (tăcere), și fără nicio mașină → null', () => {
    const putin = [m('X', 'Sat', 'A1 + B1', 10, { km: 0, A: 'A1', B: 'B1' }, 15)];   // 50 și 75 km/săpt.
    expect(indicatiiLear({ saptamina: '2026-09-14', pana_la: '2026-09-20', masini: putin }, U, BASE)).toBeNull();
    expect(indicatiiLear({ saptamina: '2026-09-14', pana_la: '2026-09-20', masini: [] }, U, BASE)).toBeNull();
    expect(PRAG_INDICATII_KM_SAPT).toBe(100);
  });
  it('Ungheni: cine ia ce de la cine, cu rute de la două mașini diferite; regula 1 când e cea mai bună', () => {
    const masini = [
      m('809MUM', 'Lucăceni', 'A12 + B10', 202.6, { km: 129.8, A: 'A9', B: 'B5' }, 121.4),
      m('807MUM', 'Fălești', 'A9 + B3', 146.1, { km: -30.5, A: 'A5', B: 'B15' }, 124),
      m('827MUM', 'Fălești', 'A6 + B5', 121.8, { km: -45.9, A: 'A6', B: 'B12' }, 124.2),
    ];
    const t = indicatiiLear({ saptamina: '2026-09-14', pana_la: '2026-09-20', masini }, { nume: 'LEAR Ungheni', uz: '' }, BASE)!;
    // 809MUM: r1 1.013 > r2 649 → regula 1; r2 net = (129,8 − 30,5 − 45,9) × 5 = 267 ≥ prag, dar nu e cea mai bună a nimănui
    expect(t).toContain('Doarme lângă uzină (regula 1)');
    expect(t).toContain('<b>809MUM</b> (Lucăceni) — −1.013 km/săpt.');
    expect(t).toContain('<b>807MUM</b> (Fălești) — −731 km/săpt.');
    expect(t).not.toContain('regula 2');
    expect(t).toContain('href="https://central-hub-md.vercel.app/lde/reguli?saptamina=2026-09-14"');
    expect(t).not.toContain('&uz=');
  });
  it('regula 2 cu rute luate de la două mașini', () => {
    const masini = [
      m('G', 'Sat', 'A1 + B1', 0, { km: 60, A: 'A2', B: 'B3' }, 0),
      m('P1', 'S1', 'A2 + B2', 0, { km: -10, A: 'A1', B: 'B2' }, 0),
      m('P2', 'S2', 'A3 + B3', 0, { km: -5, A: 'A3', B: 'B1' }, 0),
    ];
    const t = indicatiiLear({ saptamina: '2026-09-14', pana_la: '2026-09-20', masini }, U, BASE)!;
    expect(t).toContain('<b>G</b> (Sat): ia A2 de la P1, B3 de la P2, dă A1 + B1 — −300 km/săpt.');
    expect(t).toContain('↳ P1 ia A1 + B2 (+50 km/săpt.)');
    expect(t).toContain('↳ P2 ia A3 + B1 (+25 km/săpt.)');
  });
  it('km liberi și brambura peste prag: doar cifrele, cu întrebarea', () => {
    const liber: NonNullable<RandLear['liber']> = { km: 61, prag_km: 50, peste_prag: true, zile: 2, km_brambura: 7, peste_prag_brambura: false,
      iesiri: [{ zi: '2026-09-15', de_la: '16:00', pana_la: '18:00', km: 61, departare: 40, eticheta: 'liber', loc_principal: 'Fălești', repetat: false, opriri: [] }] };
    const t = indicatiiLear({ saptamina: '2026-09-14', pana_la: '2026-09-20', masini: [m('Z<b>', 'Sat', 'A1 + B1', 0, null, 0, liber)] }, U, BASE)!;
    expect(t).toContain('Km liberi și brambura (§11)');
    expect(t).toContain('<b>Z&lt;b&gt;</b> — 61,0 km liber în 2 zile: unde a fost?');
    expect(t).not.toContain('Fălești');
  });
  it('plafonul taie pe linii întregi', () => {
    const multe = Array.from({ length: 150 }, (_, i) => m(`M${String(i).padStart(3, '0')}`, 'Sat', `A${i} + B${i}`, 30 + i, null, 0));
    const t = indicatiiLear({ saptamina: '2026-09-14', pana_la: '2026-09-20', masini: multe }, U, BASE)!;
    expect(t.length).toBeLessThanOrEqual(PLAFON);
    expect(t).toMatch(/… și încă \d+ rânduri/);
    expect((t.match(/<b>/g) || []).length).toBe((t.match(/<\/b>/g) || []).length);
  });
});
