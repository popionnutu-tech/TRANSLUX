import { describe, it, expect } from 'vitest';
import { esteAutobuz, masiniPePoster, textLoc, type MasinaPoster } from './drax-parcare-image';
import type { MasinaParcare } from './drax-parcare';

const loc = (n: string, nr = 1) => ({ nr, n, fel: 'village', c: [0, 0] as [number, number], drumuri: 5 });
const p = (m: string, km: number, locuri = [loc('Fălești')]) => ({ m, locuri, unLoc: null, doiLocuri: null, zileMasurate: 5, zileLV: 5, real: 0, propus: 0,
  economieMasurata: km, economieSapt: km, idealSapt: null, zile: [] }) as MasinaParcare;
const x = (m: string, km: number, autobuz: boolean, locuri?: MasinaParcare['locuri']): MasinaPoster => ({ m, tip: null, locuri: autobuz ? 50 : 20, autobuz, acasa: null, p: p(m, km, locuri) });

describe('ION-140 — posterul parcării Drăxlmaier', () => {
  it('autobuz = ≥ 40 locuri, altfel după tip (DAF)', () => {
    expect(esteAutobuz(50, 'DAF')).toBe(true);
    expect(esteAutobuz(27, 'Sprinter 518')).toBe(false);
    expect(esteAutobuz(null, 'DAF')).toBe(true);
    expect(esteAutobuz(null, 'Crafter (VW)')).toBe(false);
  });
  it('pragurile: autobuze ≥ 100, rutiere ≥ 150 km/săpt.; fără loc propus nu intră', () => {
    const { pe, sub } = masiniPePoster([x('446ASB', 104, true), x('A', 99, true), x('346KAJ', 154, false), x('B', 148, false), x('C', 300, false, [])]);
    expect(pe.map((q) => q.m)).toEqual(['346KAJ', '446ASB']);
    expect(sub.map((q) => q.m).sort()).toEqual(['A', 'B']);
  });
  it('locul pentru șofer: unul sau două', () => {
    expect(textLoc(p('X', 1))).toBe('Fălești');
    expect(textLoc(p('X', 1, [loc('Fălești'), loc('Ilenuța', 2)]))).toBe('Fălești sau Ilenuța');
  });
});
