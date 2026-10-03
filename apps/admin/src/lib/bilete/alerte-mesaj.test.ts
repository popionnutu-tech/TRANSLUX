import { describe, expect, it } from 'vitest';
import { eticheta, mesajAlerte } from './alerte-mesaj';

const comanda = { from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2026-10-14T05:45:00+03:00', passenger_name: 'Popescu Ion', phone: '37369123456', total: 283 };

describe('mesajAlerte', () => {
  it('o alertă: tipul pe românește, cursa, pasagerul, suma și linkul', () => {
    const m = mesajAlerte([{ tip: 'platita_fara_bilet', detalii: 'callback neaplicat', moment: '2026-10-14T05:00:00Z', comanda }], 'https://central-hub-md.vercel.app/bilete');
    expect(m).toContain('o alertă');
    expect(m).toContain('Plată primită fără bilet');
    expect(m).toContain('Briceni → Chișinău, 14.10, 05:45');
    expect(m).toContain('Popescu Ion · +37369123456 · 283.00 lei');
    expect(m).toContain('callback neaplicat');
    expect(m).toContain('href="https://central-hub-md.vercel.app/bilete"');
  });
  it('mai multe: numărul, cel mult 20 afișate, restul numărat; fără comandă merge', () => {
    const multe = Array.from({ length: 23 }, () => ({ tip: 'email_esuat', detalii: null, moment: '2026-10-14T05:00:00Z', comanda: null }));
    const m = mesajAlerte(multe, 'u');
    expect(m).toContain('23 alerte');
    expect(m).toContain('…și încă 3.');
    expect(m.split('Biletul nu a plecat pe e-mail').length - 1).toBe(20);
  });
  it('HTML scăpat; tip necunoscut rămâne vizibil', () => {
    const m = mesajAlerte([{ tip: 'nou', detalii: '<b>x</b>', moment: '', comanda: null }], 'u');
    expect(m).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(eticheta('nou')).toBe('⚠️ nou');
  });
});
