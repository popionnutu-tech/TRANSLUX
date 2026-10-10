import { describe, it, expect } from 'vitest';
import {
  agregaPeRute, capeteCuOre, perioadaImplicita, lunaTrecuta, valideazaPerioada, zileInclusiv,
} from './raport-rute';
import type { Anomaly, GraficRouteRow, OrphanManual } from './incasareActions';

function row(p: Partial<GraficRouteRow> & { crm_route_id: number; ziua: string }): GraficRouteRow {
  return {
    assignment_id: null, row_key: `${p.crm_route_id}-${p.ziua}`,
    route_name: `R${p.crm_route_id}`, time_nord: '08:00', time_chisinau: null,
    driver_id: 'd', driver_name: 'Șofer', vehicle_plate: null, vehicle_plate_retur: null,
    foaie_nr: '1', foaie_source: 'explicit', cancelled: false,
    counting_session_id: null, counting_status: null,
    tur_total_lei: null, retur_total_lei: null, tur_single_lei: null, retur_single_lei: null,
    numarare_lei: 0, numarare_single_lei: null, extra_2tarife_lei: null,
    incasare_numerar: 0, incasare_diagrama: 0, ligotniki0_suma: 0, ligotniki_vokzal_suma: 0,
    dt_suma: 0, dop_rashodi: 0, incasare_lei: 0, plati: 0, comment: null, fiscal_nrs: null,
    diff: 0, status: 'ok',
    ...p,
  };
}

const ri = (route_type: string) => ({ route_type, time_chisinau: null });
const types = new Map([[1, ri('interurban')], [2, ri('interurban')], [44, ri('suburban')]]);

