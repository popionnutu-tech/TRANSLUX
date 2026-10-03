import { describe, expect, it } from 'vitest';
import { construiesteMesaj } from './email-mesaj';

const baza = {
  cod: 'ab'.repeat(16), lang: 'ro' as const, from_name: 'Briceni', to_name: 'Chișinău',
  departure_at: '2026-10-14T05:45:00+03:00', seats: 2, total: 566, passenger_name: 'Popescu Ion',
  ruta: 'Briceni – Chișinău',
  bilete: [{ nr: 1, cod_qr: 'AAAA1111BBBB2222CCCC' }, { nr: 2, cod_qr: 'DDDD3333EEEE4444FFFF' }],
};
const opt = { bazaSite: 'https://translux.md/', bot: 'TransluxMoldova_bot' };

describe('construiesteMesaj', () => {
  it('RO: subiect cu cursa și ora Chișinăului, salut pe prenume, câte un QR pe loc', () => {
    const m = construiesteMesaj(baza, opt);
    expect(m.subiect).toBe('Biletul tău TRANSLUX: Briceni → Chișinău, 14.10.2026, 05:45');
    expect(m.html).toContain('Bună, Ion!');
    expect(m.qrIds).toEqual(['qr-1', 'qr-2']);
    expect(m.html).toContain('cid:qr-1');
    expect(m.html).toContain('cid:qr-2');
    expect(m.html).toContain('566.00 lei');
    expect(m.html).toContain(`https://translux.md/ro/bilet/${baza.cod}`);
    expect(m.html).toContain(`https://t.me/TransluxMoldova_bot?start=bilet_${baza.cod}`);
    expect(m.text).toContain('Loc 2/2 · Briceni → Chișinău, 14.10.2026, 05:45: DDDD3333EEEE4444FFFF');
  });
  it('RU: textele și pagina RU', () => {
    const m = construiesteMesaj({ ...baza, lang: 'ru' }, opt);
    expect(m.subiect).toMatch(/^Ваш билет TRANSLUX: Briceni → Chișinău/);
    expect(m.html).toContain(`https://translux.md/ru/bilet/${baza.cod}`);
    expect(m.text).toContain('Возврат');
  });
  it('numele cu caractere HTML sunt scăpate', () => {
    const m = construiesteMesaj({ ...baza, passenger_name: 'Pop <script>x</script>' }, opt);
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });
  it('un singur cuvânt în nume → salutul pe tot numele', () => {
    expect(construiesteMesaj({ ...baza, passenger_name: 'Ion' }, opt).html).toContain('Bună, Ion!');
  });
});

describe('construiesteMesaj — fără căsuță de răspuns', () => {
  it('spune că e trimis automat și dă telefonul și Telegramul, în HTML și în text', () => {
    const m = construiesteMesaj(baza, opt);
    expect(m.html).toContain('nu răspunde la el');
    expect(m.text).toContain('+373 60 401 010');
    expect(construiesteMesaj({ ...baza, lang: 'ru' }, opt).text).toContain('не отвечайте');
  });
});

describe('construiesteMesaj — ruta pe fiecare loc', () => {
  it('fiecare QR are deasupra ruta, de unde încotro și ora; textul simplu la fel', () => {
    const m = construiesteMesaj(baza, opt);
    expect(m.html.split('Briceni → Chișinău</div>').length - 1).toBe(2);
    expect(m.html.split('Briceni – Chișinău</div>').length - 1).toBe(2);
    expect(m.text).toContain('Loc 1/2 · Briceni → Chișinău, 14.10.2026, 05:45: AAAA1111BBBB2222CCCC');
  });
});
