import { describe, expect, it } from 'vitest';
import { randuriDinIntervale, uzHarta, UZINE_HARTA, type IntervalHarta } from './drax-harta';

const iv = (x: Partial<IntervalHarta>): IntervalHarta => ({ ora: '05:00–06:00', t0: 0, t1: 3600, tip: 'gol', cats: {}, km: 0, de: null, pana: null, ocol: false, lin: null, prelungit: null, s: [], ...x });

describe('harta LEAR (ION-143)', () => {
  it('cheia din adresă: ungheni / floresti, altfel Drăxlmaier', () => {
    expect(uzHarta('ungheni')).toBe('ungheni');
    expect(uzHarta('floresti')).toBe('floresti');
    expect(uzHarta(undefined)).toBe('drax');
    expect(uzHarta('lear')).toBe('drax');
    expect(UZINE_HARTA.ungheni.id).toBe('LEAR_UNGHENI');
    expect(UZINE_HARTA.floresti.id).toBe('LEAR_FLORESTI');
  });
  it('rândurile zilei din intervale: drum, km, fel; golul mare îngroșat', () => {
    const r = randuriDinIntervale([
      iv({ ora: '04:27–05:49', tip: 'cursa', km: 23.4, de: 'Bulhac', pana: 'poarta LEAR' }),
      iv({ ora: '05:49–13:27', tip: 'gol', km: 94.4, de: 'poarta LEAR', pana: 'Todirești' }),
      iv({ ora: '14:02–14:40', tip: 'uzina', km: 0.3, de: 'poarta LEAR', pana: 'poarta LEAR' }),
    ]);
    expect(r[0]).toEqual({ ora: '04:27–05:49', tip: 'cursa', text: 'Bulhac → poarta LEAR, 23,4 km cu oameni', tare: false });
    expect(r[1].text).toBe('poarta LEAR → Todirești, 94,4 km gol');
    expect(r[1].tare).toBe(true);
    expect(r[2].text).toBe('0,3 km așteaptă la poartă');
  });
});

import { textDrum } from './drax-parcare';
describe('programul pe drum LEAR (ION-143, Codex r1 C2)', () => {
  const locuri = [{ nr: 1, n: 'Petrești' }, { nr: 2, n: 'la uzină (poarta LEAR)' }];
  it('drumul prin loc și drumul care rămâne cum e', () => {
    expect(textDrum({ loc: 1, acum: 'Fălești' }, locuri)).toBe('P1 Petrești');
    expect(textDrum({ loc: 0, acum: 'Fălești' }, locuri)).toBe('rămâne cum e (acum: Fălești)');
    expect(textDrum({ loc: 0, acum: null }, locuri)).toBe('rămâne cum e');
  });
});
