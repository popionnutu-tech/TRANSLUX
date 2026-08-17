import { describe, it, expect } from 'vitest';
import { normalizeDriverPhone, PhoneError } from './driver-phone.js';

describe('normalizeDriverPhone', () => {
  it('acceptă formatele scrise de operatori', () => {
    expect(normalizeDriverPhone('069123456')).toBe('37369123456');
    expect(normalizeDriverPhone('069 12 34 56')).toBe('37369123456');
    expect(normalizeDriverPhone('+373 79 388 205')).toBe('37379388205');
    expect(normalizeDriverPhone('37379388205')).toBe('37379388205');
  });

  it('cere numărul — fără el cursa dispare de pe site', () => {
    expect(() => normalizeDriverPhone('')).toThrow(PhoneError);
    expect(() => normalizeDriverPhone(null)).toThrow(PhoneError);
    expect(() => normalizeDriverPhone('   ')).toThrow(PhoneError);
  });

  it('respinge numerele care nu sunt mobil moldovenesc', () => {
    expect(() => normalizeDriverPhone('022123456')).toThrow(PhoneError);  // fix Chișinău
    expect(() => normalizeDriverPhone('06912345')).toThrow(PhoneError);   // prea scurt
    expect(() => normalizeDriverPhone('0691234567')).toThrow(PhoneError); // prea lung
  });
});
