import { describe, expect, it } from 'vitest';
import { faraDiacritice, numePotrivit, textConfirmare, textGaseste, ziOra } from './sms-reguli';

const tur = { lang: 'ro' as const, from: 'Chișinău', to: 'Bălți', departure_at: '2026-10-13T03:55:00Z', cod: 'abc123', locuri: [8] };

describe('sms-reguli', () => {
  it('fără diacritice (SMS GSM-7)', () => { expect(faraDiacritice('Chișinău Bălți Ștefan Țânțăreni')).toBe('Chisinau Balti Stefan Tantareni'); });
  it('ora Chișinăului', () => { expect(ziOra('2026-10-13T03:55:00Z')).toBe('13.10 06:55'); });
  it('confirmarea: cursa, locul, linkul și unde se găsește', () => {
    const t = textConfirmare(tur, null, 'https://translux.md');
    expect(t).toBe('TRANSLUX: bilet platit. Chisinau-Balti 13.10 06:55, loc 8: translux.md/ro/bilet/abc123\nAi pierdut linkul? translux.md > «Gaseste biletul meu».');
    expect(/[ăâîșțĂÂÎȘȚ]/.test(t)).toBe(false);
  });
  it('confirmarea tur-retur are și returul', () => {
    const t = textConfirmare(tur, { ...tur, from: 'Bălți', to: 'Chișinău', departure_at: '2026-10-15T14:00:00Z', cod: 'def', locuri: [] }, 'https://translux.md');
    expect(t).toContain('Retur Balti-Chisinau 15.10 17:00: translux.md/ro/bilet/def');
  });
  it('găsește: cel mult 3 bilete', () => {
    const t = textGaseste('ru', [tur, tur, tur, tur].map((b) => ({ ...b, lang: 'ru' as const })), 'https://translux.md');
    expect(t.split('\n')).toHaveLength(4);
    expect(t).toContain('место 8');
  });
});

// Ion, 10.10.2026: «Găsește biletul» pe ecran cât SMS-ul nu e gata — doar telefon + numele de pe bilet.
describe('numePotrivit', () => {
  it('numele de familie, fără diacritice și fără majuscule', () => {
    expect(numePotrivit('Popescu', 'Ion Popescu')).toBe(true);
    expect(numePotrivit('popescu', 'ION POPESCU')).toBe(true);
    expect(numePotrivit('Ţurcanu', 'Ana Țurcanu')).toBe(true);
    expect(numePotrivit('Turcanu', 'Ana Țurcanu')).toBe(true);
  });
  it('numele întreg, în orice ordine', () => {
    expect(numePotrivit('Popescu Ion', 'Ion Popescu')).toBe(true);
  });
  it('alt nume, nume parțial, gol sau o literă → nu', () => {
    expect(numePotrivit('Ionescu', 'Ion Popescu')).toBe(false);
    expect(numePotrivit('Popes', 'Ion Popescu')).toBe(false);
    expect(numePotrivit('', 'Ion Popescu')).toBe(false);
    expect(numePotrivit('P', 'Ion Popescu')).toBe(false);
    expect(numePotrivit('Popescu Maria', 'Ion Popescu')).toBe(false);
  });
  it('rusa', () => {
    expect(numePotrivit('Иванов', 'Иван Иванов')).toBe(true);
    expect(numePotrivit('Петров', 'Иван Иванов')).toBe(false);
  });
});
