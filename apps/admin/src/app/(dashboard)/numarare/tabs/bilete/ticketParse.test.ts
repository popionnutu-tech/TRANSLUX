import { describe, it, expect } from 'vitest';
import {
  parseCsv, parseRoDateTime, parsePrice, parseRoute, normalizeStation, pairKey,
  normalizeRow, parseTikiExport, monthsBetween, packRow, unpackRow, TIKI_HEADER,
} from './ticketParse';

const HEADER = TIKI_HEADER.map(h => `"${h}"`).join(';');
const line = (cols: string[]) => cols.map(c => `"${c}"`).join(';');

describe('parseCsv', () => {
  it('BOM, ghilimele, ; în câmp, "" și CRLF', () => {
    const t = '﻿"a";"b;c";"d""e"\r\n"1";"2";"3"\r\n';
    expect(parseCsv(t)).toEqual([['a', 'b;c', 'd"e'], ['1', '2', '3']]);
  });
  it('fără linie goală la final', () => {
    expect(parseCsv('"x";"y"')).toEqual([['x', 'y']]);
  });
});

describe('parseRoDateTime', () => {
  it('dată și oră locală, fără fus orar', () => {
    expect(parseRoDateTime('30.09.2026 15:46')).toEqual({ ts: '2026-09-30T15:46:00', date: '2026-09-30' });
    expect(parseRoDateTime('1.2.2025 7:05')).toEqual({ ts: '2025-02-01T07:05:00', date: '2025-02-01' });
  });
  it('invalid', () => {
    expect(parseRoDateTime('2026-09-30')).toBeNull();
    expect(parseRoDateTime('31.13.2026 10:00')).toBeNull();
  });
});

describe('parsePrice', () => {
  it('punct sau virgulă', () => {
    expect(parsePrice('244.55')).toBe(244.55);
    expect(parsePrice('65,00')).toBe(65);
    expect(parsePrice('abc')).toBeNull();
  });
});

describe('parseRoute', () => {
  it('ora la coadă → tur', () => {
    expect(parseRoute('Chisinau - Criva 10:10')).toMatchObject({ name: 'Chisinau - Criva', time: '10:10', direction: 'tur' });
  });
  it('ora în față → retur, cu varianta /Larga', () => {
    expect(parseRoute('6:00 Criva - Chisinau/Larga')).toMatchObject({ name: 'Criva - Chisinau/Larga', time: '06:00', direction: 'retur' });
  });
  it('cratime lipite și spații duble', () => {
    expect(parseRoute('12:35 Otaci- Chisinau').name).toBe('Otaci - Chisinau');
    expect(parseRoute('18:10 Chisinau-Ocnita')).toMatchObject({ name: 'Chisinau - Ocnita', direction: 'tur' });
    expect(parseRoute('05:45  Briceni - Chisinau')).toMatchObject({ name: 'Briceni - Chisinau', time: '05:45' });
    expect(parseRoute('Chisinau-Caracusenii Vechi 16:15')).toMatchObject({ name: 'Chisinau - Caracusenii Vechi', direction: 'tur' });
  });
  it('Anulare = vânzare reală fără cursă', () => {
    expect(parseRoute('Anulare 6.6')).toMatchObject({ name: 'Anulare', isAnulare: true, excluded: false, direction: 'necunoscut' });
  });
  it('TEST / Copy of se exclud', () => {
    expect(parseRoute('TEST 23:35 Lipcani - Chisinau TestTIKI').excluded).toBe(true);
    expect(parseRoute('Copy of 12:35 Otaci- Chisinau TEST123').excluded).toBe(true);
    expect(parseRoute('Test  Orange - Stauceni 2').excluded).toBe(true);
    expect(parseRoute('Lipcani TEST 1').excluded).toBe(true);
  });
});

describe('stații și perechi', () => {
  it('GA, sat, liniuță', () => {
    expect(normalizeStation('Chisinau GA')).toBe('Chisinau');
    expect(normalizeStation('Balti GA')).toBe('Balti');
    expect(normalizeStation('Ocnita (sat)')).toBe('Ocnita');
    expect(normalizeStation('—')).toBeNull();
  });
  it('perechea e fără sens: Chișinău, apoi Bălți, apoi alfabetic', () => {
    expect(pairKey('Balti', 'Chisinau')).toBe('Chisinau - Balti');
    expect(pairKey('Edinet', 'Balti')).toBe('Balti - Edinet');
    expect(pairKey('Lipcani', 'Briceni')).toBe('Briceni - Lipcani');
  });
});

