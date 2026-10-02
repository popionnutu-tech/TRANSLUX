import { describe, expect, it } from 'vitest';
import { descriePereche, fmtInterval, motivFaraPiata, piataCheie } from './piata';
import type { Piata, PiataPereche } from './types';

const piata = (luni: string[]): Piata => ({ luni, prima_luna: '2026-05-01', parametri: { pondere_imbarcare: 0.4 }, perechi: [] });

describe('piataCheie', () => {
  it('e ordonată, fără diacritice și fără «GA», ca piata_cheie din SQL', () => {
    expect(piataCheie('Chisinau GA - Briceni')).toBe('briceni|chisinau');
    expect(piataCheie('Briceni - Chișinău')).toBe('briceni|chisinau');
  });
  it('aplică alias-urile din tiki_stop_map (scrierea TIKI)', () => {
    expect(piataCheie('Chisinau - Beleavineti')).toBe('beleavinti|chisinau');
    expect(piataCheie('sl. Sirauti - Chisinau')).toBe('chisinau|sirauti');
  });
});

describe('motivFaraPiata', () => {
  const f = { from: '2026-08-01', to: '2026-09-30', route: '', driver: '' };
  it('filtrul de cursă / șofer oprește coloana', () => {
    expect(motivFaraPiata({ ...f, route: 'Chisinau - Lipcani 10:40' }, piata(['2026-08']))).toMatch(/filtrul de cursă/);
  });
  it('perioada fără lună încheiată calculată → sfat, nu zero', () => {
    expect(motivFaraPiata(f, piata([]))).toMatch(/luni încheiate/);
  });
  it('perioada dinainte de prima lună cu locuri', () => {
    expect(motivFaraPiata({ ...f, from: '2026-03-01', to: '2026-03-31' }, piata([]))).toMatch(/mai 2026/);
  });
  it('cu luni calculate și fără filtre coloana se arată', () => {
    expect(motivFaraPiata(f, piata(['2026-08', '2026-09']))).toBeNull();
  });
});

describe('fmtInterval', () => {
  it('o singură cifră când nu sunt concurenți, interval altfel', () => {
    expect(fmtInterval(2396, 2396)).toBe('2.396');
    expect(fmtInterval(2946.4, 3166.2)).toBe('2.946–3.166');
  });
});

describe('descriePereche', () => {
  const p: PiataPereche = {
    cheie: 'briceni|chisinau', de_la: 'Chisinau', pana_la: 'Briceni', tip: 'coada', bilete: 2396, omisi: 140, omisi_acoperire: 0.9,
    conc_min: 393, conc_max: 550, piata_min: 2789, piata_max: 2946, cota: 0.835, oras: 5785, bazin: 9300, bazin_echiv: 8000,
    aford_net: 0.064, aford_pensie: 0.15, steaguri: ['regula40_extinsa'], luni: 1,
    detalii: { raion: 'Briceni', delta: 1, curse: [{ firma: 'Pascari', cursa: 'Chișinău GA Nord - Briceni GA', sens: 'chisinau_nord', ora: '09:05', bpp: 114.1, tranzit: 1, luna: 46 }] },
  };
  it('spune ce e observat, ce e estimat și ce e presupus', () => {
    const t = descriePereche(p, { pondere_imbarcare: 0.4 });
    expect(t).toContain('Bilete observate (ziua cursei): 2.396');
    expect(t).toContain('~Omiși de TIKI (estimare');
    expect(t).toContain('40 % din 20 locuri pe plecare');
    expect(t).toContain('Pascari');
    expect(t).toContain('numitor de scară');
    expect(t).toContain('⚑ regula 40 %');
  });
  it('perechile de trunchi nu au concurenți în text; cele fără Chișinău au', () => {
    expect(descriePereche({ ...p, tip: 'trunchi', conc_min: 0, conc_max: 0 })).not.toContain('Concurenți (ANTA)');
    expect(descriePereche({ ...p, tip: 'mic', conc_min: 0, conc_max: 0 })).toContain('sat mic');
    const t = descriePereche({ ...p, tip: 'local' });
    expect(t).toContain('Concurenți (ANTA)');
    expect(t).toContain('fără Chișinău');
  });
});
