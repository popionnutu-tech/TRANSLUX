import { describe, it, expect } from 'vitest';
import { depasesteLimita, LIMITA_CAUTARI, FEREASTRA_MINUTE } from './search-rate-limit';

describe('depasesteLimita — «mai mult de 10 căutări în 10 minute» (Ion, 09.09)', () => {
  it('limita e 10 căutări în 10 minute', () => {
    expect(LIMITA_CAUTARI).toBe(10);
    expect(FEREASTRA_MINUTE).toBe(10);
  });

  it('primele 10 căutări trec, a 11-a e blocată', () => {
    expect(depasesteLimita(0)).toBe(false);
    expect(depasesteLimita(9)).toBe(false);   // a 10-a căutare: 9 anterioare → trece
    expect(depasesteLimita(10)).toBe(true);   // a 11-a: 10 anterioare → blocată
    expect(depasesteLimita(178)).toBe(true);
  });

  it('fără date (RPC picat, hash lipsă) nu blochează pe nimeni', () => {
    expect(depasesteLimita(null)).toBe(false);
    expect(depasesteLimita(undefined)).toBe(false);
    expect(depasesteLimita(Number.NaN)).toBe(false);
  });
});
