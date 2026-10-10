import { describe, expect, it } from 'vitest';
import { faraDiacritice, textConfirmare, textGaseste, ziOra } from './sms-reguli';

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
