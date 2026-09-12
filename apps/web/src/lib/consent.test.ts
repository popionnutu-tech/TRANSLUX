import { describe, expect, it } from 'vitest';
import { CONSENT_VERSION, parseConsent, serializeConsent } from './consent';

describe('consent cookie', () => {
  it('round-trips a confirmed notice', () => {
    const ts = '2026-09-12T10:00:00.000Z';
    const raw = serializeConsent({ v: CONSENT_VERSION, ts, analytics: null });
    expect(parseConsent(raw)).toEqual({ v: CONSENT_VERSION, ts, analytics: null });
  });

  it('keeps an explicit analytics choice', () => {
    const raw = serializeConsent({ v: CONSENT_VERSION, ts: '2026-09-12T10:00:00.000Z', analytics: false });
    expect(parseConsent(raw)?.analytics).toBe(false);
  });

  it('rejects garbage, other versions and bad timestamps', () => {
    expect(parseConsent(null)).toBeNull();
    expect(parseConsent('')).toBeNull();
    expect(parseConsent('not-json')).toBeNull();
    expect(parseConsent(encodeURIComponent(JSON.stringify({ v: 99, ts: '2026-09-12T10:00:00.000Z' })))).toBeNull();
    expect(parseConsent(encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, ts: 'yesterday' })))).toBeNull();
    expect(parseConsent(encodeURIComponent('[1,2]'))).toBeNull();
  });

  it('treats a non-boolean analytics field as undecided', () => {
    const raw = encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, ts: '2026-09-12T10:00:00.000Z', analytics: 'yes' }));
    expect(parseConsent(raw)?.analytics).toBeNull();
  });
});
