import { describe, expect, it } from 'vitest';
import { curseReturPotrivite, pasageriText, politicaChei, rezumatTurRetur } from './tur-retur';

describe('rezumatTurRetur', () => {
  it('rotunjește pe loc, apoi înmulțește (ca serverul)', () => {
    expect(rezumatTurRetur({ pretTur: 150, pretRetur: 150, pasageri: 2, pct: 20 })).toEqual({ tur: 300, retur: 240, total: 540, pretRetur: 120 });
    expect(rezumatTurRetur({ pretTur: 157, pretRetur: 157, pasageri: 3, pct: 15 }).pretRetur).toBe(133);
    expect(rezumatTurRetur({ pretTur: 150, pretRetur: 150, pasageri: 1, pct: 25 }).total).toBe(263);
  });
  it('reducere imposibilă → pretRetur null', () => {
    expect(rezumatTurRetur({ pretTur: 10, pretRetur: 10, pasageri: 1, pct: 20 }).pretRetur).toBeNull();
  });
});

describe('curseReturPotrivite', () => {
  const tur = { crm_route_id: 7, trip_date: '2026-10-13', arrivalTime: '09:35' };
  const c = (id: number, zi: string, ora: string, sale = true) => ({ sale_open: sale, crm_route_id: id, trip_date: zi, time: ora });
  it('altă rută, după sosirea turului, doar cele vândute online', () => {
    const r = curseReturPotrivite(tur, [c(7, '2026-10-15', '06:30'), c(9, '2026-10-13', '09:00'), c(9, '2026-10-13', '17:00'), c(10, '2026-10-15', '06:30', false), c(11, '2026-10-15', '06:30')]);
    expect(r.map((x) => `${x.crm_route_id}|${x.time}`)).toEqual(['9|17:00', '11|06:30']);
  });
});

describe('pasageriText', () => {
  it('RO și RU cu pluralul corect', () => {
    expect(pasageriText(1, 'ro')).toBe('1 pasager');
    expect(pasageriText(3, 'ro')).toBe('3 pasageri');
    expect(pasageriText(1, 'ru')).toBe('1 пассажир');
    expect(pasageriText(2, 'ru')).toBe('2 пассажира');
    expect(pasageriText(4, 'ru')).toBe('4 пассажира');
  });
});

describe('politicaChei', () => {
  it('alegere schimbată (inclusiv doar returul) → chei noi + înlocuire', () => {
    expect(politicaChei({ alegereSchimbata: true })).toEqual({ chei: 'noi', inlocuieste: true });
  });
  it('banca n-a răspuns, alegerea e aceeași → aceleași chei (reluarea recuperează sesiunea)', () => {
    expect(politicaChei({ alegereSchimbata: false, codEroare: 'maib' })).toEqual({ chei: 'aceleasi', inlocuieste: false });
    expect(politicaChei({ alegereSchimbata: false, codEroare: 'in_lucru' })).toEqual({ chei: 'aceleasi', inlocuieste: false });
  });
  it('cheia refuzată → chei noi', () => {
    expect(politicaChei({ alegereSchimbata: false, codEroare: 'idempotenta' })).toEqual({ chei: 'noi', inlocuieste: true });
  });
  it('551: refuz clar (plafon «la retur», validare, loc ocupat) → chei noi; fără cod (rețea) → aceleași', () => {
    for (const c of ['plafon', 'validare', 'inchis', 'loc_ocupat']) expect(politicaChei({ alegereSchimbata: false, codEroare: c })).toEqual({ chei: 'noi', inlocuieste: true });
    expect(politicaChei({ alegereSchimbata: false, codEroare: null })).toEqual({ chei: 'aceleasi', inlocuieste: false });
    expect(politicaChei({ alegereSchimbata: false })).toEqual({ chei: 'aceleasi', inlocuieste: false });
  });
});
