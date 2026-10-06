import { describe, expect, it } from 'vitest';
import { randuriDinIntervale, randuriPlan, uzHarta, UZINE_HARTA, type CursaPlan, type IntervalHarta } from './drax-harta';

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

describe('«schelet întâi» pe hartă (ION-268)', () => {
  it('cursa din plan își spune rolul; cea de confirmat (neconfirmată, în plus, posibil s3) nu se numește «cu oameni»', () => {
    const r = randuriDinIntervale([
      iv({ ora: '04:56–05:28', tip: 'cursa', km: 22.6, de: 'Zăzulenii Noi', pana: 'poarta LEAR', eticheta: 'Tur s1 · B6 Zăzulenii Noi' }),
      iv({ ora: '13:31–14:03', tip: 'cursa', km: 26.3, de: 'Gherman', pana: 'poarta LEAR', cats: { neconfirmat: 26.3 }, eticheta: 'Posibil cursă schimbul 3 (tur) · A8 Horești — de confirmat' }),
    ]);
    expect(r[0].text).toBe('Tur s1 · B6 Zăzulenii Noi: Zăzulenii Noi → poarta LEAR, 22,6 km cu oameni');
    expect(r[1].text).toBe('Posibil cursă schimbul 3 (tur) · A8 Horești — de confirmat: Gherman → poarta LEAR, 26,3 km');
  });
  it('planul zilei: ordinea s1 tur, s1 retur, s2 …, statutul și motivul lipsei', () => {
    const c = (x: Partial<CursaPlan>): CursaPlan => ({ sens: 'tur', schimb: 1, tura: 'B', ruta: 'B6', capat: 'Zăzulenii Noi', statut: 'facuta', t0: 0, t1: 1, km: 22.6, kmSchelet: 21.5, urcari: 10, motiv: null, ...x });
    const r = randuriPlan([
      c({ sens: 'retur', schimb: 2, tura: 'A', ruta: null, capat: null, statut: 'lipsa', km: null, urcari: 0, motiv: 'nicio plecare de la poartă în fereastra 21:30–02:30' }),
      c({ sens: 'retur', ruta: 'A5', capat: 'Gherman', km: 26.3, kmSchelet: 25.1, urcari: 0, peDrum: true, acoperire: 100 }),
      c({}),
    ]);
    expect(r.map((x) => x.cheie)).toEqual(['1-tur', '1-retur', '2-retur']);
    expect(r[0].text).toBe('Tur s1 · B6 Zăzulenii Noi: făcută, 22,6 km (schelet 21,5), 10 urcări');
    expect(r[1].text).toBe('Retur s1 · A5 Gherman: făcută, 26,3 km (schelet 25,1), pe drumul rutei (100 %), fără urcări văzute');
    expect(r[2].text).toBe('Retur s2 · —: lipsă — nicio plecare de la poartă în fereastra 21:30–02:30');
  });
});
