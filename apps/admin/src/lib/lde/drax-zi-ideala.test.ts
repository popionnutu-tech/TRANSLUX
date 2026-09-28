import { describe, it, expect } from 'vitest';
import { randuriZiIdeala, textCauze, textIntervalIdeal, textZiIdeala, type ZiIdealaDrax, type ZiIdealaMasina, type ZiIdealaZi } from './drax-zi-ideala';

const zi = (x: Partial<ZiIdealaZi>): ZiIdealaZi => ({ z: '2026-09-15', gps: 238.4, ideal: 129.4, economie: 109, cuOameni: 61.3, obligatorii: 91.2, legaturi: 38.2, noapteIdeala: 0,
  cauze: { noapte: 36.9, acasa: 72.1, drumLung: 0, drumMaiScurt: 0 }, separat: { weekend: 0, balti: 0, pauza: 0 }, steaguri: [], intervale: [], jumatati: [], ...x });

describe('ION-123 — ziua ideală pe pagină', () => {
  it('ziua: făcut, ideal, economie, cauze', () => {
    expect(textZiIdeala(zi({}))).toBe('mar 15.09 · făcut 238 km · ideal 129 · economie 109 (noapte 37, acasă 72)');
  });
  it('ziua cu weekend separat', () => {
    expect(textZiIdeala(zi({ z: '2026-09-14', separat: { weekend: 19.2, balti: 0, pauza: 0 } }))).toContain('separat 19 (weekend)');
  });
  it('drumul între curse, cu drumul direct estimat pe hartă', () => {
    expect(textIntervalIdeal({ ora: '06:07–14:08', km: 59.8, obl: 3.7, munca: 3.7, leg: 19.1, src: 'valhalla', ocol: 35, economie: 37, intreUzine: 'EST→VEST' }))
      .toBe('06:07–14:08 · făcut 60 km · ideal 23 (muncă 4 + drum direct 19, estimat pe hartă) · economie 37');
  });
  it('drumul doar cu muncă: economie 0', () => {
    expect(textIntervalIdeal({ ora: '14:32–15:52', km: 7.1, obl: 7.1, munca: 7.1, leg: 0, src: '0', ocol: 0, economie: 0, intreUzine: 'VEST→EST' }))
      .toBe('14:32–15:52 · făcut 7 km · ideal 7 (muncă 7) · economie 0');
  });
  it('cauzele negative se spun', () => {
    expect(textCauze({ noapte: 0, acasa: 2.2, drumLung: 0, drumMaiScurt: -15.6 })).toBe('acasă 2, mai scurt decât idealul -16');
  });
  it('rândurile: după economie, separatele la coadă', () => {
    const m = (x: Partial<ZiIdealaMasina>) => ({ m: 'X', separat: false, zileLV: 5, zileMasurate: 5, kmSapt: 0, peZi: 0, pestePrag: false, cauze: { noapte: 0, acasa: 0, drumLung: 0, drumMaiScurt: 0 }, separatKm: {} as ZiIdealaMasina['separatKm'], zile: [], ...x });
    const z = { masini: [m({ m: 'A', kmSapt: 100 }), m({ m: 'S', separat: true, kmSapt: 500 }), m({ m: 'B', kmSapt: 300 }), m({ m: 'N', zileMasurate: 0 })] } as unknown as ZiIdealaDrax;
    expect(randuriZiIdeala(z).map((x) => x.m)).toEqual(['B', 'A', 'S']);
  });
});
