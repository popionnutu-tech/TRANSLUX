import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ getSupabase: () => { throw new Error('fără bază în teste'); } }));

const {
  soferDinStartInstruit, deciziaInstruit, numeTgSigur, codNou, rezultatLegare, textPuncte, PUNCTE, PUNCTE_VERSIUNE,
  RE_CONFIRMA, RE_DECIZIE,
} = await import('./instruire.js');

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('soferDinStartInstruit', () => {
  it('doar instruit_<uuid>; uuid-ul iese cu litere mici', () => {
    expect(soferDinStartInstruit(`instruit_${ID}`)).toBe(ID);
    expect(soferDinStartInstruit(`instruit_${ID.toUpperCase()}`)).toBe(ID);
    expect(soferDinStartInstruit('instruit_123')).toBeNull();
    expect(soferDinStartInstruit(`instruit_${ID}x`)).toBeNull();
    expect(soferDinStartInstruit('sofer')).toBeNull();
    expect(soferDinStartInstruit(undefined)).toBeNull();
  });
  it('payload-ul încape în limita Telegram (64)', () => {
    expect(`instruit_${ID}`.length).toBeLessThanOrEqual(64);
  });
});

describe('deciziaInstruit', () => {
  it('Telegram-ul șoferului → confirmă', () => {
    expect(deciziaInstruit({ id: ID, telegram_id: 5 }, 5, ID)).toBe('confirma');
  });
  it('Telegram legat de alt șofer → refuz, nu cerere (nu se mută pe ascuns)', () => {
    expect(deciziaInstruit({ id: ID, telegram_id: null }, 5, 'alt')).toBe('alt_sofer');
  });
  it('nelegat, sau șoferul are alt Telegram (și-a schimbat telefonul) → cerere la Iurie', () => {
    expect(deciziaInstruit({ id: ID, telegram_id: null }, 5, null)).toBe('cerere');
    expect(deciziaInstruit({ id: ID, telegram_id: 9 }, 5, null)).toBe('cerere');
  });
});

describe('rezultatLegare — legarea automată și cea manuală se intercalează', () => {
  it('rândul întors = legat; 0 rânduri = s-a legat între timp, fără succes fals', () => {
    expect(rezultatLegare(null, [{ id: ID }])).toBe('ok');
    expect(rezultatLegare(null, [])).toBe('schimbat');
    expect(rezultatLegare(null, null)).toBe('schimbat');
  });
  it('indexul unic (Telegram pe alt șofer) → alt_sofer; altă eroare → eroare', () => {
    expect(rezultatLegare({ message: 'duplicate key value violates unique constraint "drivers_telegram_id_uniq"' }, null)).toBe('alt_sofer');
    expect(rezultatLegare({ message: 'timeout' }, null)).toBe('eroare');
  });
});

describe('numeTgSigur', () => {
  it('escapează HTML, scoate controlul și bidi, taie la 40', () => {
    expect(numeTgSigur('<b>Ion</b>')).toBe('&lt;b&gt;Ion&lt;/b&gt;');
    expect(numeTgSigur('Ion‮Admin\u0007')).toBe('IonAdmin');
    expect(numeTgSigur('x'.repeat(50))).toBe(`${'x'.repeat(40)}…`);
    expect(numeTgSigur('')).toBe('—');
  });
});

describe('codNou', () => {
  it('mereu 4 cifre', () => {
    for (let i = 0; i < 200; i++) expect(codNou()).toMatch(/^\d{4}$/);
  });
});

describe('callback-urile', () => {
  it('confirmarea și decizia acceptă doar forma exactă, sub 64 de octeți', () => {
    expect(RE_CONFIRMA.exec(`instr:ok:${ID}`)?.[1]).toBe(ID);
    expect(RE_CONFIRMA.test(`instr:ok:${ID}:1`)).toBe(false);
    expect(RE_DECIZIE.exec(`lg:${ID}`)?.slice(1)).toEqual([undefined, ID]);
    expect(RE_DECIZIE.exec(`lgno:${ID}`)?.slice(1)).toEqual(['no', ID]);
    expect(RE_DECIZIE.test(`lg:${ID}:123`)).toBe(false);
    expect(Buffer.byteLength(`instr:ok:${ID}`)).toBeLessThanOrEqual(64);
  });
});

describe('textPuncte', () => {
  it('10 puncte bilingve cu versiunea; numele escapat', () => {
    expect(PUNCTE).toHaveLength(10);
    const t = textPuncte('<Ion>');
    expect(t).toContain('&lt;Ion&gt;');
    expect(t).toContain(`(v${PUNCTE_VERSIUNE})`);
    expect(t).toContain('10. ');
    expect(t).toContain('Без QR-кода по онлайн-билету не садится');
  });
  it('încape într-un mesaj Telegram (4096)', () => {
    expect(textPuncte('x'.repeat(60)).length).toBeLessThan(4096);
  });
});
