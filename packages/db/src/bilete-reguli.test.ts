import { describe, expect, it } from 'vitest';
import { calculeazaDepartureAt, cursaIncheiata, oraOpririiPeSens, oraValida, pretVandabilOnline, sfarsitulCurseiMs, sosireaCurseiMs, vanzareDeschisa, ziuaUrmatoare } from './bilete-reguli';

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

describe('pretVandabilOnline (minimul maib 10 MDL, ION-237)', () => {
  it('10 lei și peste → da; sub 10, 0 sau nenumeric → nu', () => {
    expect(pretVandabilOnline(10)).toBe(true);
    expect(pretVandabilOnline(283)).toBe(true);
    expect(pretVandabilOnline(9.99)).toBe(false);
    expect(pretVandabilOnline(0)).toBe(false);
    expect(pretVandabilOnline(Number.NaN)).toBe(false);
  });
});

describe('sfârșitul cursei (ION-252): sosirea din grafic + 30 min, fără oră plecarea + 6 h', () => {
  const ms = (iso: string) => Date.parse(iso);

  it('oraValida: normalizează «7:05», respinge golul și orele imposibile', () => {
    expect(oraValida('7:05')).toBe('07:05');
    expect(oraValida(' 18:30 ')).toBe('18:30');
    expect(oraValida('')).toBeNull();
    expect(oraValida(null)).toBeNull();
    expect(oraValida('25:00')).toBeNull();
    expect(oraValida('—')).toBeNull();
  });

  it('oraOpririiPeSens: spre nord ora din Chișinău, spre Chișinău ora din nord', () => {
    const oprire = { hour_from_chisinau: '18:30', hour_from_nord: '9:15' };
    expect(oraOpririiPeSens(oprire, true)).toBe('18:30');
    expect(oraOpririiPeSens(oprire, false)).toBe('09:15');
    expect(oraOpririiPeSens(null, true)).toBeNull();
  });

  it('cu ora sosirii: sfârșitul = sosirea + 30 min, în ziua plecării', () => {
    expect(sosireaCurseiMs('2026-10-14T14:00:00+03:00', '18:30')).toBe(ms('2026-10-14T18:30:00+03:00'));
    expect(sfarsitulCurseiMs('2026-10-14T14:00:00+03:00', '18:30')).toBe(ms('2026-10-14T19:00:00+03:00'));
  });

  it('sosirea după miezul nopții → ziua următoare', () => {
    expect(sfarsitulCurseiMs('2026-10-14T22:00:00+03:00', '01:30')).toBe(ms('2026-10-15T02:00:00+03:00'));
  });

  it('plecarea însăși după miezul nopții (ruta 8, Lipcani 00:05): sosirea în aceeași zi cu plecarea', () => {
    expect(sfarsitulCurseiMs('2026-10-15T00:05:00+03:00', '04:10')).toBe(ms('2026-10-15T04:40:00+03:00'));
  });

  it('noaptea trecerii la ora de iarnă (25.10.2026): instantul se face din ora locală', () => {
    expect(sosireaCurseiMs('2026-10-24T22:00:00+03:00', '05:00')).toBe(ms('2026-10-25T05:00:00+02:00'));
  });

  it('fără ora sosirii (sau cu o oră nevalidă / egală cu plecarea): plecarea + 6 h', () => {
    expect(sfarsitulCurseiMs('2026-10-14T14:00:00+03:00', null)).toBe(ms('2026-10-14T20:00:00+03:00'));
    expect(sfarsitulCurseiMs('2026-10-14T14:00:00+03:00', 'x')).toBe(ms('2026-10-14T20:00:00+03:00'));
    expect(sfarsitulCurseiMs('2026-10-14T14:00:00+03:00', '14:00')).toBe(ms('2026-10-14T20:00:00+03:00'));
  });

  it('cursaIncheiata: exact la sfârșit da, cu un minut înainte nu; plecarea nevalidă nu e încheiată', () => {
    const sfarsit = ms('2026-10-14T19:00:00+03:00');
    expect(cursaIncheiata('2026-10-14T14:00:00+03:00', '18:30', sfarsit - 60_000)).toBe(false);
    expect(cursaIncheiata('2026-10-14T14:00:00+03:00', '18:30', sfarsit)).toBe(true);
    expect(cursaIncheiata('nu-e-data', '18:30', sfarsit)).toBe(false);
  });
});
