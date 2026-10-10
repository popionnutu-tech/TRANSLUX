import { beforeEach, describe, expect, it, vi } from 'vitest';

// C8 (dezbaterea Claude–Codex, 10.10.2026): panoul (stareSoferCursa, folosit la vânzare și în împăcare) judecă «șofer
// legat» ca site-ul (public_drivers_view.bilete_online, migr. 543: telegram_id AND active AND NOT is_test). Șoferul de
// test din grafic nu deschide vânzarea publică prin cererea directă la API.

const s = vi.hoisted(() => ({ sofer: null as Record<string, unknown> | null, selectSofer: '' }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (tabel: string) => {
      const q: Record<string, unknown> = {};
      const lant = () => q;
      Object.assign(q, {
        select: (c: string) => { if (tabel === 'drivers') s.selectSofer = c; return q; },
        eq: lant,
        maybeSingle: async () => ({ data: s.sofer, error: null }),
        then: (rez: (v: unknown) => void) => rez(tabel === 'daily_assignments'
          ? { data: [{ crm_route_id: 7, driver_id: 'd1', vehicle_id: 'v1', vehicle_id_retur: null, driver_id_retur: null, retur_route_id: null }], count: 1, error: null }
          : { data: [], error: null }),
      });
      return q;
    },
  }),
}));

const { stareSoferCursa } = await import('./comenzi');

describe('C8: stareSoferCursa exclude șoferii de test', () => {
  beforeEach(() => { s.sofer = null; s.selectSofer = ''; });
  it('șofer real, legat, activ → legat', async () => {
    s.sofer = { telegram_id: 111, active: true, is_test: false };
    expect(await stareSoferCursa('2026-10-12', 7, false)).toBe('legat');
    expect(s.selectSofer).toContain('is_test');
  });
  it('șofer de test, legat și activ → nelegat (ca public_drivers_view)', async () => {
    s.sofer = { telegram_id: 111, active: true, is_test: true };
    expect(await stareSoferCursa('2026-10-12', 7, false)).toBe('nelegat');
  });
  it('fără Telegram sau inactiv → nelegat', async () => {
    s.sofer = { telegram_id: null, active: true, is_test: false };
    expect(await stareSoferCursa('2026-10-12', 7, false)).toBe('nelegat');
    s.sofer = { telegram_id: 111, active: false, is_test: false };
    expect(await stareSoferCursa('2026-10-12', 7, false)).toBe('nelegat');
  });
});
