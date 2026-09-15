import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
import { pretCaption, SITE } from './price-announce';
import { ddmmyyyy } from './price-image';
import { pretRuta } from './price-popular';

describe('ddmmyyyy', () => {
  it('scrie data ca la noi', () => {
    expect(ddmmyyyy('2026-09-19')).toBe('19.09.2026');
  });
});

describe('pretCaption', () => {
  it('spune ziua în care intră prețurile, în ambele limbi', () => {
    const t = pretCaption('2026-09-18', '2026-09-17'); // vineri, anunțat joi
    expect(t).toContain('Prețuri noi de vineri, 18.09.2026');
    expect(t).toContain('Новые цены с пятницы, 18.09.2026');
  });

  it('trimite omul la site pentru restul destinațiilor', () => {
    const t = pretCaption('2026-09-18', '2026-09-17');
    expect(t).toContain(`vizitați ${SITE}`);
    expect(t).toContain(`посетите ${SITE}`);
  });

  it('spune «de azi» când tariful intră în vigoare chiar în ziua anunțului', () => {
    const t = pretCaption('2026-09-17', '2026-09-17');
    expect(t).toContain('Prețuri noi de azi');
    expect(t).toContain('Новые цены с сегодняшнего дня');
  });

  it('nu rămâne la «de mâine» dacă anunțul pleacă mai târziu decât data', () => {
    // Propunere aplicată cu întârziere: data e în trecut, deci «de azi».
    expect(pretCaption('2026-09-10', '2026-09-18')).toContain('de azi');
  });
});

describe('pretRuta', () => {
  const tarif = { rateLong: 1.13, rateSub: 1.23 };
  const interurban = { km: 238, from_district: 'chisinau', to_district: 'briceni', start_district: 'briceni' };

  it('înmulțește kilometrii cu tariful și rotunjește, ca pe site', () => {
    expect(pretRuta(interurban, tarif)).toBe(269); // 238 × 1.13 = 268.94
  });

  it('ia tariful suburban doar când ambele opriri sunt în raionul de plecare', () => {
    const suburban = { km: 20, from_district: 'briceni', to_district: 'briceni', start_district: 'briceni' };
    expect(pretRuta(suburban, tarif)).toBe(25); // 20 × 1.23 = 24.6
  });

  it('fără tarif sau fără km nu inventează preț', () => {
    expect(pretRuta(interurban, { rateLong: null, rateSub: null })).toBeNull();
    expect(pretRuta({ ...interurban, km: 0 }, tarif)).toBeNull();
    expect(pretRuta(undefined, tarif)).toBeNull();
  });

  it('refuză kilometrajul absurd (date stricate), în loc să scrie un preț de mii de lei', () => {
    expect(pretRuta({ ...interurban, km: 1200 }, tarif)).toBeNull();
  });
});
