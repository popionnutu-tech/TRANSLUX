import { describe, it, expect } from 'vitest';
import { dateSpoken, resolveVoiceDate, resolveVoiceDatePast } from './date-spoken';

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

// ---- Rezolvarea ÎNAPOI (lucruri uitate) ----
// 2026-08-30 e duminică.
describe('resolveVoiceDatePast', () => {
  const TODAY = '2026-08-30';

  it('«ieri»/«вчера»/«alaltăieri»/«позавчера» merg înapoi', () => {
    expect(resolveVoiceDatePast('ieri', TODAY)).toBe('2026-08-29');
    expect(resolveVoiceDatePast('вчера', TODAY)).toBe('2026-08-29');
    expect(resolveVoiceDatePast('alaltăieri', TODAY)).toBe('2026-08-28');
    expect(resolveVoiceDatePast('позавчера', TODAY)).toBe('2026-08-28');
  });

  it('«azi» sau nimic rostit cad pe azi (obiectul se uită cel mai des azi)', () => {
    expect(resolveVoiceDatePast('azi', TODAY)).toBe(TODAY);
    expect(resolveVoiceDatePast('', TODAY)).toBe(TODAY);
    expect(resolveVoiceDatePast(undefined, TODAY)).toBe(TODAY);
  });

  it('rostit dar nerecunoscut → null, nu «azi» tăcut (audit H2: azi ar da alt șofer)', () => {
    expect(resolveVoiceDatePast('cândva', TODAY)).toBe(null);
    expect(resolveVoiceDatePast('acum trei zile', TODAY)).toBe(null);
    expect(resolveVoiceDatePast('32', TODAY)).toBe(null);
  });

  it('ziua săptămânii = cea mai recentă apariție, azi inclus', () => {
    expect(resolveVoiceDatePast('sâmbătă', TODAY)).toBe('2026-08-29');
    expect(resolveVoiceDatePast('в субботу', TODAY)).toBe('2026-08-29');
    // Duminică rostit duminica = azi, nu acum o săptămână.
    expect(resolveVoiceDatePast('duminică', TODAY)).toBe(TODAY);
    expect(resolveVoiceDatePast('luni', TODAY)).toBe('2026-08-24');
  });

  it('doar numărul zilei = cea mai recentă zi cu acest număr, ÎNAPOI (nu 22 septembrie!)', () => {
    expect(resolveVoiceDatePast('22', '2026-08-24')).toBe('2026-08-22');
    expect(resolveVoiceDatePast('24', '2026-08-24')).toBe('2026-08-24');
    // Peste graniță de lună: «31» rostit pe 2 septembrie = 31 august.
    expect(resolveVoiceDatePast('31', '2026-09-02')).toBe('2026-08-31');
  });

  it('zi.lună: viitorul cade pe anul trecut', () => {
    expect(resolveVoiceDatePast('22.08', TODAY)).toBe('2026-08-22');
    expect(resolveVoiceDatePast('15.12', TODAY)).toBe('2025-12-15');
  });

  it('ISO trecut trece, ISO VIITOR se taie la azi (modelul nu știe ce zi e), invalid → null', () => {
    expect(resolveVoiceDatePast('2026-08-25', TODAY)).toBe('2026-08-25');
    expect(resolveVoiceDatePast('2026-09-05', TODAY)).toBe(TODAY);
    expect(resolveVoiceDatePast('2026-02-31', TODAY)).toBe(null);
  });
});
