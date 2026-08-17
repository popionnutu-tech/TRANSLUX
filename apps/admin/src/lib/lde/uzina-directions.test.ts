import { describe, it, expect } from 'vitest';
import { setUzinaInDirections, acelasiSet } from './uzina-directions';

const UZINE = ['SEBN_ORHEI', 'LEAR_UNGHENI', 'LEAR_FLORESTI', 'DRAXELMAIER_BALTI', 'TROX_BRICENI'];

describe('setUzinaInDirections', () => {
  it('schimbă uzina: o scoate pe cea veche, o pune pe cea nouă', () => {
    expect(setUzinaInDirections(['SEBN_ORHEI'], 'LEAR_UNGHENI', UZINE)).toEqual(['LEAR_UNGHENI']);
  });

  it('nu atinge direcțiile care nu sunt uzine', () => {
    expect(setUzinaInDirections(['camioane', 'SEBN_ORHEI'], 'LEAR_UNGHENI', UZINE))
      .toEqual(['camioane', 'LEAR_UNGHENI']);
    expect(setUzinaInDirections(['interurban', 'suburban'], 'SEBN_ORHEI', UZINE))
      .toEqual(['interurban', 'suburban', 'SEBN_ORHEI']);
  });

  it('scoaterea uzinei (null) lasă restul direcțiilor pe loc', () => {
    expect(setUzinaInDirections(['camioane', 'SEBN_ORHEI'], null, UZINE)).toEqual(['camioane']);
    expect(setUzinaInDirections(['SEBN_ORHEI'], null, UZINE)).toEqual([]);
  });

  it('pornește de la listă goală sau lipsă', () => {
    expect(setUzinaInDirections([], 'SEBN_ORHEI', UZINE)).toEqual(['SEBN_ORHEI']);
    expect(setUzinaInDirections(null, 'SEBN_ORHEI', UZINE)).toEqual(['SEBN_ORHEI']);
  });

  it('nu dublează uzina deja prezentă', () => {
    expect(setUzinaInDirections(['SEBN_ORHEI'], 'SEBN_ORHEI', UZINE)).toEqual(['SEBN_ORHEI']);
  });

  it('curăță și cazul cu două uzine rămase din greșeală', () => {
    expect(setUzinaInDirections(['SEBN_ORHEI', 'camioane', 'LEAR_UNGHENI'], 'LEAR_FLORESTI', UZINE))
      .toEqual(['camioane', 'LEAR_FLORESTI']);
  });
});

describe('acelasiSet', () => {
  it('ignoră ordinea', () => {
    expect(acelasiSet(['a', 'b'], ['b', 'a'])).toBe(true);
  });

  it('vede diferențele', () => {
    expect(acelasiSet(['a'], ['a', 'b'])).toBe(false);
    expect(acelasiSet(['a'], ['b'])).toBe(false);
    expect(acelasiSet(null, [])).toBe(true);
  });
});
