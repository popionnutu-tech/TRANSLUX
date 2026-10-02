import { describe, expect, it } from 'vitest';
import { inFereastraDeNoapte } from './fereastra-noapte';

describe('inFereastraDeNoapte', () => {
  it('vara (EEST, UTC+3): 23:00–04:59 da, 05:00–22:59 nu', () => {
    expect(inFereastraDeNoapte(new Date('2026-10-01T20:00:00Z'))).toBe(true);   // 23:00
    expect(inFereastraDeNoapte(new Date('2026-10-02T01:59:00Z'))).toBe(true);   // 04:59
    expect(inFereastraDeNoapte(new Date('2026-10-02T02:00:00Z'))).toBe(false);  // 05:00
    expect(inFereastraDeNoapte(new Date('2026-10-01T16:33:00Z'))).toBe(false);  // 19:33, căderea din 01.10
  });
  it('iarna (EET, UTC+2)', () => {
    expect(inFereastraDeNoapte(new Date('2026-12-01T21:00:00Z'))).toBe(true);   // 23:00
    expect(inFereastraDeNoapte(new Date('2026-12-01T03:00:00Z'))).toBe(false);  // 05:00
  });
});
