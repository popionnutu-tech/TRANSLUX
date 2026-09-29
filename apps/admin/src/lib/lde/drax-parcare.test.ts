import { describe, it, expect } from 'vitest';
import { culoareLoc, etichetaLoc, randuriParcare, textPropunere, type ParcareDrax } from './drax-parcare';

const m = (x: Partial<ParcareDrax['masini'][number]>) => ({ m: 'X', locuri: [], unLoc: { n: 'A', kmSapt: 0 }, doiLocuri: null, zileMasurate: 5, zileLV: 5,
  real: 0, propus: 0, economieMasurata: 0, economieSapt: 0, idealSapt: null, zile: [], ...x }) as ParcareDrax['masini'][number];

describe('ION-136 — parcarea propusă', () => {
  it('eticheta și culoarea locurilor (P1 portocaliu, P2 violet)', () => {
    expect(etichetaLoc({ nr: 1, n: 'Ilenuța' })).toBe('P1 · Ilenuța');
    expect(culoareLoc(1)).not.toBe(culoareLoc(2));
  });
  it('textul propunerii: un loc / două locuri', () => {
    expect(textPropunere(m({ locuri: [{ nr: 1, n: 'Fălești', fel: 'town', c: [0, 0], drumuri: 5 }] }))).toBe('parcare la Fălești');
    expect(textPropunere(m({ locuri: [{ nr: 1, n: 'Popovca', fel: 'village', c: [0, 0], drumuri: 5 }, { nr: 2, n: 'acasă (Dumbrăvița)', fel: 'casa', c: [0, 0], drumuri: 10 }] })))
      .toBe('parcare la Popovca sau acasă (Dumbrăvița) (după cursă)');
  });
  it('tabelul: cele cu mai mulți km de tăiat întâi', () => {
    const p = { masini: [m({ m: 'B', economieSapt: 10 }), m({ m: 'A', economieSapt: 400 }), m({ m: 'C', economieSapt: 10 })] } as ParcareDrax;
    expect(randuriParcare(p).map((x) => x.m)).toEqual(['A', 'B', 'C']);
  });
});
