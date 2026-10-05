import { describe, expect, it } from 'vitest';
import { deciziaRefund } from '@/lib/maib/refund-decizie';
import { poateAnulaPasager } from './refund-reguli';

describe('plasa de timp la returnare: până la 120 min înaintea plecării de la oprirea pasagerului', () => {
  const plecare = '2026-10-14T06:23:00+03:00';
  // ION-244: la limita EXACTĂ se poate (aceeași limită ca grila, care dă 6/9 la exact 4 h); o secundă după — nu.
  it('cu 2 ore și 1 minut înainte → da; exact la 2 ore → da; o secundă după → nu; după → nu', () => {
    expect(poateAnulaPasager(plecare, Date.parse('2026-10-14T04:22:00+03:00'), 120)).toBe(true);
    expect(poateAnulaPasager(plecare, Date.parse('2026-10-14T04:23:00+03:00'), 120)).toBe(true);
    expect(poateAnulaPasager(plecare, Date.parse('2026-10-14T04:23:01+03:00'), 120)).toBe(false);
    expect(poateAnulaPasager(plecare, Date.parse('2026-10-14T07:00:00+03:00'), 120)).toBe(false);
  });
  it('ora nevalidă → nu', () => {
    expect(poateAnulaPasager('x', 0, 120)).toBe(false);
  });
});

describe('deciziaRefund (ce face comanda la fiecare stare maib)', () => {
  it('Accepted → returnata; Rejected/Manual → respins; Created/Requested/Pending/Necunoscut → în curs', () => {
    expect(deciziaRefund('Accepted')).toBe('returnata');
    expect(deciziaRefund('accepted')).toBe('returnata');
    expect(deciziaRefund('Rejected')).toBe('respins');
    expect(deciziaRefund('Manual')).toBe('respins');
    for (const s of ['Created', 'Requested', 'Pending', 'Necunoscut', '']) expect(deciziaRefund(s)).toBe('in_curs');
  });
});
