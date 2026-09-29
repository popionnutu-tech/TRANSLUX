import { describe, expect, it } from 'vitest';
import { intrebareCatreBot } from './camioaneTrasee.js';
import { CAMIOANE_SCHELET_FISA } from './camioaneFisa.js';

const BOT = 777; const USER = 'translux_bot';

describe('intrebareCatreBot (ION-144)', () => {
  it('menționarea botului', () => {
    const text = '@translux_bot cum merg de la Petromidia la Bălți?';
    expect(intrebareCatreBot({ text, entities: [{ type: 'mention', offset: 0, length: 13 }] }, BOT, USER)).toBe('cum merg de la Petromidia la Bălți?');
  });
  it('răspuns la un mesaj al botului', () => {
    expect(intrebareCatreBot({ text: 'și înapoi gol?', reply_to_message: { from: { id: BOT }, text: '...' } }, BOT, USER)).toBe('și înapoi gol?');
  });
  it('/traseu', () => {
    expect(intrebareCatreBot({ text: '/traseu@translux_bot Constanța → Ungheni' }, BOT, USER)).toBe('Constanța → Ungheni');
    expect(intrebareCatreBot({ text: '/traseu' }, BOT, USER)).toBeNull();
  });
  it('mesajele obișnuite din grupă nu sunt pentru bot', () => {
    expect(intrebareCatreBot({ text: 'am ajuns la vamă' }, BOT, USER)).toBeNull();
    expect(intrebareCatreBot({ text: 'ok', reply_to_message: { from: { id: 5 } } }, BOT, USER)).toBeNull();
    expect(intrebareCatreBot({ text: '@alt_om salut', entities: [{ type: 'mention', offset: 0, length: 7 }] }, BOT, USER)).toBeNull();
  });
});

describe('fișa scheletului', () => {
  it('are regulile și traseele principale', () => {
    expect(CAMIOANE_SCHELET_FISA).toContain('DOAR Giurgiulești și Albița');
    expect(CAMIOANE_SCHELET_FISA).toContain('Port Constanța → Bacioi');
    expect(CAMIOANE_SCHELET_FISA).toContain('B3 ·');
    expect(CAMIOANE_SCHELET_FISA).toContain('Vinița');
  });
});