describe('agregaPeRute', () => {
  it('adună cele șase rubrici în Total foaie, pe rută', () => {
    const r = agregaPeRute('2026-09-01', '2026-09-30', [
      row({ crm_route_id: 1, ziua: '2026-09-01', incasare_numerar: 1000, incasare_diagrama: 100,
        ligotniki0_suma: 50, ligotniki_vokzal_suma: 20, dt_suma: 300, dop_rashodi: 30, numarare_lei: 1400 }),
      row({ crm_route_id: 1, ziua: '2026-09-02', incasare_numerar: 900, numarare_lei: 1000 }),
    ], types, [], []);
    expect(r.rute).toHaveLength(1);
    const a = r.rute[0];
    expect(a.total).toBe(2400);
    expect(a.numerar).toBe(1900);
    expect(a.dt).toBe(300);
    expect(a.curse).toBe(2);
    expect(a.cuIncasare).toBe(2);
    expect(a.mediePeCursa).toBe(1200);
    expect(a.diferenta).toBe(2400 - 2400);
  });

  it('Cu + Fără = Curse, judecat pe Total (nu pe statut): doar ligotnici = cu încasare', () => {
    const r = agregaPeRute('a', 'b', [
      row({ crm_route_id: 1, ziua: '2026-09-01', ligotniki0_suma: 80, numarare_lei: 500, status: 'no_incasare' }),
      row({ crm_route_id: 1, ziua: '2026-09-02', status: 'no_data' }),
      row({ crm_route_id: 1, ziua: '2026-09-03', foaie_nr: null, status: 'empty' }),
      row({ crm_route_id: 1, ziua: '2026-09-04', numarare_lei: 700, status: 'no_incasare' }),
    ], types, [], []);
    const a = r.rute[0];
    expect(a.curse).toBe(4);
    expect(a.cuIncasare).toBe(1);
    expect(a.faraIncasare).toBe(3);
    expect(a.cuIncasare + a.faraIncasare).toBe(a.curse);
    expect(a.numaratFaraIncasare).toBe(700);
    expect(a.steag).toBe(true);
  });

  it('cursa anulată: banii ei intră în total, dar nu e numărată la curse', () => {
    const r = agregaPeRute('a', 'b', [
      row({ crm_route_id: 1, ziua: '2026-09-01', cancelled: true, incasare_diagrama: 40, status: 'cancelled' }),
      row({ crm_route_id: 1, ziua: '2026-09-02', incasare_numerar: 100 }),
    ], types, [], []);
    const a = r.rute[0];
    expect(a.total).toBe(140);
    expect(a.curse).toBe(1);
    expect(a.anulate).toBe(1);
    expect(r.totalRute.total).toBe(140);
  });

  it('diferența doar pe cursele cu bani ȘI numărare; numărarea totală pe toate', () => {
    const r = agregaPeRute('a', 'b', [
      row({ crm_route_id: 1, ziua: '2026-09-01', incasare_numerar: 900, numarare_lei: 1000 }),
      row({ crm_route_id: 1, ziua: '2026-09-02', incasare_numerar: 500, numarare_lei: 0 }),
      row({ crm_route_id: 1, ziua: '2026-09-03', numarare_lei: 800 }),
    ], types, [], []);
    const a = r.rute[0];
    expect(a.diferenta).toBe(-100);
    expect(a.numarare).toBe(1800);
  });

  it('medie «—» (null) când ruta n-are nicio cursă cu bani; fără steag sub 3 curse', () => {
    const r = agregaPeRute('a', 'b', [
      row({ crm_route_id: 2, ziua: '2026-09-01', numarare_lei: 100 }),
      row({ crm_route_id: 2, ziua: '2026-09-02', numarare_lei: 100 }),
    ], types, [], []);
    expect(r.rute[0].mediePeCursa).toBeNull();
    expect(r.rute[0].steag).toBe(false);
  });

  it('grupează interurban înaintea suburbanului, în grup după plecarea din Chișinău, cu subtotaluri', () => {
    const cu = new Map([
      [1, { route_type: 'interurban', time_chisinau: '18:30 - 22:35' }],
      [2, { route_type: 'interurban', time_chisinau: '06:55 - 11:00' }],
      [3, { route_type: 'interurban', time_chisinau: null }],
      [44, { route_type: 'suburban', time_chisinau: null }],
    ]);
    const r = agregaPeRute('a', 'b', [
      row({ crm_route_id: 44, ziua: '2026-09-01', incasare_numerar: 5000 }),
      row({ crm_route_id: 1, ziua: '2026-09-01', incasare_numerar: 100 }),
      row({ crm_route_id: 3, ziua: '2026-09-01', incasare_numerar: 0 }),
      row({ crm_route_id: 2, ziua: '2026-09-01', incasare_numerar: 300 }),
    ], cu, [], []);
    expect(r.rute.map(x => x.crm_route_id)).toEqual([2, 1, 3, 44]);
    expect(r.subtotaluri.interurban.total).toBe(400);
    expect(r.subtotaluri.interurban.rute).toBe(3);
    expect(r.subtotaluri.suburban.total).toBe(5000);
    expect(r.totalRute.total).toBe(5400);
  });

  it('orfanii de terminal se adună pe cele șase rubrici din breakdown, nu pe incasare_lei', () => {
    const o: Anomaly = {
      receipt_nr: 'Empty', ziua: '2026-09-27', category: 'INVALID_FORMAT', plati: 1,
      incasare_lei: 7236.59,
      breakdown: { numerar: 6450, diagrama: 786.59, ligotniki0_suma: 200, ligotniki_vokzal_suma: 0,
        dt_suma: 0, dop_rashodi: 0, comment: null, fiscal_nr: null },
      duplicate_candidates: null, foaie_history: [],
    };
    const r = agregaPeRute('a', 'b', [row({ crm_route_id: 1, ziua: '2026-09-01', incasare_numerar: 100 })],
      types, [o], []);
    expect(r.faraRuta.total).toBe(7436.59);
    expect(r.totalGeneral).toBe(7536.59);
  });

  it('dublura_terminal și cursa_cu_terminal stau în «De verificat», în afara Total general', () => {
    const m = (id: string, reason: OrphanManual['reason'], total: number): OrphanManual => ({
      id, ziua: '2026-10-08', data_foaie: '2026-10-08', foaie_nr: id, driver_name: null,
      route_name: null, total_lei: total, incasare_numerar: total, reason,
    });
    const r = agregaPeRute('a', 'b', [row({ crm_route_id: 1, ziua: '2026-10-08', incasare_numerar: 1714.26 })],
      types, [], [
        m('1126627', 'dublura_terminal', 3400),
        m('1126555', 'cursa_cu_terminal', 5961.9),
        m('777', 'fara_ruta', 250),
        m('', 'fara_identificare', 50),
      ]);
    expect(r.deVerificat.total).toBe(9361.9);
    expect(r.deVerificat.randuri.map(x => x.motiv)).toEqual(['dublura_terminal', 'cursa_cu_terminal']);
    expect(r.faraRuta.total).toBe(300);
    expect(r.totalGeneral).toBe(2014.26);
    expect(r.totalGeneralCuDeVerificat).toBe(11376.16);
  });

  it('cursa_gresita = bani reali: în «Bani fără rută» (deci în Total general), cu cursa corectă', () => {
    const r = agregaPeRute('a', 'b', [row({ crm_route_id: 1, ziua: '2026-10-05', incasare_numerar: 10942.72 })],
      types, [], [{
        id: 'm', ziua: '2026-10-05', data_foaie: '2026-10-05', foaie_nr: '1126555', driver_name: 'Grozinschii',
        route_name: 'R23', total_lei: 5961.9, incasare_numerar: 5961.9, reason: 'cursa_gresita',
        assignment_id: 'as23', foaie_cursa: { sofer: 'Oleinic Vasile', ruta: 'Chișinău - Șirăuți', ziua: '2026-10-05' },
      }]);
    expect(r.deVerificat.total).toBe(0);
    expect(r.faraRuta.randuri[0].categorie).toBe('manual_cursa_gresita');
    expect(r.faraRuta.randuri[0].cursa_corecta).toBe('Chișinău - Șirăuți · Oleinic Vasile · 2026-10-05');
    expect(r.totalGeneral).toBe(16904.62);
  });

  it('două foi pe aceeași cursă (terminal A + manual B neadunat): B ajunge în «De verificat»', () => {
    const r = agregaPeRute('a', 'b', [
      row({ crm_route_id: 1, ziua: '2026-10-01', foaie_nr: 'A', incasare_numerar: 1000, plati: 1 }),
    ], types, [], [{
      id: 'm1', ziua: '2026-10-02', data_foaie: '2026-10-01', foaie_nr: 'B', driver_name: null,
      route_name: 'R1', total_lei: 600, incasare_numerar: 600, reason: 'cursa_cu_terminal', assignment_id: 'as1',
    }]);
    expect(r.totalRute.total).toBe(1000);
    expect(r.deVerificat.total).toBe(600);
    expect(r.totalGeneral).toBe(1000);
  });

  it('fără resturi de float pe sute de rânduri', () => {
    const rows = Array.from({ length: 300 }, (_, i) =>
      row({ crm_route_id: 1, ziua: `2026-09-${String((i % 30) + 1).padStart(2, '0')}`, incasare_diagrama: 0.1 }));
    expect(agregaPeRute('a', 'b', rows, types, [], []).rute[0].total).toBe(30);
  });
});

