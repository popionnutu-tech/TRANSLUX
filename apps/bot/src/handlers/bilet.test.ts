import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ getSupabase: () => { throw new Error('fără bază în teste'); } }));

const { codDinPayload, mesajBilet } = await import('./bilet.js');

describe('codDinPayload', () => {
  it('bilet_ + 32 hex → codul în litere mici', () => {
    expect(codDinPayload('bilet_0123456789ABCDEF0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
  });
  it('invitațiile personalului și formele greșite → null (merg pe ramura veche)', () => {
    expect(codDinPayload('abc123invite')).toBeNull();
    expect(codDinPayload('bilet_123')).toBeNull();
    expect(codDinPayload('bilet_0123456789abcdef0123456789abcdefXX')).toBeNull();
    expect(codDinPayload('xbilet_0123456789abcdef0123456789abcdef')).toBeNull();
    expect(codDinPayload(undefined)).toBeNull();
    expect(codDinPayload('')).toBeNull();
  });
});

describe('mesajBilet', () => {
  const c = { cod: 'ab'.repeat(16), status: 'platita', lang: 'ro', from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2026-10-14T05:45:00+03:00', seats: 2 };
  it('RO: cursa, ora Chișinăului, locurile, starea și linkul paginii RO', () => {
    const m = mesajBilet(c);
    expect(m.text).toContain('Briceni → Chișinău');
    expect(m.text).toContain('05:45');
    expect(m.text).toContain('locuri: 2');
    expect(m.text).toContain('Plătit');
    expect(m.url).toBe(`https://translux.md/ro/bilet/${c.cod}`);
  });
  it('RU: textul și pagina RU; stare necunoscută rămâne cum e', () => {
    const m = mesajBilet({ ...c, lang: 'ru', status: 'ceva_nou' });
    expect(m.text).toContain('мест: 2');
    expect(m.text).toContain('ceva_nou');
    expect(m.url).toBe(`https://translux.md/ru/bilet/${c.cod}`);
  });
});
