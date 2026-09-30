import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cadru, liniiCamioane, masiniCamioane, randuriCamioane, tipuriLegenda, uzHarta, UZINE_HARTA, CULOARE, NUME_TIP,
  type IntervalHarta, type RandListaHarta, type ScheletCamioaneHarta, type SumarZiHarta, type ZiHarta,
} from './drax-harta';

// ION-150 (Ion, 30.09.2026: «drumul față de schelet, P1/P2 doar informativ»): harta cisternelor pe /lde/harta?uz=camioane.
const iv = (x: Partial<IntervalHarta>): IntervalHarta => ({ ora: '05:00–06:00', t0: 0, t1: 3600, tip: 'gol', cats: {}, km: 0, de: null, pana: null, ocol: false, lin: null, prelungit: null, s: [], ...x });
const sum = (x: Partial<SumarZiHarta>): SumarZiHarta => ({ dow: 1, total: 0, cuOameni: 0, gol: 0, economie: null, ideal: null, linii: [], ...x });

describe('harta cisternelor (ION-150)', () => {
  it('cheia din adresă: camioane → CAMIOANE; celelalte rămân cum erau', () => {
    expect(uzHarta('camioane')).toBe('camioane');
    expect(UZINE_HARTA.camioane.id).toBe('CAMIOANE');
    expect(uzHarta('ungheni')).toBe('ungheni');
    expect(uzHarta(undefined)).toBe('drax');
    expect(uzHarta('cisterne')).toBe('drax');
  });

  it('legenda: cisternele plin / gol / la punct / stă; uzinele tipurile vechi', () => {
    expect(tipuriLegenda('camioane')).toEqual(['plin', 'gol', 'punct', 'parcare']);
    expect(tipuriLegenda('drax')).toEqual(['cursa', 'gol', 'munca', 'uzina']);
    for (const t of tipuriLegenda('camioane')) { expect(CULOARE[t]).toMatch(/^#/); expect(NUME_TIP[t]).toBeTruthy(); }
  });

  it('rândurile zilei: drumul cu km, staționarea cu durata și judecata; abaterea îngroșată', () => {
    const r = randuriCamioane([
      iv({ ora: '06:10–14:40', tip: 'plin', km: 412.3, de: 'Port Constanța', pana: 'Albina', nota: 'cu motorină Port Constanța → Bacioi' }),
      iv({ ora: '14:40–24:00', t0: 0, t1: 33600, tip: 'parcare', de: 'Albina', pana: 'Albina', nota: 'odihnă la 18 km de drumul ideal — abatere', abatere: true, durataMin: 720 }),
      iv({ ora: '00:00–01:30', t0: 0, t1: 5400, tip: 'punct', de: 'Bacioi', pana: 'Bacioi', nota: 'descarcă', durataMin: 90 }),
    ]);
    expect(r[0]).toEqual({ ora: '06:10–14:40', tip: 'plin', text: 'Port Constanța → Albina, 412,3 km · cu motorină Port Constanța → Bacioi', tare: false });
    expect(r[1].text).toBe('Albina, 9 h 20 min (în total 12 h 00 min) — odihnă la 18 km de drumul ideal — abatere');
    expect(r[1].tare).toBe(true);
    expect(r[2].text).toBe('Bacioi, 1 h 30 min — descarcă');
  });

  it('lista: cele cu km peste ideal întâi, apoi cele mai rulate; P1/P2 nu intră în cifre', () => {
    const rows: RandListaHarta[] = [
      { m: 'KWX620', z: '2026-09-22', sumar: sum({ total: 300, plin: 120, kmPlus: 0 }) },
      { m: 'LJN076', z: '2026-09-22', sumar: sum({ total: 200, plin: 200, kmPlus: 157.8, nrAbateri: 1 }) },
      { m: 'LJN076', z: '2026-09-23', sumar: sum({ total: 100, plin: 0, kmPlus: 0 }) },
      { m: 'ANT344', z: '2026-09-22', sumar: sum({ total: 5 }) },
    ];
    const m = masiniCamioane(rows);
    expect(m.map((x) => x.m)).toEqual(['LJN076', 'KWX620', 'ANT344']);
    expect(m[0]).toMatchObject({ total: 300, kmPlus: 158, nrAbateri: 1, plin: 200, economie: 0 });
  });

  it('liniile zilei din schelet-camioane.json, după cheile scrise de harta.mjs', () => {
    const s = JSON.parse(readFileSync(path.join(__dirname, '../../../public/lde/schelet-camioane.json'), 'utf8')) as ScheletCamioaneHarta;
    const l = liniiCamioane(s, ['m|Port Constanța → Bacioi|baza-alb', 'b|B2|ideal1', 'm|nu există|baza-giu', 'x|y|z']);
    expect(l).toHaveLength(2);
    expect(l[0].id).toMatch(/^Port Constanța → Bacioi · .*Albița/);
    expect(l[0].plin.length).toBeGreaterThan(50);
    expect(l[1].id).toMatch(/^B2 Berdichev → Sofia/);
  });

  it('cadrul: locurile informative nu lărgesc ziua; mașina care stă are un cadru mic', () => {
    const zi = (x: Partial<ZiHarta>): ZiHarta => ({ t00: 0, casa: null, noapteA: null, noapteB: null, linii: [], iv: [], stai: [], zi: null, ideal: null, ...x });
    const parcare = { locuri: [{ nr: 1, n: 'Novi Iskăr', fel: 'drum', c: [42.8, 23.4] as [number, number], drumuri: 1 }], economieSapt: 0, idealSapt: null, zi: null, legi: [], informativ: true };
    const b = cadru(zi({ iv: [iv({ s: [[47, 28.9, 0], [47.1, 29, 60]] })], parcare }), []);
    expect(b).toEqual([[47, 28.9], [47.1, 29]]);
    const st = cadru(zi({ iv: [iv({ tip: 'parcare', s: [[47, 28.9, 0]] })], parcare }), []);
    expect(st![0][0]).toBeCloseTo(46.97); expect(st![1][1]).toBeCloseTo(28.94);
    // fără «informativ» (Drăxlmaier / LEAR) comportamentul vechi: locul propus intră în cadru
    const d = cadru(zi({ iv: [iv({ s: [[47, 28.9, 0], [47.1, 29, 60]] })], parcare: { ...parcare, informativ: undefined } }), []);
    expect(d![0][0]).toBe(42.8);
  });
});