describe('capeteCuOre', () => {
  it('ora din Chișinău lângă Chișinău, ora din nord lângă orașul din nord', () => {
    expect(capeteCuOre('Chișinău - Criva', '18:30 - 22:35', '11:00 - 15:35')).toEqual([
      { loc: 'Chișinău', ora: '18:30' }, { loc: 'Criva', ora: '11:00' }]);
  });
  it('nume cu paranteze și fără «Chișinău» (Otaci)', () => {
    expect(capeteCuOre('Chișinău - Criva (Larga)', '12:30 - 16:55', '06:00 - 11:35')[1])
      .toEqual({ loc: 'Criva (Larga)', ora: '06:00' });
    expect(capeteCuOre('Otaci', '18:55 - 00:01', '12:35 - 17:40')).toEqual([
      { loc: 'Chișinău', ora: '18:55' }, { loc: 'Otaci', ora: '12:35' }]);
  });
  it('suburban fără ore: doar numele', () => {
    expect(capeteCuOre('Briceni - Lipcani', null, null)).toEqual([{ loc: 'Briceni - Lipcani', ora: null }]);
  });
});

describe('perioada', () => {
  it('implicit: de la 1 ale lunii până ieri', () => {
    expect(perioadaImplicita('2026-10-10')).toEqual({ from: '2026-10-01', to: '2026-10-09' });
  });
  it('pe 1 ale lunii: luna trecută întreagă', () => {
    expect(perioadaImplicita('2026-11-01')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
  it('pe 1 ianuarie: decembrie anului trecut', () => {
    expect(perioadaImplicita('2027-01-01')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
  it('luna trecută, inclusiv februarie bisect', () => {
    expect(lunaTrecuta('2028-03-15')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(lunaTrecuta('2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
  it('validare: 92 de zile trec, 93 nu', () => {
    expect(zileInclusiv('2026-07-01', '2026-09-30')).toBe(92);
    expect(valideazaPerioada('2026-07-01', '2026-09-30')).toBeNull();
    expect(valideazaPerioada('2026-06-30', '2026-09-30')).toMatch(/93 zile/);
  });
  it('validare: ordine și format', () => {
    expect(valideazaPerioada('2026-10-02', '2026-10-01')).not.toBeNull();
    expect(valideazaPerioada('2026-02-30', '2026-03-01')).toBe('Dată invalidă');
    expect(valideazaPerioada('ieri', '2026-03-01')).toBe('Dată invalidă');
    expect(valideazaPerioada('2026-10-01', '2026-10-01')).toBeNull();
  });
});
