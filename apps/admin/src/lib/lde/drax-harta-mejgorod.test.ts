import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CULOARE, LINIE, NUME_TIP, gariMejgorod, liniiMejgorod, masiniSaptamana, randuriMejgorod, textRute, tipuriLegenda, uzHarta, UZINE_HARTA,
  type IntervalHarta, type RandListaHarta, type ScheletMejgorodHarta, type SumarZiHarta,
} from './drax-harta';
import { textDrum } from './drax-parcare';

// ION-149 (Ion, 01.10.2026: «adaugă toate direcțiile»): harta rutelor interurbane pe /lde/harta?uz=mejgorod, locul de noapte P1/P2.
const iv = (x: Partial<IntervalHarta>): IntervalHarta => ({ ora: '05:00–06:00', t0: 0, t1: 3600, tip: 'gol', cats: {}, km: 0, de: null, pana: null, ocol: false, lin: null, prelungit: null, s: [], ...x });
const sum = (x: Partial<SumarZiHarta>): SumarZiHarta => ({ dow: 1, total: 0, cuOameni: 0, gol: 0, economie: null, ideal: null, linii: [], ...x });

describe('harta mejgorod (ION-149)', () => {
  it('cheia din adresă: mejgorod → MEJGOROD; celelalte uzine rămân cum erau', () => {
    expect(uzHarta('mejgorod')).toBe('mejgorod');
    expect(UZINE_HARTA.mejgorod.id).toBe('MEJGOROD');
    expect(uzHarta('camioane')).toBe('camioane');
    expect(uzHarta('ungheni')).toBe('ungheni');
    expect(uzHarta(undefined)).toBe('drax');
    expect(uzHarta('interurban')).toBe('drax');
  });

  it('legenda: cursă / gol / stă / timp liber / muncă știută; timpul liber are culoarea lui', () => {
    expect(tipuriLegenda('mejgorod')).toEqual(['cursa', 'gol', 'parcare', 'liber', 'munca']);
    expect(tipuriLegenda('drax')).toEqual(['cursa', 'gol', 'munca', 'uzina']);
    expect(CULOARE.liber).toMatch(/^#/); expect(LINIE.liber).toBeTruthy(); expect(NUME_TIP.liber).toMatch(/timp liber/);
  });

  it('rândurile zilei: cursa, noaptea cu durata, timpul liber îngroșat peste 20 km', () => {
    const r = randuriMejgorod([
      iv({ ora: '15:10–19:42', tip: 'cursa', km: 251.4, de: 'gara Chișinău', pana: 'Caracușenii Vechi', nota: 'ruta 26 retur' }),
      iv({ ora: '19:42–20:40', tip: 'gol', km: 31.2, de: 'Caracușenii Vechi', pana: 'Halahora de Sus', nota: 'gol de noapte (spre / de la locul nopții)' }),
      iv({ ora: '20:40–24:00', t0: 0, t1: 12000, tip: 'parcare', de: 'Halahora de Sus', pana: 'Halahora de Sus', nota: 'noaptea', durataMin: 560 }),
      iv({ ora: '11:05–12:20', tip: 'liber', km: 73.6, de: 'Criva', pana: 'Criva', nota: 'timp liber în pauza de prânz' }),
    ]);
    expect(r[0]).toEqual({ ora: '15:10–19:42', tip: 'cursa', text: 'gara Chișinău → Caracușenii Vechi, 251,4 km cu oameni · ruta 26 retur', tare: false });
    expect(r[1].tare).toBe(true);
    expect(r[2].text).toBe('Halahora de Sus, 3 h 20 min (în total 9 h 20 min) — noaptea');
    expect(r[3].text).toBe('pe la Criva, 73,6 km timp liber · timp liber în pauza de prânz');
    expect(r[3].tare).toBe(true);
  });

  it('lista: cifra săptămânii a mașinii (locul de noapte), cele mai mari întâi; mașina fără loc are 0', () => {
    const rows: RandListaHarta[] = [
      { m: '688AKD', z: '2026-09-21', sumar: sum({ total: 560, economie: 64, economieSapt: 335.3, linii: ['26'] }) },
      { m: '688AKD', z: '2026-09-22', sumar: sum({ total: 570, economie: 40, economieSapt: 335.3, linii: ['26'] }) },
      { m: '654TWK', z: '2026-09-21', sumar: sum({ total: 540, economie: null, economieSapt: 0, linii: ['14'] }) },
    ];
    const m = masiniSaptamana(rows);
    expect(m.map((x) => [x.m, x.economie])).toEqual([['688AKD', 335.3], ['654TWK', 0]]);
    expect(textRute('mejgorod', m[0].linii)).toBe('ruta 26');
    expect(textRute('mejgorod', [])).toBe('fără rută');
    expect(textRute('drax', ['R4|L2'])).toBe('R4 · L2');
  });

  it('noaptea care rămâne cum e și noaptea prin P1', () => {
    const locuri = [{ nr: 1, n: 'Tețcani (capătul rutei)' }];
    expect(textDrum({ loc: 1, acum: 'Halahora de Sus' }, locuri)).toBe('P1 Tețcani (capătul rutei)');
    expect(textDrum({ loc: 0, acum: 'Briceni (parcare existentă)' }, locuri)).toBe('rămâne cum e (acum: Briceni (parcare existentă))');
  });

  it('rutele mașinii și gările din public/lde/schelet-mejgorod.json', () => {
    const s = JSON.parse(readFileSync(path.join(__dirname, '../../../public/lde/schelet-mejgorod.json'), 'utf8')) as ScheletMejgorodHarta;
    const l = liniiMejgorod(s, ['26', '1', '999']);
    expect(l.map((x) => x.id).sort()).toEqual(['ruta 1', 'ruta 26']);
    for (const x of l) { expect(x.plin.length).toBeGreaterThan(50); expect(x.sate.length).toBeGreaterThan(5); expect(x.capat).toBeTruthy(); }
    const g = gariMejgorod(s);
    expect(g.find((x) => x.n === 'gara Chișinău')?.c[0]).toBeCloseTo(47.024, 2);
    expect(g.length).toBe(7);
  });
});
