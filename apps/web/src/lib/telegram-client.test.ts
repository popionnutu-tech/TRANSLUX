import { describe, expect, it } from 'vitest';
import { fereastraHartii, initDataDinFragment, oraChisinau, parseazaContact, type CursaBilet } from './telegram-client';

// Ora Chișinăului în octombrie 2026 = UTC+3.
const laChisinau = (zi: string, hhmm: string) => Date.parse(`${zi}T${hhmm}:00+03:00`);
const cursa = (o: Partial<CursaBilet> = {}): CursaBilet => ({
  trip_date: '2026-10-05', departure_at: '2026-10-05T14:00:00+03:00', sosire: '18:30', ...o,
});

describe('fereastraHartii — harta apare în ziua cursei, cu o oră înainte de plecare', () => {
  it('cursa de mâine → alta_zi, oricât de aproape ar fi ora', () => {
    expect(fereastraHartii(cursa({ trip_date: '2026-10-06', departure_at: '2026-10-06T00:30:00+03:00', sosire: '05:00' }), laChisinau('2026-10-05', '23:50'))).toBe('alta_zi');
  });
  it('azi, cu mai mult de o oră înainte de plecare → curand', () => {
    expect(fereastraHartii(cursa(), laChisinau('2026-10-05', '12:59'))).toBe('curand');
  });
  it('de la o oră înainte de plecare până la sosire + 30 min → activa', () => {
    expect(fereastraHartii(cursa(), laChisinau('2026-10-05', '13:00'))).toBe('activa');
    expect(fereastraHartii(cursa(), laChisinau('2026-10-05', '16:00'))).toBe('activa');
    expect(fereastraHartii(cursa(), laChisinau('2026-10-05', '19:00'))).toBe('activa');
  });
  it('după sosire + 30 min → incheiata', () => {
    expect(fereastraHartii(cursa(), laChisinau('2026-10-05', '19:01'))).toBe('incheiata');
  });
  it('fără ora sosirii: cel mult 6 h de la plecare', () => {
    const c = cursa({ sosire: null });
    expect(fereastraHartii(c, laChisinau('2026-10-05', '20:29'))).toBe('activa');
    expect(fereastraHartii(c, laChisinau('2026-10-05', '20:31'))).toBe('incheiata');
  });
  it('sosirea după miezul nopții: cursa de azi rămâne activă până la miezul nopții, iar ziua următoare e încheiată', () => {
    const c = cursa({ departure_at: '2026-10-05T22:00:00+03:00', sosire: '01:30' });
    expect(fereastraHartii(c, laChisinau('2026-10-05', '23:59'))).toBe('activa');
    expect(fereastraHartii(c, laChisinau('2026-10-06', '00:30'))).toBe('incheiata');
  });
  it('data de plecare nevalidă → alta_zi (fără cereri spre server)', () => {
    expect(fereastraHartii(cursa({ departure_at: 'nu-e-data' }), laChisinau('2026-10-05', '14:00'))).toBe('alta_zi');
  });
});

describe('oraChisinau', () => {
  it('ISO → «HH:MM» în ora Chișinăului, cu zero în față', () => {
    expect(oraChisinau('2026-10-05T03:05:00Z')).toBe('06:05');
    expect(oraChisinau('2026-10-04T21:05:00Z')).toBe('00:05');
  });
});

describe('initDataDinFragment', () => {
  it('scoate tgWebAppData din fragmentul URL-ului, decodat', () => {
    expect(initDataDinFragment('#tgWebAppData=query_id%3DAA%26hash%3Dab&tgWebAppVersion=8.0')).toBe('query_id=AA&hash=ab');
  });
  it('fără fragment Telegram → gol', () => {
    expect(initDataDinFragment('')).toBe('');
    expect(initDataDinFragment('#altceva=1')).toBe('');
  });
});

describe('parseazaContact', () => {
  it('contact bun → numele, prenumele și telefonul 373XXXXXXXX', () => {
    expect(parseazaContact({ nume: 'Pop', prenume: 'Ion', telefon: '37368263753' })).toEqual({ nume: 'Pop', prenume: 'Ion', telefon: '37368263753' });
  });
  it('orice câmp ciudat → null (formularul rămâne gol)', () => {
    expect(parseazaContact(null)).toBeNull();
    expect(parseazaContact({ nume: 'P', prenume: 'Ion', telefon: '37368263753' })).toBeNull();
    expect(parseazaContact({ nume: 'Pop', prenume: 'Ion', telefon: '068263753' })).toBeNull();
    expect(parseazaContact({ nume: 'Pop', prenume: 42, telefon: '37368263753' })).toBeNull();
  });
});
