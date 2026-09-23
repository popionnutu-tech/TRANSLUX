import { describe, expect, it } from 'vitest';
import { phoneTel, phoneText } from './phone';

describe('phone — mereu +373', () => {
  it('orice formă moldovenească devine +373 XX XXX XXX', () => {
    for (const raw of ['069123456', '37369123456', '+37369123456', '+373 69 123 456', '69123456']) {
      expect(phoneText(raw)).toBe('+373 69 123 456');
      expect(phoneTel(raw)).toBe('tel:+37369123456');
    }
  });
  it('linia companiei', () => {
    expect(phoneText('060401010')).toBe('+373 60 401 010');
  });
  it('un număr străin rămâne neatins', () => {
    expect(phoneText('+40 721 000 000')).toBe('+40 721 000 000');
    expect(phoneTel('+40 721 000 000')).toBe('tel:+40721000000');
  });
});
