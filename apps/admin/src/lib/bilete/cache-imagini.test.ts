import { describe, expect, it } from 'vitest';
import { cheieImagine, creeazaCacheImagini } from './cache-imagini';

describe('ION-276: cache-ul pozelor de bilet', () => {
  it('cheia conține starea și ziua Chișinăului: după miezul nopții local cheia se schimbă («Azi» nu rămâne)', () => {
    const inainte = Date.parse('2026-10-06T20:50:00Z'); // 23:50 la Chișinău
    const dupa = Date.parse('2026-10-06T21:10:00Z');    // 00:10 la Chișinău, a doua zi
    expect(cheieImagine('ABC', 1, 'valid', inainte)).toBe('abc:1:valid:2026-10-06');
    expect(cheieImagine('ABC', 1, 'valid', dupa)).toBe('abc:1:valid:2026-10-07');
    expect(cheieImagine('abc', 1, 'urcat', inainte)).not.toBe(cheieImagine('abc', 1, 'valid', inainte));
  });
  it('TTL și LRU: expiră; peste plafon iese cel mai vechi folosit', () => {
    let t = 0;
    const c = creeazaCacheImagini(2, 100, () => t);
    c.set('a', Buffer.from('A')); c.set('b', Buffer.from('B'));
    expect(c.get('a')?.toString()).toBe('A'); // «a» devine cel mai recent
    c.set('c', Buffer.from('C'));              // iese «b»
    expect(c.get('b')).toBeNull();
    expect(c.get('a')?.toString()).toBe('A');
    t = 101;
    expect(c.get('c')).toBeNull();
    expect(c.marime()).toBe(1);
  });
});
