import { describe, expect, it } from 'vitest';
import { alegeCurenta, cheieCursa, clasificaScanare, hhmm, minute, parseazaCheie, parseazaInterval, parseazaScanari } from './sofer-reguli';

describe('cheia cursei', () => {
  it('se construiește și se citește', () => {
    expect(cheieCursa('2026-10-05', 7, false)).toBe('2026-10-05|7|false');
    expect(parseazaCheie('2026-10-05|7|true')).toEqual({ tripDate: '2026-10-05', crmRouteId: 7, goingNorth: true });
    expect(parseazaCheie('2026-10-05|7')).toBeNull();
    expect(parseazaCheie('2026-10-05|x|false')).toBeNull();
    expect(parseazaCheie(7)).toBeNull();
  });
});

describe('orele din nomenclator', () => {
  it('intervalul «06:00 - 10:20» dă plecarea și sosirea; o singură oră dă doar plecarea', () => {
    expect(parseazaInterval('06:00 - 10:20')).toEqual({ plecare: '06:00', sosire: '10:20' });
    expect(parseazaInterval('6:05')).toEqual({ plecare: '06:05', sosire: null });
    expect(parseazaInterval(null)).toEqual({ plecare: null, sosire: null });
    expect(minute('14:50')).toBe(890);
    expect(minute('')).toBeNull();
    expect(hhmm(890)).toBe('14:50');
    expect(hhmm(1500)).toBe('01:00');
  });
});

describe('alegeCurenta — regula C1 (interval [plecare − 60, sosire + 30], la suprapunere plecarea cea mai apropiată)', () => {
  const tur = { cheie: 'T', plecare: '06:00', sosire: '10:20' };
  const retur = { cheie: 'R', plecare: '14:00', sosire: '18:20' };

  it('alege cursa al cărei interval conține ora, inclusiv marjele', () => {
    expect(alegeCurenta([tur, retur], '05:00')).toBe('T'); // plecare − 60
    expect(alegeCurenta([tur, retur], '08:00')).toBe('T');
    expect(alegeCurenta([tur, retur], '10:50')).toBe('T'); // sosire + 30
    expect(alegeCurenta([tur, retur], '13:00')).toBe('R');
    expect(alegeCurenta([tur, retur], '18:50')).toBe('R');
  });

  it('în afara intervalelor dă următoarea plecare de azi; după ultima, nimic', () => {
    expect(alegeCurenta([tur, retur], '11:30')).toBe('R');
    expect(alegeCurenta([tur, retur], '04:00')).toBe('T');
    expect(alegeCurenta([tur, retur], '19:00')).toBeNull();
    expect(alegeCurenta([], '08:00')).toBeNull();
  });

  it('la suprapunere câștigă plecarea cea mai apropiată de «acum»', () => {
    const a = { cheie: 'A', plecare: '06:00', sosire: '12:00' };
    const b = { cheie: 'B', plecare: '11:00', sosire: '15:00' };
    expect(alegeCurenta([a, b], '10:30')).toBe('B'); // 30 min până la B, 4 h 30 de la A
    expect(alegeCurenta([a, b], '08:00')).toBe('A');
    expect(alegeCurenta([b, a], '10:30')).toBe('B'); // ordinea listei nu contează
  });

  it('cursa fără sosire ține 5 h; sosirea după miezul nopții se întinde a doua zi', () => {
    expect(alegeCurenta([{ cheie: 'X', plecare: '20:00', sosire: null }], '00:30')).toBe('X'); // dimineața: următoarea plecare de azi
    expect(alegeCurenta([{ cheie: 'X', plecare: '20:00', sosire: null }], '23:59')).toBe('X'); // 20:00 + 5 h + 30 min
    expect(alegeCurenta([{ cheie: 'X', plecare: '20:00', sosire: '23:00' }], '23:45')).toBeNull(); // sosit la 23:00, marja de 30 trecută
    expect(alegeCurenta([{ cheie: 'N', plecare: '22:00', sosire: '02:00' }], '23:30')).toBe('N');
  });
});

