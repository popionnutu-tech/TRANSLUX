import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { LINK_CODE_MAX, LINK_CODE_MIN, canReceiveLinkCode, generateLinkCode } from './linkCode';

describe('generateLinkCode', () => {
  it('dă mereu exact 6 cifre, fără zero în față', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateLinkCode(crypto.randomInt);
      expect(code).toMatch(/^[1-9]\d{5}$/);
      const n = Number(code);
      expect(n).toBeGreaterThanOrEqual(LINK_CODE_MIN);
      expect(n).toBeLessThan(LINK_CODE_MAX);
    }
  });

  it('cere generatorului intervalul [100000, 999999)', () => {
    const calls: Array<[number, number]> = [];
    const code = generateLinkCode((min, max) => { calls.push([min, max]); return min; });
    expect(calls).toEqual([[100000, 999999]]);
    expect(code).toBe('100000');
  });
});

describe('canReceiveLinkCode', () => {
  it('doar CONTROLLER activ din Chișinău sau Bălți', () => {
    expect(canReceiveLinkCode({ role: 'CONTROLLER', point: 'CHISINAU', active: true })).toBe(true);
    expect(canReceiveLinkCode({ role: 'CONTROLLER', point: 'BALTI', active: true })).toBe(true);
    expect(canReceiveLinkCode({ role: 'CONTROLLER', point: null, active: true })).toBe(false);
    expect(canReceiveLinkCode({ role: 'CONTROLLER', point: 'CHISINAU', active: false })).toBe(false);
    expect(canReceiveLinkCode({ role: 'DIGITAL', point: 'CHISINAU', active: true })).toBe(false);
    expect(canReceiveLinkCode({ role: 'ADMIN', point: 'BALTI', active: true })).toBe(false);
  });
});
