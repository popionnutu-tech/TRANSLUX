import { describe, expect, it } from 'vitest';
import {
  IDENTITY_BLOCK_CONFIDENCE,
  IDENTITY_MAX_BLOCKS_PER_DAY,
  IDENTITY_SYSTEM_PROMPT,
  altOmMessage,
  isReferenceWorthy,
  parseIdentityAnswer,
  shouldBlockIdentity,
} from './driverIdentity.js';
import { pickBootstrapCandidates, referenceNeedsRefresh, shrinkReference, MAX_REFERENCES, REFERENCE_MAX_WIDTH, REFERENCE_REFRESH_DAYS } from './driverReferences.js';

const ok = (same: 'da' | 'nesigur' | 'nu', confidence: number) => ({ verdict: 'OK' as const, same, confidence, reason: 'x' });

describe('parseIdentityAnswer', () => {
  it('citește verdictul, încrederea și motivul', () => {
    expect(parseIdentityAnswer('{"aceeasi_persoana":"da","incredere":0.9,"motiv":" aceeași față "}')).toEqual({
      verdict: 'OK',
      same: 'da',
      confidence: 0.9,
      reason: 'aceeași față',
    });
  });

  it('încrederea se taie la 0..1', () => {
    expect(parseIdentityAnswer('{"aceeasi_persoana":"nu","incredere":7,"motiv":""}')).toMatchObject({ confidence: 1 });
  });

  it('JSON stricat, verdict necunoscut sau încredere lipsă → EROARE', () => {
    expect(parseIdentityAnswer('nu e json').verdict).toBe('EROARE');
    expect(parseIdentityAnswer('[]').verdict).toBe('EROARE');
    expect(parseIdentityAnswer('{"aceeasi_persoana":"poate","incredere":0.5,"motiv":""}').verdict).toBe('EROARE');
    expect(parseIdentityAnswer('{"aceeasi_persoana":"nu","motiv":""}').verdict).toBe('EROARE');
  });
});

describe('shouldBlockIdentity — «nu rigid» (Ion, 19.09)', () => {
  it('refuză doar «nu» sigur', () => {
    expect(shouldBlockIdentity(ok('nu', 0.8), 0)).toBe(true);
    expect(shouldBlockIdentity(ok('nu', IDENTITY_BLOCK_CONFIDENCE), 0)).toBe(true);
    expect(shouldBlockIdentity(ok('nu', IDENTITY_BLOCK_CONFIDENCE - 0.01), 0)).toBe(false);
  });

  it('«nesigur» și «da» trec întotdeauna', () => {
    expect(shouldBlockIdentity(ok('nesigur', 1), 0)).toBe(false);
    expect(shouldBlockIdentity(ok('da', 1), 0)).toBe(false);
  });

  it('modelul căzut → trece', () => {
    expect(shouldBlockIdentity({ verdict: 'EROARE', description: 'x' }, 0)).toBe(false);
  });

  it('după numărul maxim de refuzuri pe zi, poza trece (marcată)', () => {
    expect(shouldBlockIdentity(ok('nu', 0.9), IDENTITY_MAX_BLOCKS_PER_DAY - 1)).toBe(true);
    expect(shouldBlockIdentity(ok('nu', 0.9), IDENTITY_MAX_BLOCKS_PER_DAY)).toBe(false);
  });
});

describe('isReferenceWorthy', () => {
  it('doar «da» sigur devine referință', () => {
    expect(isReferenceWorthy(ok('da', 0.9))).toBe(true);
    expect(isReferenceWorthy(ok('da', 0.5))).toBe(false);
    expect(isReferenceWorthy(ok('nesigur', 0.9))).toBe(false);
    expect(isReferenceWorthy({ verdict: 'EROARE', description: 'x' })).toBe(false);
  });
});

describe('altOmMessage', () => {
  it('numește șoferul și spune ce a văzut modelul', () => {
    expect(altOmMessage('Danilov Ivan', 'față mai lată')).toBe(
      'Persoana din poză nu pare a fi șoferul Danilov Ivan (față mai lată). Refă poza cu șoferul Danilov Ivan.',
    );
    expect(altOmMessage(null, '')).toBe('Persoana din poză nu pare a fi șoferul de pe cursă. Refă poza cu șoferul de pe cursă.');
  });
});

describe('promptul de identitate', () => {
  it('nu identifică după nume și cere «nu» doar când e limpede', () => {
    expect(IDENTITY_SYSTEM_PROMPT).toContain('Nu identifici pe nimeni după nume');
    expect(IDENTITY_SYSTEM_PROMPT).toContain('Nu fi rigid');
    expect(IDENTITY_SYSTEM_PROMPT).toContain('«nesigur»');
  });
});

describe('pickBootstrapCandidates', () => {
  const p = (check_date: string, created_at: string, id = `${check_date}-${created_at}`) => ({ id, check_date, storage_key: `k/${id}`, created_at });

  it('cel mult una pe zi (cea mai nouă), zilele cele mai noi primele, tăiate la max', () => {
    const out = pickBootstrapCandidates(
      [p('2026-09-10', '2026-09-10T06:00Z'), p('2026-09-10', '2026-09-10T09:00Z'), p('2026-09-12', '2026-09-12T06:00Z'), p('2026-09-09', '2026-09-09T06:00Z')],
      2,
    );
    expect(out.map((o) => o.id)).toEqual(['2026-09-12-2026-09-12T06:00Z', '2026-09-10-2026-09-10T09:00Z']);
  });
});

describe('referenceNeedsRefresh', () => {
  const ref = (check_date: string) => ({ id: check_date, driver_id: 'd', storage_key: 'k', source_check_id: null, check_date, source: 'match' as const, created_at: '' });
  const full = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'].slice(0, MAX_REFERENCES).map(ref);

  it('sub maxim → da; pline și proaspete → nu; pline dar vechi → da', () => {
    expect(referenceNeedsRefresh(full.slice(0, MAX_REFERENCES - 1), '2026-09-14')).toBe(true);
    expect(referenceNeedsRefresh(full, '2026-09-14')).toBe(false);
    const old = new Date(Date.parse('2026-09-13') + REFERENCE_REFRESH_DAYS * 86_400_000).toISOString().slice(0, 10);
    expect(referenceNeedsRefresh(full, old)).toBe(true);
  });
});

describe('shrinkReference', () => {
  it('micșorează un JPEG mare la lățimea de referință', async () => {
    const sharp = (await import('sharp')).default;
    const big = await sharp({ create: { width: 1280, height: 1700, channels: 3, background: '#888888' } }).jpeg().toBuffer();
    const small = await shrinkReference(big);
    const meta = await sharp(small).metadata();
    expect(meta.width).toBe(REFERENCE_MAX_WIDTH);
    expect(small.length).toBeLessThan(big.length);
  });

  it('nu mărește o poză deja mică și întoarce originalul când nu e imagine', async () => {
    const sharp = (await import('sharp')).default;
    const tiny = await sharp({ create: { width: 300, height: 400, channels: 3, background: '#888888' } }).jpeg().toBuffer();
    expect((await sharp(await shrinkReference(tiny)).metadata()).width).toBe(300);
    const garbage = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(await shrinkReference(garbage)).toBe(garbage);
  });
});