describe('clasificaScanare — stare bilet × cursă → rezultat', () => {
  const EU = 'sofer-1';
  const CHEIE = '2026-10-05|7|false';
  const b = (status: 'valid' | 'urcat' | 'anulat' | 'returnat', cheie = CHEIE, urcat_de: string | null = null) => ({ status, cheie, urcat_de });

  it('valid pe cursa mea → ok', () => {
    expect(clasificaScanare(b('valid'), CHEIE, EU)).toEqual({ rezultat: 'ok', urcat_de_altul: false });
  });
  it('cod inexistent → necunoscut; anulat/returnat → anulat (indiferent de cursă)', () => {
    expect(clasificaScanare(null, CHEIE, EU)).toEqual({ rezultat: 'necunoscut' });
    expect(clasificaScanare(b('anulat'), CHEIE, EU)).toEqual({ rezultat: 'anulat' });
    expect(clasificaScanare(b('returnat', 'alta|1|true'), CHEIE, EU)).toEqual({ rezultat: 'anulat' });
  });
  it('valid sau urcat pe altă cursă → alta_cursa', () => {
    expect(clasificaScanare(b('valid', '2026-10-06|7|false'), CHEIE, EU)).toEqual({ rezultat: 'alta_cursa' });
    expect(clasificaScanare(b('urcat', '2026-10-05|7|true', EU), CHEIE, EU)).toEqual({ rezultat: 'alta_cursa' });
  });
  it('deja urcat: de mine → urcat_de_altul=false; de altul → true', () => {
    expect(clasificaScanare(b('urcat', CHEIE, EU), CHEIE, EU)).toEqual({ rezultat: 'deja_urcat', urcat_de_altul: false });
    expect(clasificaScanare(b('urcat', CHEIE, 'sofer-2'), CHEIE, EU)).toEqual({ rezultat: 'deja_urcat', urcat_de_altul: true });
  });
  it('retrimiterea aceleiași scanări «ok» (coada offline) → ok din nou, marcată repetată; a altuia nu', () => {
    expect(clasificaScanare(b('urcat', CHEIE, EU), CHEIE, EU, true)).toEqual({ rezultat: 'ok', urcat_de_altul: false, repetata: true });
    expect(clasificaScanare(b('urcat', CHEIE, 'sofer-2'), CHEIE, EU, true)).toEqual({ rezultat: 'deja_urcat', urcat_de_altul: true });
  });
});

describe('parseazaScanari — corpul lotului', () => {
  const ACUM = new Date('2026-10-05T08:00:00Z');
  it('normalizează codul la majuscule, păstrează ce s-a citit, ia moment_client valid și nu din viitor', () => {
    const r = parseazaScanari({ scanari: [{ cod: ' 7k2m9qxart4p8wzd1234 ', moment_client: '2026-10-05T07:59:00+03:00', offline: true }] }, ACUM);
    expect(r).toEqual([{ cod: '7K2M9QXART4P8WZD1234', cod_citit: '7k2m9qxart4p8wzd1234', moment_client: '2026-10-05T04:59:00.000Z', offline: true }]);
    const viitor = parseazaScanari({ scanari: [{ cod: 'X', moment_client: '2026-10-05T09:00:00Z' }] }, ACUM);
    expect(viitor?.[0].moment_client).toBe(ACUM.toISOString());
    expect(viitor?.[0].offline).toBe(false);
    expect(parseazaScanari({ scanari: [{ cod: 'X', moment_client: 'ieri' }] }, ACUM)?.[0].moment_client).toBe(ACUM.toISOString());
  });
  it('refuză lotul gol, prea mare sau cu cod ne-text', () => {
    expect(parseazaScanari({ scanari: [] }, ACUM)).toBeNull();
    expect(parseazaScanari({}, ACUM)).toBeNull();
    expect(parseazaScanari(null, ACUM)).toBeNull();
    expect(parseazaScanari({ scanari: [{ cod: 5 }] }, ACUM)).toBeNull();
    expect(parseazaScanari({ scanari: Array.from({ length: 51 }, () => ({ cod: 'A' })) }, ACUM)).toBeNull();
  });
});
