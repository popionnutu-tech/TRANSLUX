// Teste pentru motorul DT (перерасход) — prioritatea #1
import { describe, it, expect } from 'vitest';
import {
  classifyLevel,
  calcPererashodWindow,
  buildFuelWindows,
  isCronicPattern,
  isCashPatternSuspect,
  type FuelEvent,
} from './lde-dt-calc.js';

describe('classifyLevel', () => {
  it('verde ≤ +0.3', () => {
    expect(classifyLevel(0)).toBe('verde');
    expect(classifyLevel(0.3)).toBe('verde');
  });
  it('galben +0.3..+2.0', () => {
    expect(classifyLevel(0.31)).toBe('galben');
    expect(classifyLevel(2.0)).toBe('galben');
  });
  it('roșu > +2.0', () => {
    expect(classifyLevel(2.01)).toBe('rosu');
    expect(classifyLevel(5)).toBe('rosu');
  });
  it('перерасход negativ (economie) = verde', () => {
    expect(classifyLevel(-1)).toBe('verde');
  });
});

describe('calcPererashodWindow', () => {
  it('consum exact pe normă → verde, перерасход 0', () => {
    // DAF normă 28.5; 1000 km → norma 285 L; alimentat 285 L
    const r = calcPererashodWindow(28.5, 1000, 285, [{ driver_id: 'd1', km: 1000 }]);
    expect(r.actual_l_per_100km).toBe(28.5);
    expect(r.pererashod_l_per_100km).toBe(0);
    expect(r.level).toBe('verde');
  });

  it('перерасход mare → roșu', () => {
    // 1000 km, normă 28.5 (285 L), dar alimentat 320 L → actual 32.0 → перерасход 3.5 → roșu
    const r = calcPererashodWindow(28.5, 1000, 320, [{ driver_id: 'd1', km: 1000 }]);
    expect(r.actual_l_per_100km).toBe(32);
    expect(r.pererashod_l_per_100km).toBe(3.5);
    expect(r.level).toBe('rosu');
  });

  it('repartizare proporțională pe 2 șoferi', () => {
    const r = calcPererashodWindow(12.5, 1000, 150, [
      { driver_id: 'd1', km: 600 },
      { driver_id: 'd2', km: 400 },
    ]);
    expect(r.drivers_responsibility).toEqual([
      { driver_id: 'd1', km: 600, proportion: 0.6 },
      { driver_id: 'd2', km: 400, proportion: 0.4 },
    ]);
  });

  it('km 0 → fără diviziune cu zero', () => {
    const r = calcPererashodWindow(12.5, 0, 0, []);
    expect(r.actual_l_per_100km).toBe(0);
    expect(r.level).toBe('verde');
  });
});

describe('buildFuelWindows', () => {
  function ev(at: string, litri: number, is_full: boolean, km: number | null, driver = 'd1'): FuelEvent {
    return { alimentat_at: at, litri, is_full, km_at_event: km, driver_id: driver };
  }

  it('o singură fereastră între 2 pline', () => {
    const windows = buildFuelWindows([
      ev('2026-06-01T08:00:00Z', 50, true, 1000),
      ev('2026-06-03T08:00:00Z', 40, false, 1300),
      ev('2026-06-05T08:00:00Z', 60, true, 1600),
    ]);
    expect(windows).toHaveLength(1);
    expect(windows[0].litri).toBe(100); // 40 + 60 (după primul plin, până la și inclusiv al doilea)
    expect(windows[0].km).toBe(600);    // 1600 - 1000
    expect(windows[0].driver_ids).toContain('d1');
  });

  it('fără odometer → km null + cutoff imprecis (formula uscată)', () => {
    const windows = buildFuelWindows([
      ev('2026-06-01T08:00:00Z', 50, true, null),
      ev('2026-06-05T08:00:00Z', 60, true, null),
    ]);
    expect(windows[0].km).toBeNull();
    expect(windows[0].has_precise_cutoff).toBe(false);
  });

  it('mai puțin de 2 pline → nicio fereastră', () => {
    const windows = buildFuelWindows([ev('2026-06-01T08:00:00Z', 50, true, 1000)]);
    expect(windows).toHaveLength(0);
  });
});

describe('isCronicPattern', () => {
  it('2 luni la rând cu перерасход similar → cronic', () => {
    expect(isCronicPattern([1.5, 1.6])).toBe(true);
  });
  it('o lună mare apoi normală → NU cronic', () => {
    expect(isCronicPattern([1.5, 0.1])).toBe(false);
  });
  it('перерасход cu variație mare → NU cronic', () => {
    expect(isCronicPattern([0.5, 3.0])).toBe(false); // diferență 2.5 > 0.6
  });
  it('o singură lună → NU cronic', () => {
    expect(isCronicPattern([1.5])).toBe(false);
  });
});

describe('isCashPatternSuspect', () => {
  it('>1 alimentare numerar/lună → suspect', () => {
    expect(isCashPatternSuspect(2)).toBe(true);
  });
  it('1 alimentare numerar → ok', () => {
    expect(isCashPatternSuspect(1)).toBe(false);
  });
});
