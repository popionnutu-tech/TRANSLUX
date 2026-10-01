import { describe, it, expect } from 'vitest';
import { saleToCsvCols, type MobiletSale } from './mobilet';
import { normalizeRow, parseTikiExport, ticketKey, TIKI_HEADER } from '@/app/(dashboard)/numarare/tabs/bilete/ticketParse';

const sale: MobiletSale = {
  id: 1166221, number: '36-569-9317', date: '30.09.2026 20:34', soldAt: '30.09.2026 20:34', tripId: 143417,
  route: '16:25 Otaci - Chisinau', seller: 'PAT9 Nord', vehicle: 'RQR 298', driver: 'SERGHEI BARBACARI',
  payment: 4, fromPoint: 'Peresecina ', toPoint: 'Chisinau GA', channel: 'TERMINAL', amount: 34.51,
};

describe('saleToCsvCols', () => {
  it('vânzarea din API = rândul din exportul CSV (aceeași cheie, fără dubluri)', () => {
    const fromApi = normalizeRow(saleToCsvCols(sale));
    const csv = [
      TIKI_HEADER.map(h => `"${h}"`).join(';'),
      '"30.09.2026 20:34";"36-569-9317";"16:25 Otaci - Chisinau";"Peresecina";"Chisinau GA";"PAT9 Nord";"RQR 298";"SERGHEI BARBACARI";"Terminal";"Numerar";"34.51"',
    ].join('\r\n');
    const fromCsv = parseTikiExport(csv);
    if ('excluded' in fromApi || 'error' in fromCsv) throw new Error('nu s-a citit');
    expect(fromApi).toEqual(fromCsv.rows[0]);
    expect(ticketKey(fromApi)).toBe(ticketKey(fromCsv.rows[0]));
  });

  it('codurile de plată', () => {
    const pay = (payment: number | null) => saleToCsvCols({ ...sale, payment })[TIKI_HEADER.indexOf('Plată')];
    expect(pay(0)).toBe('Altă metodă de plată');
    expect(pay(4)).toBe('Numerar');
    expect(pay(5)).toBe('Card POS');
    expect(pay(9)).toBe('cod 9');
  });

  it('fără stații → «—», ca în exportul vechi', () => {
    const r = normalizeRow(saleToCsvCols({ ...sale, fromPoint: '—', toPoint: null }));
    if ('excluded' in r) throw new Error();
    expect(r.from_station).toBeNull();
    expect(r.pair).toBeNull();
  });
});
