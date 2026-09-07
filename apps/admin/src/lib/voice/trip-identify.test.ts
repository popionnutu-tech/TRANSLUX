import { describe, it, expect, vi } from 'vitest';
vi.mock('../supabase', () => ({ getSupabase: () => ({}) }));
import { toMinutes, normPlate, normName, uniqueDrivers, plateMatches, plateParts, type Candidate } from './trip-identify';

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

describe('plateMatches — ordinea rostită nu contează', () => {
  it('apelul 07.09: «YEK 319» găsește mașina «319YEK»', () => {
    // Cazul real: plăcuța era corectă și mașina activă, dar compararea pe șir
    // («319YEK».includes('YEK319')) era ordine-sensibilă și a golit rezultatul.
    expect(plateMatches('319YEK', normPlate('YEK 319'))).toBe(true);
    expect(plateMatches('319YEK', normPlate('319 YEK'))).toBe(true);
  });

  it('grupul rostit parțial potrivește; cel care lipsește nu constrânge', () => {
    expect(plateMatches('319YEK', '319')).toBe(true);
    expect(plateMatches('319YEK', 'YEK')).toBe(true);
  });

  it('mașina greșită rămâne greșită', () => {
    expect(plateMatches('319YEK', normPlate('BRAT 319'))).toBe(false);
    expect(plateMatches('319BRAT', normPlate('YEK 319'))).toBe(false);
    expect(plateMatches('123ABC', '999')).toBe(false);
  });

  it('fără plăcuță rostită nu filtrează nimic; fără plăcuță în bază nu potrivește', () => {
    expect(plateMatches('319YEK', '')).toBe(true);
    expect(plateMatches(null, '319')).toBe(false);
  });

  it('plateParts separă cifrele de litere', () => {
    expect(plateParts('YEK 319')).toEqual({ digits: '319', letters: 'YEK' });
    expect(plateParts('319-YEK')).toEqual({ digits: '319', letters: 'YEK' });
  });
});
