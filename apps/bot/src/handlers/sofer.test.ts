import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ getSupabase: () => { throw new Error('fără bază în teste'); } }));

const { deciziaLegarii, esteStartSofer } = await import('./sofer.js');

const ME = 555;
const sofer = (id: string, telegram_id: number | null = null) => ({ id, full_name: `Șofer ${id}`, telegram_id });

describe('esteStartSofer', () => {
  it('doar payload-ul «sofer», indiferent de spații/majuscule', () => {
    expect(esteStartSofer('sofer')).toBe(true);
    expect(esteStartSofer(' Sofer ')).toBe(true);
    expect(esteStartSofer('bilet_0123456789abcdef0123456789abcdef')).toBe(false);
    expect(esteStartSofer('abc123invite')).toBe(false);
    expect(esteStartSofer(undefined)).toBe(false);
  });
});

describe('deciziaLegarii', () => {
  it('contactul altcuiva (sau fără user_id) → contact_strain, înainte de orice potrivire', () => {
    expect(deciziaLegarii({ phone_number: '+37369123456', user_id: 777 }, ME, [sofer('a')])).toEqual({ ok: false, motiv: 'contact_strain', telefon: null });
    expect(deciziaLegarii({ phone_number: '+37369123456' }, ME, [sofer('a')])).toEqual({ ok: false, motiv: 'contact_strain', telefon: null });
  });
  it('telefon care nu e mobil moldovenesc → telefon_invalid', () => {
    expect(deciziaLegarii({ phone_number: '+40721000000', user_id: ME }, ME, [])).toMatchObject({ ok: false, motiv: 'telefon_invalid' });
  });
  it('numărul se normalizează (+373 cu spații, 0-prefix) și 0 potriviri → nepotrivit', () => {
    expect(deciziaLegarii({ phone_number: '+373 69 123 456', user_id: ME }, ME, [])).toEqual({ ok: false, motiv: 'nepotrivit', telefon: '37369123456' });
    expect(deciziaLegarii({ phone_number: '069123456', user_id: ME }, ME, [])).toEqual({ ok: false, motiv: 'nepotrivit', telefon: '37369123456' });
  });
  it('doi șoferi activi cu același număr → multiplu', () => {
    expect(deciziaLegarii({ phone_number: '37369123456', user_id: ME }, ME, [sofer('a'), sofer('b')])).toMatchObject({ ok: false, motiv: 'multiplu' });
  });
  it('șoferul are deja alt Telegram → deja_legat', () => {
    expect(deciziaLegarii({ phone_number: '37369123456', user_id: ME }, ME, [sofer('a', 999)])).toMatchObject({ ok: false, motiv: 'deja_legat' });
  });
  it('un singur șofer, nelegat → ok; același Telegram deja pus → ok, dejaAcelasi', () => {
    expect(deciziaLegarii({ phone_number: '37369123456', user_id: ME }, ME, [sofer('a')])).toEqual({ ok: true, sofer: sofer('a'), telefon: '37369123456', dejaAcelasi: false });
    expect(deciziaLegarii({ phone_number: '37369123456', user_id: ME }, ME, [sofer('a', ME)])).toMatchObject({ ok: true, dejaAcelasi: true });
  });
});
