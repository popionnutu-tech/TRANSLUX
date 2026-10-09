import { describe, expect, it, vi } from 'vitest';
import { calculeazaDepartureAt, vanzareDeschisa, ziuaUrmatoare } from './reguli';

describe('calculeazaDepartureAt', () => {
  it('ora opririi în aceeași zi, cu offset-ul verii (+03:00)', () => {
    expect(calculeazaDepartureAt('2026-10-14', '05:45', '05:45')).toBe('2026-10-14T05:45:00+03:00');
    expect(calculeazaDepartureAt('2026-10-14', '08:30', '05:45')).toBe('2026-10-14T08:30:00+03:00');
  });

  it('după miezul nopții oprirea e în ziua următoare (ruta 8: Chișinău 20:00 → Lipcani 00:05)', () => {
    expect(calculeazaDepartureAt('2026-10-14', '00:05', '20:00')).toBe('2026-10-15T00:05:00+03:00');
  });

  it('ora de iarnă din 25.10.2026: offset +02:00', () => {
    expect(calculeazaDepartureAt('2026-10-26', '05:45', '05:45')).toBe('2026-10-26T05:45:00+02:00');
    expect(calculeazaDepartureAt('2026-10-24', '05:45', '05:45')).toBe('2026-10-24T05:45:00+03:00');
  });

  it('fără ora de pornire a rutei nu se corectează data', () => {
    expect(calculeazaDepartureAt('2026-10-14', '00:05', null)).toBe('2026-10-14T00:05:00+03:00');
  });

  it('ziuaUrmatoare trece peste luna și anul', () => {
    expect(ziuaUrmatoare('2026-10-31')).toBe('2026-11-01');
    expect(ziuaUrmatoare('2026-12-31')).toBe('2027-01-01');
  });
});

describe('vanzareDeschisa', () => {
  const pornire = '2026-10-14T05:45:00+03:00';
  const oprire = '2026-10-14T06:23:00+03:00';
  const t = (iso: string) => Date.parse(iso);

  it('tur (din nord): până la plecarea rutei, nu a opririi pasagerului', () => {
    const a = { goingNorth: false, departureAt: oprire, pornireRutaAt: pornire, inchidereTurMin: 0, inchidereReturMin: 120 };
    expect(vanzareDeschisa({ ...a, nowMs: t('2026-10-14T05:44:00+03:00') })).toBe(true);
    expect(vanzareDeschisa({ ...a, nowMs: t('2026-10-14T05:45:00+03:00') })).toBe(false);
    expect(vanzareDeschisa({ ...a, nowMs: t('2026-10-14T06:00:00+03:00') })).toBe(false);
  });

  it('retur (din Chișinău): cu 2 ore înainte de plecarea de la oprirea pasagerului', () => {
    const a = { goingNorth: true, departureAt: '2026-10-14T17:50:00+03:00', pornireRutaAt: '2026-10-14T17:50:00+03:00', inchidereTurMin: 0, inchidereReturMin: 120 };
    expect(vanzareDeschisa({ ...a, nowMs: t('2026-10-14T15:49:00+03:00') })).toBe(true);
    expect(vanzareDeschisa({ ...a, nowMs: t('2026-10-14T15:50:00+03:00') })).toBe(false);
  });

  it('ora nevalidă → închis', () => {
    expect(vanzareDeschisa({ goingNorth: false, departureAt: 'x', pornireRutaAt: 'x', nowMs: 0, inchidereTurMin: 0, inchidereReturMin: 120 })).toBe(false);
  });
});

describe('vanzareaAPornit — data de pornire (Ion, 09.10: «începând de 12.10»)', async () => {
  const { vanzareaAPornit } = await import('./reguli');
  const { chisinauTodayIso } = await import('@/lib/chisinau-time');
  it('steag + ziua ≥ data → deschisă; înainte → închisă; fără dată → doar steagul; stricată → închisă', () => {
    expect(vanzareaAPornit(true, '2026-10-12', '2026-10-12')).toBe(true);
    expect(vanzareaAPornit(true, '2026-10-12', '2026-10-13')).toBe(true);
    expect(vanzareaAPornit(true, '2026-10-12', '2026-10-11')).toBe(false);
    expect(vanzareaAPornit(false, '2026-10-12', '2026-10-13')).toBe(false);
    expect(vanzareaAPornit(true, '', '2026-10-09')).toBe(true);
    expect(vanzareaAPornit(true, null, '2026-10-09')).toBe(true);
    expect(vanzareaAPornit(true, '12.10.2026', '2026-10-13')).toBe(false);
  });
  it('ziua e a Chișinăului: 11.10 la 23:30 UTC e deja 12.10 (02:30 la Chișinău)', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T23:30:00Z'));
    try { expect(vanzareaAPornit(true, '2026-10-12', chisinauTodayIso())).toBe(true); } finally { vi.useRealTimers(); }
  });
});
