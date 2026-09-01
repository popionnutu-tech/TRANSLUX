import { describe, it, expect, vi } from 'vitest';
vi.mock('../supabase', () => ({ getSupabase: () => ({}) }));
import { toMinutes, normPlate, normName, uniqueDrivers, type Candidate } from './trip-identify';

// Funcțiile au fost MUTATE din route-ul find-past-trip fără schimbare de
// comportament; testele fixează exact acel comportament, ca mutarea să nu poată
// aluneca pe viitor.
const c = (over: Partial<Candidate>): Candidate => ({
  driver_id: null, departure: null, route_ro: null, route_ru: null,
  driver: null, phone: null, plate: null, ...over,
});

describe('toMinutes', () => {
  it('acceptă formele pe care clientul le rostește la fel', () => {
    expect(toMinutes('11:20')).toBe(680);
    expect(toMinutes('11.20')).toBe(680);
    expect(toMinutes('11 20')).toBe(680);
  });
  it('respinge orele imposibile și textul', () => {
    expect(toMinutes('24:00')).toBeNull();
    expect(toMinutes('11:70')).toBeNull();
    expect(toMinutes('pe la unsprezece')).toBeNull();
  });
});

describe('normPlate / normName', () => {
  it('plăcuța rămâne doar litere și cifre, majuscule', () => {
    expect(normPlate('c aa-123 ')).toBe('CAA123');
  });
  it('numele își pierde diacriticele, ca potrivirea să nu depindă de ele', () => {
    expect(normName(' Ștefan Țincu ')).toBe('stefan tincu');
  });
});

describe('uniqueDrivers', () => {
  it('un șofer pe tur ȘI retur rămâne UN singur candidat', () => {
    const { uniquePhones, withPhone } = uniqueDrivers([
      c({ phone: '069000001', departure: '06:55' }),
      c({ phone: '069000001', departure: '15:30' }),
    ]);
    expect(uniquePhones).toHaveLength(1);
    expect(withPhone).toHaveLength(2);
  });
  it('șoferii fără telefon nu sunt candidați', () => {
    const { uniquePhones } = uniqueDrivers([c({ phone: null }), c({ phone: '069000002' })]);
    expect(uniquePhones).toEqual(['069000002']);
  });
  it('doi oameni diferiți rămân doi', () => {
    const { uniquePhones } = uniqueDrivers([c({ phone: '069000001' }), c({ phone: '069000002' })]);
    expect(uniquePhones).toHaveLength(2);
  });
});
