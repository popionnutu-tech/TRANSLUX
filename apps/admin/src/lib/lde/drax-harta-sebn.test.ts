import { describe, expect, it } from 'vitest';
import { CULOARE, LINIE, NUME_TIP, masiniSaptamana, randuriDinIntervale, tipuriLegenda, uzHarta, UZINE_HARTA, type IntervalHarta, type RandListaHarta } from './drax-harta';

// ION-147 (Ion, 30.09.2026: «creează-le hărțile la toate direcțiile cu punctele optimale de dormit cum ai făcut la Drăxlmaier și LEAR»)
const iv = (x: Partial<IntervalHarta>): IntervalHarta => ({ ora: '05:00–06:00', t0: 0, t1: 3600, tip: 'gol', cats: {}, km: 0, de: null, pana: null, ocol: false, lin: null, prelungit: null, s: [], ...x });

describe('harta SEBN (ION-147)', () => {
  it('cheia din adresă și uzina din lde_harta_zi; celelalte rămân cum erau', () => {
    expect(uzHarta('sebn')).toBe('sebn');
    expect(UZINE_HARTA.sebn.id).toBe('SEBN');
    expect(UZINE_HARTA.sebn.schelet).toBe('schelet-sebn.json');
    expect(UZINE_HARTA.sebn.porti.map((p) => p.n)).toEqual(['poarta SEBN Orhei', 'SEBN Orhei — punctul Bucuria', 'poarta SEBN Strășeni']);
    expect(uzHarta('ungheni')).toBe('ungheni');
    expect(uzHarta('camioane')).toBe('camioane');
    expect(uzHarta('SEBN')).toBe('drax');
    expect(tipuriLegenda('ungheni')).toEqual(['cursa', 'gol', 'munca', 'uzina']);
    expect(tipuriLegenda('drax')).toEqual(['cursa', 'gol', 'munca', 'uzina']);
  });
  it('bucla la predarea turei e o categorie separată în legendă, cu culoarea ei', () => {
    expect(tipuriLegenda('sebn')).toEqual(['cursa', 'gol', 'bucla', 'munca', 'uzina']);
    expect(NUME_TIP.bucla).toBe('buclă la predarea turei');
    expect(CULOARE.bucla).not.toBe(CULOARE.gol);
    expect(LINIE.bucla).toBeDefined();
  });
  it('rândul zilei pentru buclă: nu e drum de parcare și nu e îngroșat ca golul mare', () => {
    const r = randuriDinIntervale([
      iv({ ora: '14:35–15:40', tip: 'bucla', km: 21.2, de: 'poarta SEBN Orhei', pana: 'poarta SEBN Orhei' }),
      iv({ ora: '15:40–21:30', tip: 'gol', km: 78.4, de: 'poarta SEBN Orhei', pana: 'Vatici' }),
    ]);
    expect(r[0]).toEqual({ ora: '14:35–15:40', tip: 'bucla', text: 'pe la poarta SEBN Orhei, 21,2 km buclă la predarea turei (nu e drum de parcare)', tare: false });
    expect(r[1].tare).toBe(true);
  });
  it('lista mașinilor: cifra săptămânii din parcare; mașina fără parcare are 0', () => {
    const rows: RandListaHarta[] = [
      { m: '552BRAO', z: '2026-09-21', sumar: { dow: 1, total: 400, cuOameni: 150, gol: 230, economie: 199, ideal: null, linii: ['S1'], economieSapt: 996, sursaEconomie: 'parcare', bucla: 0 } },
      { m: '152BRAZ', z: '2026-09-21', sumar: { dow: 1, total: 300, cuOameni: 100, gol: 50, economie: null, ideal: null, linii: ['R23'], economieSapt: 0, motivAfara: 'rută ADM (R23) — doar harta', sursaEconomie: 'parcare' } },
    ];
    const m = masiniSaptamana(rows);
    expect(m.map((x) => [x.m, x.economie])).toEqual([['552BRAO', 996], ['152BRAZ', 0]]);
  });
});
