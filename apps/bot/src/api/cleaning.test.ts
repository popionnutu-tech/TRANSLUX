import { describe, expect, it } from 'vitest';
import { ApiError } from './errors.js';
import { MAX_PHOTO_BYTES, decodeJpegBase64, isJpeg, parseCoords } from './photo.js';
import { parseDriverAnswer } from '../services/driverCheck.js';
import { PHOTO_RETENTION_DAYS, chunk, retentionCutoff } from '../services/photoRetention.js';

const jpegBytes = (n = 16) => {
  const b = Buffer.alloc(n, 0x11);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  return b;
};
const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return `${e.status} ${e.code}`;
    throw e;
  }
  return 'no error';
};

describe('isJpeg', () => {
  it('FF D8 FF → JPEG', () => {
    expect(isJpeg(jpegBytes())).toBe(true);
  });
  it('PNG, gol, prea scurt → nu', () => {
    expect(isJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(false);
    expect(isJpeg(Buffer.alloc(0))).toBe(false);
    expect(isJpeg(Buffer.from([0xff, 0xd8]))).toBe(false);
  });
});

describe('decodeJpegBase64', () => {
  it('base64 de JPEG → același Buffer; acceptă prefixul data:', () => {
    const src = jpegBytes(32);
    expect(decodeJpegBase64(src.toString('base64')).equals(src)).toBe(true);
    expect(decodeJpegBase64(`data:image/jpeg;base64,${src.toString('base64')}`).equals(src)).toBe(true);
  });
  it('lipsă / gol → 400 PHOTO_REQUIRED', () => {
    expect(codeOf(() => decodeJpegBase64(undefined))).toBe('400 PHOTO_REQUIRED');
    expect(codeOf(() => decodeJpegBase64('   '))).toBe('400 PHOTO_REQUIRED');
    expect(codeOf(() => decodeJpegBase64(123))).toBe('400 PHOTO_REQUIRED');
  });
  it('nu e base64 → 400 BAD_PHOTO', () => {
    expect(codeOf(() => decodeJpegBase64('nu-e-base64!!'))).toBe('400 BAD_PHOTO');
  });
  it('PNG → 400 NOT_JPEG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(codeOf(() => decodeJpegBase64(png.toString('base64')))).toBe('400 NOT_JPEG');
  });
  it('peste limită → 400 PHOTO_TOO_LARGE (și la limita reală de 6 MB, fără decodare)', () => {
    const big = jpegBytes(64);
    expect(codeOf(() => decodeJpegBase64(big.toString('base64'), 32))).toBe('400 PHOTO_TOO_LARGE');
    expect(codeOf(() => decodeJpegBase64(jpegBytes(32).toString('base64'), 32))).toBe('no error');
    const huge = 'A'.repeat(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 8);
    expect(codeOf(() => decodeJpegBase64(huge))).toBe('400 PHOTO_TOO_LARGE');
  });
});

describe('parseCoords', () => {
  it('ambele sau niciuna', () => {
    expect(parseCoords({ lat: 47.02, lon: 28.86 })).toEqual({ lat: 47.02, lon: 28.86 });
    expect(parseCoords({})).toEqual({ lat: null, lon: null });
    expect(codeOf(() => parseCoords({ lat: 47 }))).toBe('400 BAD_REQUEST');
    expect(codeOf(() => parseCoords({ lat: '47', lon: 28 }))).toBe('400 BAD_REQUEST');
    expect(codeOf(() => parseCoords({ lat: 95, lon: 28 }))).toBe('400 BAD_REQUEST');
  });
});

describe('parseDriverAnswer', () => {
  it('răspuns complet → OK cu cele trei verdicte', () => {
    const r = parseDriverAnswer(
      JSON.stringify({ persoana_vizibila: true, uniforma: false, aspect_ingrijit: true, descriere: 'Bărbat în tricou negru.' }),
    );
    expect(r).toEqual({ verdict: 'OK', personVisible: true, uniformOk: false, groomedOk: true, description: 'Bărbat în tricou negru.' });
  });
  it('câmp lipsă / tip greșit / JSON stricat / nu obiect → EROARE', () => {
    expect(parseDriverAnswer(JSON.stringify({ persoana_vizibila: true, uniforma: true, descriere: 'x' })).verdict).toBe('EROARE');
    expect(parseDriverAnswer(JSON.stringify({ persoana_vizibila: 'da', uniforma: true, aspect_ingrijit: true, descriere: 'x' })).verdict).toBe('EROARE');
    expect(parseDriverAnswer(JSON.stringify({ persoana_vizibila: true, uniforma: true, aspect_ingrijit: true })).verdict).toBe('EROARE');
    expect(parseDriverAnswer('nu e json').verdict).toBe('EROARE');
    expect(parseDriverAnswer('[]').verdict).toBe('EROARE');
    expect(parseDriverAnswer('null').verdict).toBe('EROARE');
  });
});

describe('retentionCutoff', () => {
  it('exact 30 de zile în urmă, ISO', () => {
    expect(PHOTO_RETENTION_DAYS).toBe(30);
    expect(retentionCutoff(new Date('2026-09-08T03:10:00Z'))).toBe('2026-08-09T03:10:00.000Z');
    expect(retentionCutoff(new Date('2026-03-15T00:00:00Z'), 30)).toBe('2026-02-13T00:00:00.000Z');
  });
  it('o poză de 29 de zile rămâne, una de 31 pică', () => {
    const now = new Date('2026-09-08T03:10:00Z');
    const cutoff = retentionCutoff(now);
    expect('2026-08-10T12:00:00.000Z' < cutoff).toBe(false);
    expect('2026-08-08T12:00:00.000Z' < cutoff).toBe(true);
  });
  it('chunk taie în loturi de mărimea cerută', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });
});
