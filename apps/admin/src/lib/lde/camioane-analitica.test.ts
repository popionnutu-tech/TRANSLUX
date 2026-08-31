import { describe, it, expect } from 'vitest';
import {
  acoperireMetrici, topAbateri, punctualitate, utilizare, kmGoiVsIncarcati,
  type CursaCuMetrici,
} from './camioane-analitica';

const cursa = (p: Partial<CursaCuMetrici> = {}): CursaCuMetrici => ({
  tripId: 't1', vehicleId: 'v1', plate: 'HMK139', driverName: 'Vasile',
  cargo: 'diesel', de: 'Chișinău', la: 'Bălți', status: 'incheiata',
  loadPlannedAt: '2026-09-01T08:00:00Z', unloadPlannedAt: '2026-09-01T18:00:00Z',
  kmReal: 140, kmIdeal: 135, kmDeviation: 5, stops: 1,
  loadDelayMin: 10, unloadDelayMin: 20, ...p,
});

describe('acoperireMetrici', () => {
  it('numără separat cursele fără metrici și pe cele fără traseu ideal', () => {
    const r = acoperireMetrici([
      cursa(),
      cursa({ tripId: 't2', kmIdeal: null, kmDeviation: null }),
      cursa({ tripId: 't3', kmReal: null, kmIdeal: null, kmDeviation: null }),
    ]);
    expect(r).toEqual({ cuMetrici: 2, total: 3, faraIdeal: 1 });
  });
});

describe('topAbateri', () => {
  it('cursele fără km ideali NU intră — nu inventăm abaterea', () => {
    const r = topAbateri([
      cursa({ tripId: 'a', kmDeviation: 40 }),
      cursa({ tripId: 'b', kmDeviation: null }),
      cursa({ tripId: 'c', kmDeviation: 90 }),
    ]);
    expect(r.map((x) => x.tripId)).toEqual(['c', 'a']);
  });

  it('cursa anulată își păstrează metricile în BD, dar nu intră în top', () => {
    const r = topAbateri([cursa({ tripId: 'x', status: 'anulata', kmDeviation: 300 })]);
    expect(r).toEqual([]);
  });
});

describe('punctualitate', () => {
  it('mediile ignoră cursele nemăsurate, nu le socotesc zero', () => {
    const r = punctualitate([
      cursa({ driverName: 'Vasile', unloadDelayMin: 60 }),
      cursa({ tripId: 't2', driverName: 'Vasile', unloadDelayMin: null }),
      cursa({ tripId: 't3', driverName: 'Vasile', unloadDelayMin: 20 }),
    ], (c) => c.driverName ?? '');
    expect(r[0].curse).toBe(3);
    expect(r[0].intarziereMedieDescarcare).toBe(40); // (60+20)/2, nu (60+0+20)/3
    expect(r[0].intarziate).toBe(1);                 // doar cea de 60 depășește 30 min
  });

  it('grupele fără cheie sunt sărite', () => {
    expect(punctualitate([cursa({ driverName: null })], (c) => c.driverName ?? '')).toEqual([]);
  });

  it('cursa NEMĂSURATĂ nu se numără punctuală — se vede în «masurate»', () => {
    // Cu `?? 0` o cursă fără sosire detectată trecea drept la timp, deci un șofer
    // cronic întârziat ieșea curat (audit Critical).
    const r = punctualitate([
      cursa({ unloadDelayMin: null }),
      cursa({ tripId: 't2', unloadDelayMin: 90 }),
    ], (c) => c.driverName ?? '');
    expect(r[0]).toMatchObject({ curse: 2, masurate: 1, intarziate: 1 });
  });

  it('cursele anulate nu intră în punctualitate', () => {
    expect(punctualitate([cursa({ status: 'anulata' })], (c) => c.driverName ?? '')).toEqual([]);
  });
});

describe('utilizare', () => {
  const zile = ['2026-09-01', '2026-09-02', '2026-09-03'];
  const camioane = [{ vehicleId: 'v1', plate: 'HMK139' }];

  it('cursa multi-zi ocupă toate zilele ei', () => {
    const r = utilizare(camioane, [cursa({ unloadPlannedAt: '2026-09-02T18:00:00Z' })], [], zile);
    expect(r[0]).toMatchObject({ zileInCursa: 2, zileLibere: 1 });
  });

  it('ziua cu cursă ȘI reparație se numără la cursă — camionul a lucrat', () => {
    const r = utilizare(
      camioane,
      [cursa()],
      [{ vehicleId: 'v1', date: '2026-09-01', state: 'reparatie' }, { vehicleId: 'v1', date: '2026-09-02', state: 'reparatie' }],
      zile,
    );
    expect(r[0]).toMatchObject({ zileInCursa: 1, zileReparatie: 1, zileLibere: 1 });
  });

  it('cursa anulată nu ocupă zile', () => {
    const r = utilizare(camioane, [cursa({ status: 'anulata' })], [], zile);
    expect(r[0].zileInCursa).toBe(0);
    expect(r[0].zileLibere).toBe(3);
  });
});

describe('kmGoiVsIncarcati', () => {
  const zile = ['2026-09-01'];
  it('km goi = ce a mers camionul în afara curselor', () => {
    const r = kmGoiVsIncarcati(
      [cursa({ kmReal: 140 })],
      [{ vehicleId: 'v1', date: '2026-09-01', km: 200 }],
      zile,
    );
    expect(r).toEqual({ kmIncarcati: 140, kmTotali: 200, kmGoi: 60, procentGol: 30 });
  });

  it('cursa încheiată ÎN AFARA perioadei nu-și aduce km-ii întregi în total', () => {
    // Cursa începută înainte de fereastră aducea km_real integral, dar km-ii GPS
    // veneau doar pe zilele ferestrei → «încărcați» depășeau totalul (audit).
    const r = kmGoiVsIncarcati(
      [cursa({ kmReal: 900, unloadPlannedAt: '2026-09-05T18:00:00Z' })],
      [{ vehicleId: 'v1', date: '2026-09-01', km: 200 }],
      zile,
    );
    expect(r).toMatchObject({ kmIncarcati: 0, kmTotali: 200, kmGoi: 200, procentGol: 100 });
  });

  it('fără km zilnici procentul e null, nu zero', () => {
    const r = kmGoiVsIncarcati([cursa()], [], zile);
    expect(r.procentGol).toBeNull();
  });

  it('km încărcați peste totalul GPS nu dau km goi negativi', () => {
    const r = kmGoiVsIncarcati(
      [cursa({ kmReal: 300 })],
      [{ vehicleId: 'v1', date: '2026-09-01', km: 200 }],
      zile,
    );
    expect(r.kmGoi).toBe(0);
  });
});
