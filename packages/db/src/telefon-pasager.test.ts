import { describe, expect, it } from 'vitest';
import { formateazaTelefonPasager, normalizeazaTelefonPasager } from './telefon-pasager';

describe('normalizeazaTelefonPasager', () => {
  it('Moldova rămâne implicită', () => {
    expect(normalizeazaTelefonPasager('069 123 456')).toBe('37369123456');
    expect(normalizeazaTelefonPasager('69123456')).toBe('37369123456');
    expect(normalizeazaTelefonPasager('+373 69 123 456')).toBe('37369123456');
    expect(normalizeazaTelefonPasager('0037369123456')).toBe('37369123456');
    expect(normalizeazaTelefonPasager('37369123456')).toBe('37369123456');
  });
  it('alte țări cu prefix (+ sau 00)', () => {
    expect(normalizeazaTelefonPasager('+380 67 123 4567')).toBe('380671234567');
    expect(normalizeazaTelefonPasager('00380671234567')).toBe('380671234567');
    expect(normalizeazaTelefonPasager('+40 721 234 567')).toBe('40721234567');
    expect(normalizeazaTelefonPasager('+49 1512 3456789')).toBe('4915123456789');
  });
  it('refuză ce e ambiguu sau greșit', () => {
    expect(normalizeazaTelefonPasager('067 123 45 67')).toBeNull();   // 10 cifre cu 0, fără prefix
    expect(normalizeazaTelefonPasager('380671234567')).toBeNull();    // fără «+»
    expect(normalizeazaTelefonPasager('+373 69 123 45')).toBeNull();  // prefixul MD cu lungime greșită
    expect(normalizeazaTelefonPasager('+0 123 456 789')).toBeNull();
    expect(normalizeazaTelefonPasager('+1234567')).toBeNull();        // prea scurt
    expect(normalizeazaTelefonPasager('')).toBeNull();
  });
});

describe('formateazaTelefonPasager', () => {
  it('grupează MD și UA, restul cu +', () => {
    expect(formateazaTelefonPasager('37369123456')).toBe('+373 69 123 456');
    expect(formateazaTelefonPasager('380671234567')).toBe('+380 67 123 45 67');
    expect(formateazaTelefonPasager('40721234567')).toBe('+40721234567');
  });
});
