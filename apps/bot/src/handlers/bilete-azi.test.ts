import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ getSupabase: () => { throw new Error('fără bază în teste'); } }));

const { esteStartBileteAzi } = await import('./bilete-azi.js');
const { esteStartSofer } = await import('./sofer.js');
const { codDinPayload } = await import('./bilet.js');

describe('esteStartBileteAzi', () => {
  it('doar payload-ul «bilete_azi», indiferent de spații/majuscule', () => {
    expect(esteStartBileteAzi('bilete_azi')).toBe(true);
    expect(esteStartBileteAzi(' Bilete_Azi ')).toBe(true);
    expect(esteStartBileteAzi('bilete')).toBe(false);
    expect(esteStartBileteAzi('bilete_azi_x')).toBe(false);
    expect(esteStartBileteAzi('sofer')).toBe(false);
    expect(esteStartBileteAzi('bilet_0123456789abcdef0123456789abcdef')).toBe(false);
    expect(esteStartBileteAzi('abc123invite')).toBe(false);
    expect(esteStartBileteAzi(undefined)).toBe(false);
    expect(esteStartBileteAzi(null)).toBe(false);
    expect(esteStartBileteAzi('')).toBe(false);
  });

  it('ordinea din handleStart: fiecare payload intră într-o singură ramură (bilet_<cod> → bilete_azi → sofer → invitație)', () => {
    const ramura = (p: string | undefined) =>
      codDinPayload(p) ? 'bilet' : esteStartBileteAzi(p) ? 'bilete_azi' : esteStartSofer(p) ? 'sofer' : p ? 'invitatie' : 'fara';
    expect(ramura('bilet_0123456789abcdef0123456789abcdef')).toBe('bilet');
    expect(ramura('bilete_azi')).toBe('bilete_azi');
    expect(ramura('sofer')).toBe('sofer');
    expect(ramura('abc123invite')).toBe('invitatie');
    expect(ramura(undefined)).toBe('fara');
  });
});
