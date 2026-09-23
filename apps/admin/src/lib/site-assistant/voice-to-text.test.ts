import { describe, expect, it } from 'vitest';
import { formatPhone, unspell, voiceResultToText } from './voice-to-text';
import { timeSpoken } from '@/lib/time-spoken';
import { phoneSpoken } from '@/lib/phone-spoken';

describe('voice-to-text', () => {
  it('formatează numerele moldovenești, refuză restul', () => {
    expect(formatPhone('+37369123456')).toBe('+373 69 123 456');
    expect(formatPhone('069123456')).toBe('+373 69 123 456');
    expect(formatPhone('12345')).toBeNull();
  });

  it('pune la loc orele scrise de timeSpoken, în ambele limbi', () => {
    for (const t of ['07:30', '20:05', '21:00', '00:00', '13:47']) {
      const s = timeSpoken(t)!;
      expect(unspell(`Cursa de ${s.ro} circulă.`, [])).toBe(`Cursa de ${t} circulă.`);
      expect(unspell(`Рейс в ${s.ru} будет.`, [])).toBe(`Рейс в ${t} будет.`);
    }
  });

  it('20:05 nu devine 20:00 + «zero cinci» (cea mai lungă formă câștigă)', () => {
    const s = timeSpoken('20:05')!.ro;
    expect(unspell(s, [])).toBe('20:05');
  });

  it('nu atinge cuvinte care doar încep ca o oră', () => {
    expect(unspell('Doisprezece pasageri', [])).toBe('Doisprezece pasageri');
  });

  it('numărul din rezultat devine cifre, câmpurile *_spoken_* dispar', () => {
    const phone = '+37369123456';
    const out = voiceResultToText({
      count: 1,
      driver_line_ro: `Șoferul cursei de ${timeSpoken('07:30')!.ro} este Ion. Numărul lui: ${phoneSpoken(phone)!.ro}.`,
      trips: [{ departure: '07:30', departure_spoken_ro: 'x', phone, phone_spoken_ro: 'y' }],
    }) as Record<string, unknown>;
    expect(out.driver_line_ro).toBe('Șoferul cursei de 07:30 este Ion. Numărul lui: +373 69 123 456.');
    expect(out.trips).toEqual([{ departure: '07:30', phone: '+373 69 123 456' }]);
  });

  it('un număr care nu e în rezultat rămâne în cuvinte (nu se ghicește nimic)', () => {
    const spoken = phoneSpoken('069000111')!.ro;
    const out = voiceResultToText({ line: spoken }) as Record<string, string>;
    expect(out.line).toBe(spoken);
  });
});
