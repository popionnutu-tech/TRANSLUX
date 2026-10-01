import { describe, expect, it } from 'vitest';
import {
  CULOARE, liniiBriceni, NUME_TIP, numeTip, randuriBriceni, tipuriLegenda, uzHarta, UZINE_HARTA, type IntervalHarta, type ScheletBriceniHarta,
} from './drax-harta';

const iv = (x: Partial<IntervalHarta>): IntervalHarta => ({ ora: '05:00–06:00', t0: 0, t1: 3600, tip: 'gol', cats: {}, km: 0, de: null, pana: null, ocol: false, lin: null, prelungit: null, s: [], ...x });

describe('harta Briceni (ION-148)', () => {
  it('cheia din adresă și rândurile lde_harta_zi «BRICENI»; celelalte uzine rămân', () => {
    expect(uzHarta('briceni')).toBe('briceni');
    expect(UZINE_HARTA.briceni.id).toBe('BRICENI');
    expect(UZINE_HARTA.briceni.control).toBe('BRICENI_HARTA');
    expect(uzHarta('ungheni')).toBe('ungheni');
    expect(uzHarta('camioane')).toBe('camioane');
    expect(uzHarta('trox')).toBe('drax');
  });
  it('«gol forțat» are culoarea lui, separată de livrare (Ion, 01.10, răspunsul 5)', () => {
    expect(CULOARE.fortat).not.toBe(CULOARE.gol);
    expect(tipuriLegenda('briceni')).toEqual(['cursa', 'gol', 'fortat', 'munca', 'parcare']);
    expect(numeTip('briceni', 'gol')).toBe('livrare (gol de tăiat)');
    expect(numeTip('briceni', 'fortat')).toBe(NUME_TIP.fortat);
    // legenda celorlalte uzine nu se schimbă
    expect(tipuriLegenda('drax')).toEqual(['cursa', 'gol', 'munca', 'uzina']);
    expect(tipuriLegenda('camioane')).toEqual(['plin', 'gol', 'punct', 'parcare']);
    expect(numeTip('camioane', 'parcare')).toBe('stă (≥ 1 h)');
    expect(numeTip('drax', 'gol')).toBe('gol');
  });
  it('rândul zilei arată km pe categoriile raportului: ocolul pe acasă = livrare + drumul impus', () => {
    const r = randuriBriceni([
      iv({ ora: '04:40–05:35', tip: 'cursa', km: 32.1, cats: { cuOameni: 32.1 }, de: 'Groznița', pana: 'poarta Trox' }),
      iv({ ora: '14:30–18:10', tip: 'fortat', km: 40.9, cats: { livrare: 8.7, golTure: 32.2 }, de: 'poarta Trox', pana: 'acasă (Bălcăuți)', nota: 'drumul gol impus de ture, pe traseul rutei — l-ar face oricum' }),
      iv({ ora: '18:10–19:00', tip: 'gol', km: 24, cats: { livrare: 24 }, de: 'acasă (Bălcăuți)', pana: 'Groznița' }),
      iv({ ora: '19:00–20:00', tip: 'parcare', km: 0.1, cats: { stat: 0.1 }, de: 'Groznița', pana: 'Groznița' }),
    ]);
    expect(r[0].text).toBe('Groznița → poarta Trox, 32,1 km cu oameni');
    expect(r[1].text).toBe('poarta Trox → acasă (Bălcăuți), 8,7 km livrare + 32,2 km gol între ture · drumul gol impus de ture, pe traseul rutei — l-ar face oricum');
    expect(r[1].tare).toBe(false);
    expect(r[2].tare).toBe(true);
    expect(r[3]).toEqual({ ora: '19:00–20:00', tip: 'parcare', text: 'stă la Groznița', tare: false });
  });
  it('liniile mașinii din schelet + poarta Trox și autogara, una lângă alta', () => {
    const s: ScheletBriceniHarta = {
      gara: [48.357826, 27.092106], poarta: [48.34648, 27.08318],
      rute: [
        { id: 'T2', nume: 'Trestieni-Groznița', capat: 'Groznița', shape: [[48.3, 27.1], [48.34, 27.08]], stops: [{ n: 'Groznița', c: [48.3, 27.1] }] },
        { id: '46+52+53+54', nume: 'Coteala', capat: 'Medveja', shape: [], stops: [] },
        { id: '45', nume: 'Colicăuți', capat: 'Colicăuți', shape: [], stops: [] },
      ],
    };
    const r = liniiBriceni(s, ['T2', '46+52+53+54']);
    expect(r.linii.map((l) => l.id)).toEqual(['T2 · Trestieni-Groznița', '46+52+53+54 · Coteala']);
    expect(r.linii[0].sate).toEqual([{ n: 'Groznița', c: [48.3, 27.1] }]);
    expect(r.porti.map((p) => p.n)).toEqual(['poarta Trox', 'autogara Briceni']);
  });
});
