import { describe, expect, it } from 'vitest';
import {
  BUTOANE, lei, minuteValabile, telefonAfisat, textFaraBani, textIntarziat, textOferta, textStare, TELEFON_DISPECERAT,
} from './retur-texte.js';

const OFERTA = {
  oferta_id: '11111111-2222-3333-4444-555555555555', suma: 120, total: 270, noimi: 8,
  expira_la: '2026-10-13T20:15:00Z', departure_at: '2026-10-14T05:45:00+03:00', from_name: 'Briceni', to_name: 'Chișinău', lang: 'ro' as const,
};
const ACUM = Date.parse('2026-10-13T20:00:00Z');

describe('textStare (ce promite botul pe fiecare stare)', () => {
  it('creat și finalizat: anulat + banca a primit cererea de N lei, pe cardul plătitor', () => {
    for (const stare of ['creat', 'finalizat'] as const) {
      const m = textStare({ stare, suma: 120 }, 'ro');
      expect(m.text).toBe('Biletul e anulat. Banca a primit cererea de returnare a 120 lei; banii ajung pe cardul cu care ai plătit.');
      expect(m.cuVerificare).toBe(false);
    }
    expect(textStare({ stare: 'creat', suma: 120 }, 'ru').text).toContain('120 лей');
  });
  it('necunoscut / nedeterminat / in_curs: fără promisiuni, cu «Verifică starea»', () => {
    for (const stare of ['necunoscut', 'nedeterminat', 'in_curs'] as const) {
      const m = textStare({ stare, suma: 120 }, 'ro');
      expect(m.cuVerificare).toBe(true);
      expect(m.text).not.toMatch(/Banca a primit/);
    }
  });
  it('refuz: motivul; «biletele rămân valabile» la bancă, nu la biletul urcat', () => {
    expect(textStare({ stare: 'refuz', suma: 90, motiv: 'maib' }, 'ro').text).toBe('Banca a refuzat returnarea. Biletele rămân valabile.');
    expect(textStare({ stare: 'refuz', suma: 90, motiv: 'inchis' }, 'ro').text).toMatch(/^Cu mai puțin de 4 ore/);
    const urcat = textStare({ stare: 'refuz', suma: 90, motiv: 'BILET_URCAT' }, 'ro').text;
    expect(urcat).toMatch(/scanat la urcare/);
    expect(urcat).not.toMatch(/rămân valabile/);
    expect(textStare({ stare: 'refuz', suma: null }, 'ro').text).toContain(TELEFON_DISPECERAT);
  });
  it('refuz_banca: dispecerul se ocupă, fără buton', () => {
    expect(textStare({ stare: 'refuz_banca', suma: 120 }, 'ro')).toEqual({ text: 'Banca n-a făcut returnarea automat; dispecerul se ocupă și te contactează.', cuVerificare: false });
  });
});

describe('textOferta', () => {
  it('RO: cursa, suma din total, 15 minute cu ora-limită (Chișinău)', () => {
    const t = textOferta(OFERTA, ACUM);
    expect(t).toContain('Briceni → Chișinău');
    expect(t).toContain('Primești înapoi 120 lei din 270 lei.');
    expect(t).toContain('Suma e valabilă 15 minute (până la 23:15)');
    expect(t).not.toContain('s-a schimbat');
  });
  it('suma schimbată: prima linie o spune; RU în rusă', () => {
    expect(textOferta(OFERTA, ACUM, true).split('\n')[0]).toBe('Suma s-a schimbat, uite noua sumă.');
    expect(textOferta({ ...OFERTA, lang: 'ru' }, ACUM)).toContain('Вернём 120 лей из 270 лей.');
  });
  it('valabilitatea scurtată de pragul de 4 h se arată ca minute rămase', () => {
    expect(minuteValabile('2026-10-13T20:07:30Z', ACUM)).toBe(7);
    expect(minuteValabile('2026-10-13T19:59:00Z', ACUM)).toBe(1);
  });
  it('butonul de confirmare cu suma', () => {
    expect(BUTOANE.anuleaza(120).ro).toBe('Anulează biletul și primește 120 lei');
    expect(lei(67.5)).toBe('67,50');
  });
});

describe('fără bani și întârziat', () => {
  it('sub 4 h / plecat → textul cerut; urcat → altul', () => {
    expect(textFaraBani('sub_4h', 'ro')).toBe('Cu mai puțin de 4 ore înainte de plecare biletul nu se mai returnează. Dacă ai întârziat, biletul e valabil azi pe altă cursă TRANSLUX în aceeași direcție, dacă șoferul are loc.');
    expect(textFaraBani('plecat', 'ro')).toBe(textFaraBani('sub_4h', 'ro'));
    expect(textFaraBani('urcat', 'ro')).toMatch(/scanat/);
  });
  it('telefonul șoferului doar dacă e un mobil moldovenesc, în formatul +373', () => {
    expect(telefonAfisat('37369123456')).toBe('+373 69 123 456');
    expect(telefonAfisat('069123456')).toBe('+373 69 123 456');
    expect(telefonAfisat('12345')).toBeNull();
    expect(textIntarziat('37369123456', 'ro')).toContain('Telefonul șoferului cursei tale: +373 69 123 456');
    expect(textIntarziat(null, 'ro')).not.toContain('Telefonul');
  });
});
