import { describe, it, expect } from 'vitest';
import { isWithinGrace, GRACE_MINUTES } from './calculation';

describe('isWithinGrace', () => {
  const now = new Date('2026-06-10T10:00:00.000Z');

  it('NULL completed_at => expirat (sesiuni vechi)', () => {
    expect(isWithinGrace(null, now)).toBe(false);
  });

  it('în fereastră la 9 min 59 s după finalizare', () => {
    expect(isWithinGrace('2026-06-10T09:50:01.000Z', now)).toBe(true);
  });

  it('expirat la exact 10:00 după finalizare (limită strictă)', () => {
    expect(isWithinGrace('2026-06-10T09:50:00.000Z', now)).toBe(false);
  });

  it('expirat la 10 min 1 s după finalizare', () => {
    expect(isWithinGrace('2026-06-10T09:49:59.000Z', now)).toBe(false);
  });

  it('imediat după finalizare => în fereastră', () => {
    expect(isWithinGrace(now.toISOString(), now)).toBe(true);
  });

  it('timestamp invalid => expirat', () => {
    expect(isWithinGrace('not-a-date', now)).toBe(false);
  });

  it('GRACE_MINUTES este 10', () => {
    expect(GRACE_MINUTES).toBe(10);
  });
});
