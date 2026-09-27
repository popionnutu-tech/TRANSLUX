import { describe, it, expect } from 'vitest';
import { dormBalti, textBalti, INTRO_BALTI } from './drax-balti';
import type { AnalizaDrax, MasinaDrax, ZiDrax } from './drax-analiza';
import { fixtureDrax } from './drax-fixture.test-util';

// mașinile reale din Bălți, săptămâna 14.09 simulată pe regulile de după migrația 413 (worker cod-ion109)
const zi = (z: string, exclus: string | null): ZiDrax => ({ ...(fixtureDrax().masini[0].detalii[0] ?? {}), z, exclus } as ZiDrax);
const m = (x: Partial<MasinaDrax> & { m: string; R1a: number | null }): MasinaDrax => {
  const b = fixtureDrax().masini[0];
  return { ...b, ...x, extrapolat: { ...b.extrapolat, R1a: x.R1a as number }, detalii: x.detalii ?? [], rute: x.rute ?? [] } as MasinaDrax;
};
const a: AnalizaDrax = { ...fixtureDrax(), masini: [
  m({ m: '435ASB', R1a: 365.6, casa: 'Autogara', casaKmPoarta: 1.7, zile: 5, zileIncluse: 4,
    rute: [{ r: 'R34|Taura Veche', nume: 'R34 · Taura Veche', km: 360, zile: 5, curse: 9 }, { r: 'R19|Bilicenii Vechi', nume: 'R19 · Bilicenii Vechi', km: 19.1, zile: 1, curse: 1 }] }),
  m({ m: '744ARF', R1a: null, casa: 'Dacia', casaKmPoarta: 2.4, zile: 5, zileIncluse: 0,
    detalii: ['14', '15', '16', '17', '18'].map((d) => zi(`2026-09-${d}`, `cursa probabil nedetectata la poarta (tur 06:0${d === '14' ? 4 : 5}${d === '14' ? ', retur 15:35' : ''})`)) }),
  m({ m: '144BRAZ', R1a: 321.8, casa: 'Dacia', casaKmPoarta: 1.5, zile: 5, zileIncluse: 2,
    rute: [{ r: 'R38|Glinjeni', nume: 'R38 · Glinjeni', km: 150, zile: 4, curse: 7 }],
    detalii: [zi('2026-09-17', 'cursa probabil nedetectata la poarta (retur 00:03)'), zi('2026-09-18', 'cursa probabil nedetectata la poarta (retur 00:05)')] }),
  m({ m: '925FTI', R1a: 200, casa: 'Sărata Veche', casaKmPoarta: 35, zile: 5, zileIncluse: 4 }),
  m({ m: '186OMM', R1a: 281.7, casa: 'Dacia', casaKmPoarta: 1.7, zile: 5, zileIncluse: 5,
    rute: [{ r: 'R4|Grinauti', nume: 'R4 · Grinauti', km: 180, zile: 5, curse: 5 }, { r: 'R3|Nihoreni', nume: 'R3 · Nihoreni', km: 170, zile: 5, curse: 5 }] }),
  m({ m: '999ZER', R1a: 0, casa: 'Dacia', casaKmPoarta: 1.0, zile: 5, zileIncluse: 5 }),
] };

describe('Dorm în Bălți (ION-109)', () => {
  const r = dormBalti(a);
  it('doar casa ≤ 3 km de poartă, cu livrare sau cu zile nevăzute; ordonate după km', () => {
    expect(r.map((x) => x.m)).toEqual(['435ASB', '144BRAZ', '186OMM', '744ARF']);
  });
  it('mașina măsurată: km pe săptămână, linia principală, fără lei', () => {
    expect(textBalti(r[0])).toBe('435ASB doarme la Autogara (1,7 km de poartă), linia R34 · Taura Veche: drumul gol până la capăt și înapoi ≈ 366 km pe săptămână.');
  });
  it('puține zile măsurate + zile nevăzute', () => {
    expect(textBalti(r[1])).toBe('144BRAZ doarme la Dacia (1,5 km de poartă), linia R38 · Glinjeni: drumul gol până la capăt și înapoi ≈ 322 km pe săptămână (extrapolare din doar 2 zile măsurate). Plus 2 zile cu o cursă probabil nevăzută de analiză (retur pe la 00:03, 2 zile), scoase din măsurare.');
  });
  it('nemăsurată din cauza cursei nevăzute', () => {
    expect(textBalti(r[3])).toBe('744ARF doarme la Dacia (2,4 km de poartă). În 5 zile din 5 face probabil o cursă cu oameni pe care analiza n-o vede (tur pe la 06:04, 5 zile; retur pe la 15:35, 1 zi): livrarea se măsoară abia după ce se lămurește ce cursă e (analiza n-o leagă de nicio linie).');
  });
  it('mașina cu două linii: le numește pe amândouă', () => {
    expect(textBalti(r[2])).toBe('186OMM doarme la Dacia (1,7 km de poartă), liniile R4 · Grinauti și R3 · Nihoreni: drumul gol până la capăt și înapoi ≈ 282 km pe săptămână.');
  });
  it('fără lei și fără «dispoziție» în fraze', () => {
    for (const x of r) expect(textBalti(x)).not.toMatch(/lei|dispoziți/);
    expect(INTRO_BALTI).toContain('Nu e o dispoziție pentru dispecer');
  });
});
