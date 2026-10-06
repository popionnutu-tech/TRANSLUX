import { describe, expect, it } from 'vitest';
import { bileteNeincheiate, fereastraHartii, initDataDinFragment, oraChisinau, parseazaContact, parseazaIstoric, type CursaBilet } from './telegram-client';

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
    expect(parseazaContact({ nume: 'Pop', prenume: 'Ion', telefon: '37368263753' })).toEqual({ nume: 'Pop', prenume: 'Ion', telefon: '37368263753', email: null });
    expect(parseazaContact({ nume: 'Pop', prenume: 'Ion', telefon: '37368263753', email: 'Ion@Exemplu.md' })?.email).toBe('ion@exemplu.md');
    expect(parseazaContact({ nume: 'Pop', prenume: 'Ion', telefon: '37368263753', email: 'stricat' })?.email).toBeNull();
    expect(parseazaIstoric([{ cod: 'a', status: 'returnata', from_name: 'B', to_name: 'C', departure_at: '2026-09-01T03:00:00Z', seats: 1, total: 135 }, { cod: 1 }, null]).map((c) => c.cod)).toEqual(['a']);
  });
  it('orice câmp ciudat → null (formularul rămâne gol)', () => {
    expect(parseazaContact(null)).toBeNull();
    expect(parseazaContact({ nume: 'P', prenume: 'Ion', telefon: '37368263753' })).toBeNull();
    expect(parseazaContact({ nume: 'Pop', prenume: 'Ion', telefon: '068263753' })).toBeNull();
    expect(parseazaContact({ nume: 'Pop', prenume: 42, telefon: '37368263753' })).toBeNull();
  });
});

describe('bileteNeincheiate (ION-252): biletul cu cursa încheiată iese din «Biletele mele»', () => {
  const acum = laChisinau('2026-10-05', '19:00');
  it('cu ora sosirii: până la sosire + 30 min rămâne, exact la sfârșit iese', () => {
    const b = { cod: 'x', departure_at: '2026-10-05T14:00:00+03:00', sosire: '18:30' };
    expect(bileteNeincheiate([b], acum - 60_000)).toHaveLength(1);
    expect(bileteNeincheiate([b], acum)).toHaveLength(0);
  });
  it('fără ora sosirii: plecarea + 6 h', () => {
    const b = { cod: 'y', departure_at: '2026-10-05T14:00:00+03:00', sosire: null };
    expect(bileteNeincheiate([b], laChisinau('2026-10-05', '19:59'))).toHaveLength(1);
    expect(bileteNeincheiate([b], laChisinau('2026-10-05', '20:00'))).toHaveLength(0);
  });
  it('peste miezul nopții: cursa de ieri seară rămâne până la sosirea de azi noapte + 30 min', () => {
    const b = { cod: 'z', departure_at: '2026-10-05T22:00:00+03:00', sosire: '01:30' };
    expect(bileteNeincheiate([b], laChisinau('2026-10-06', '01:59'))).toHaveLength(1);
    expect(bileteNeincheiate([b], laChisinau('2026-10-06', '02:00'))).toHaveLength(0);
  });
  it('ordinea și biletele viitoare rămân neatinse', () => {
    const viitor = { cod: 'v', departure_at: '2026-10-07T05:45:00+03:00', sosire: '09:30' };
    const trecut = { cod: 't', departure_at: '2026-10-05T05:45:00+03:00', sosire: '09:30' };
    expect(bileteNeincheiate([trecut, viitor], acum).map((b) => b.cod)).toEqual(['v']);
  });
});

import { CACHE_BILETE_MAX_MS, deMemorat, memorateValide, telegramIdDinInitData } from './telegram-client';

describe('ION-275: cache-ul local al biletelor clientului', () => {
  const init = `auth_date=1&user=${encodeURIComponent(JSON.stringify({ id: 8681673761 }))}&hash=x`;
  it('telegramIdDinInitData', () => {
    expect(telegramIdDinInitData(init)).toBe(8681673761);
    expect(telegramIdDinInitData('')).toBeNull();
    expect(telegramIdDinInitData('user=%7B')).toBeNull();
  });
  it('deMemorat păstrează DOAR câmpurile cardului (fără telefon, e-mail, câmpuri noi)', () => {
    const m = deMemorat(5, [{ cod: 'a', passenger_name: 'Ion', bilete: [{ nr: 1 }], phone: '373', email: 'x@y', secret_nou: 1 }, null], 1000);
    expect(m.bilete).toEqual([{ cod: 'a', passenger_name: 'Ion', bilete: [{ nr: 1 }] }]);
    expect(m).toMatchObject({ la: 1000, telegram_id: 5 });
  });
  it('memorateValide: doar același cont, ≤ 12 h', () => {
    const m = deMemorat(5, [], 1000);
    expect(memorateValide(m, 5, 1000 + CACHE_BILETE_MAX_MS)).toBe(true);
    expect(memorateValide(m, 6, 1000)).toBe(false);
    expect(memorateValide(m, 5, 1000 + CACHE_BILETE_MAX_MS + 1)).toBe(false);
    expect(memorateValide(m, null, 1000)).toBe(false);
    expect(memorateValide({ telegram_id: 5, la: 1000 }, 5, 1000)).toBe(false);
  });
});
