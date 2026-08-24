import { describe, it, expect } from 'vitest';
import { dateSpoken, resolveVoiceDate } from './date-spoken';

describe('dateSpoken', () => {
  it('marchează ziua curentă drept «azi» / «сегодня» (apelul Bălți→Ocnița, 24.08)', () => {
    expect(dateSpoken('2026-08-24', '2026-08-24')).toEqual({
      ro: 'azi, douăzeci și patru august',
      ru: 'сегодня, двадцать четвёртого августа',
    });
  });

  it('ziua următoare e «mâine» / «завтра»', () => {
    expect(dateSpoken('2026-08-25', '2026-08-24')).toEqual({
      ro: 'mâine, douăzeci și cinci august',
      ru: 'завтра, двадцать пятого августа',
    });
  });

  it('peste graniță de lună zilele rămân corecte', () => {
    expect(dateSpoken('2026-09-01', '2026-08-31')).toEqual({
      ro: 'mâine, întâi septembrie',
      ru: 'завтра, первого сентября',
    });
  });

  it('mai departe de o zi primește ziua săptămânii', () => {
    // 2026-08-27 e joi.
    expect(dateSpoken('2026-08-27', '2026-08-24')).toEqual({
      ro: 'joi, douăzeci și șapte august',
      ru: 'четверг, двадцать седьмого августа',
    });
  });

  it('ziua trecută e «ieri» / «вчера»', () => {
    expect(dateSpoken('2026-08-23', '2026-08-24')).toEqual({
      ro: 'ieri, douăzeci și trei august',
      ru: 'вчера, двадцать третьего августа',
    });
  });

  it('data invalidă dă null', () => {
    expect(dateSpoken('2026-02-31', '2026-02-28')).toBeNull();
    expect(dateSpoken('maine', '2026-08-24')).toBeNull();
  });
});

describe('resolveVoiceDate', () => {
  const TODAY = '2026-08-24'; // luni

  it('fără valoare ia ziua de azi', () => {
    expect(resolveVoiceDate(undefined, TODAY)).toBe(TODAY);
    expect(resolveVoiceDate('', TODAY)).toBe(TODAY);
  });

  it('cuvintele relative, în ambele limbi', () => {
    expect(resolveVoiceDate('azi', TODAY)).toBe('2026-08-24');
    expect(resolveVoiceDate('сегодня', TODAY)).toBe('2026-08-24');
    expect(resolveVoiceDate('mâine', TODAY)).toBe('2026-08-25');
    expect(resolveVoiceDate('завтра', TODAY)).toBe('2026-08-25');
    expect(resolveVoiceDate('poimâine', TODAY)).toBe('2026-08-26');
    expect(resolveVoiceDate('послезавтра', TODAY)).toBe('2026-08-26');
  });

  it('prepoziția rostită nu strică rezolvarea', () => {
    expect(resolveVoiceDate('pe mâine', TODAY)).toBe('2026-08-25');
    expect(resolveVoiceDate('в субботу', TODAY)).toBe('2026-08-29');
  });

  it('ziua săptămânii merge la următoarea apariție, niciodată azi', () => {
    expect(resolveVoiceDate('sâmbătă', TODAY)).toBe('2026-08-29');
    expect(resolveVoiceDate('среду', TODAY)).toBe('2026-08-26');
    // Azi e luni: «luni» = lunea viitoare, nu azi.
    expect(resolveVoiceDate('luni', TODAY)).toBe('2026-08-31');
  });

  it('zi-lună primește anul de la server, cu rostogolire în anul următor', () => {
    expect(resolveVoiceDate('30.08', TODAY)).toBe('2026-08-30');
    expect(resolveVoiceDate('01-09', TODAY)).toBe('2026-09-01');
    // 20 august a trecut deja în 2026.
    expect(resolveVoiceDate('20.08', TODAY)).toBe('2027-08-20');
  });

  it('YYYY-MM-DD valid trece neatins, invalid cade pe azi', () => {
    expect(resolveVoiceDate('2026-09-15', TODAY)).toBe('2026-09-15');
    expect(resolveVoiceDate('2026-02-31', TODAY)).toBe(TODAY);
    expect(resolveVoiceDate('2026-8-25', TODAY)).toBe(TODAY);
    expect(resolveVoiceDate('cândva', TODAY)).toBe(TODAY);
  });
});

describe('resolveVoiceDate — doar ziua, fără lună și an', () => {
  it('ziua din luna curentă, dacă nu a trecut', () => {
    expect(resolveVoiceDate('30', '2026-08-24')).toBe('2026-08-30');
    expect(resolveVoiceDate('31', '2026-08-24')).toBe('2026-08-31');
  });

  it('ziua de azi rămâne azi', () => {
    expect(resolveVoiceDate('24', '2026-08-24')).toBe('2026-08-24');
  });

  it('ziua deja trecută trece în luna următoare', () => {
    expect(resolveVoiceDate('3', '2026-08-24')).toBe('2026-09-03');
    expect(resolveVoiceDate('01', '2026-08-24')).toBe('2026-09-01');
  });

  it('sare peste lunile care nu au ziua cerută', () => {
    // Februarie 2027 are 28 de zile: «31» din 30 ianuarie = 31 martie.
    expect(resolveVoiceDate('31', '2027-01-30')).toBe('2027-01-31');
    expect(resolveVoiceDate('31', '2027-02-01')).toBe('2027-03-31');
    // 29 februarie există doar în ani bisecți: 2027 nu e, 2028 da.
    expect(resolveVoiceDate('29', '2027-03-01')).toBe('2027-03-29');
    expect(resolveVoiceDate('30', '2026-12-31')).toBe('2027-01-30');
  });

  it('ziua peste an trece corect', () => {
    expect(resolveVoiceDate('5', '2026-12-31')).toBe('2027-01-05');
  });

  it('numere imposibile cad pe azi', () => {
    expect(resolveVoiceDate('32', '2026-08-24')).toBe('2026-08-24');
    expect(resolveVoiceDate('0', '2026-08-24')).toBe('2026-08-24');
  });
});