describe('normalizeRow', () => {
  const base = ['30.09.2026 15:46', '43-517-6716', 'Chisinau - Ocnita 15:55', 'Chisinau GA', 'Edinet', 'PAT9 Nord', 'MLD 069', 'MOROSAN ION', 'Terminal', 'Numerar', '244.55'];
  it('rând complet', () => {
    const r = normalizeRow(base);
    expect(r).toMatchObject({
      ticket_no: '43-517-6716', sale_date: '2026-09-30', route_name: 'Chisinau - Ocnita', route_time: '15:55',
      direction: 'tur', from_station: 'Chisinau', to_station: 'Edinet', pair: 'Chisinau - Edinet', price: 244.55,
      driver_name: 'MOROSAN ION', vehicle: 'MLD 069', is_anulare: false,
    });
  });
  it('2025 fără stații → pereche goală (se deduce din preț în bază)', () => {
    const r = normalizeRow(['30.06.2025 23:52', '74-1093-12856', '18:10 Chisinau-Ocnita', '—', '—', 'PAT9 Nord', 'NSX 263', 'SUMSCHII A.', 'Casă / online', 'Altă metodă de plată', '7.68']);
    expect(r).toMatchObject({ pair: null, from_station: null, direction: 'tur', price: 7.68 });
  });
  it('rândurile de probă ale furnizorului', () => {
    const r = normalizeRow(['31.12.2025 13:12', '68-1-7', '15:30 Criva - Chisinau', 'Balti GA', 'Chisinau GA', 'PAT9 Nord', 'TEST 000', 'TEST TEST', 'Casă / online', 'Numerar', '65.00']);
    expect(r).toEqual({ excluded: 'test' });
  });
  it('un nume care conține «test» în cuvânt nu e exclus', () => {
    const r = normalizeRow([...base.slice(0, 7), 'TESTEMITANU ION', ...base.slice(8)]);
    expect('excluded' in r).toBe(false);
  });
});

describe('parseTikiExport', () => {
  it('antet greșit', () => {
    expect(parseTikiExport('"a";"b"\n"1";"2"')).toHaveProperty('error');
  });
  it('dubluri în fișier, excluderi, interval', () => {
    const t = [
      HEADER,
      line(['30.09.2026 15:46', '1', 'Chisinau - Ocnita 15:55', 'Chisinau GA', 'Edinet', 'PAT9 Nord', 'MLD 069', 'A B', 'Terminal', 'Numerar', '10']),
      line(['30.09.2026 15:47', '1', 'Chisinau - Ocnita 15:55', 'Chisinau GA', 'Edinet', 'PAT9 Nord', 'MLD 069', 'A B', 'Terminal', 'Numerar', '10']),
      // același număr, alt bilet (aparatul refolosește numerele): rămâne
      line(['28.02.2026 11:27', '1', 'Chisinau - Ocnita 15:55', 'Chisinau GA', 'Edinet', 'PAT9 Nord', 'MLD 069', 'A B', 'Terminal', 'Numerar', '11.52']),
      line(['01.09.2026 06:00', '2', 'Anulare 6.6', '—', '—', 'PAT9 Nord', 'X', 'C D', 'Terminal', 'Numerar', '65.00']),
      line(['01.09.2026 06:00', '3', 'TEST 23:35 Lipcani - Chisinau TestTIKI', '—', '—', 'PAT9 Nord', 'X', 'C D', 'Terminal', 'Numerar', '16']),
    ].join('\r\n');
    const r = parseTikiExport(t);
    if ('error' in r) throw new Error(r.error);
    expect(r.rows.map(x => x.ticket_no)).toEqual(['1', '1', '2']);
    expect(r.duplicatesInFile).toBe(1);
    expect(r.excluded.test).toBe(1);
    expect(r.dateMin).toBe('2026-02-28');
    expect(r.dateMax).toBe('2026-09-30');
    expect(r.rows[2].is_anulare).toBe(true);
  });
});

describe('utilitare', () => {
  it('monthsBetween peste an', () => {
    expect(monthsBetween('2025-11-15', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('pack/unpack', () => {
    const r = normalizeRow(['30.09.2026 15:46', '1', 'Chisinau - Ocnita 15:55', 'Chisinau GA', 'Edinet', 'PAT9 Nord', 'MLD 069', 'A B', 'Terminal', 'Numerar', '10']);
    if ('excluded' in r) throw new Error();
    expect(unpackRow(packRow(r))).toEqual(r);
  });
});
