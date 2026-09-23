import { describe, expect, it } from 'vitest';
import { etaFrom, haversineKm, paceFromStops, remainingKm, type LatLon, type StopRow } from './bus-eta';

// O linie dreaptă nord-sud, un vârf la ~1,11 km (0,01° latitudine).
const shape: LatLon[] = Array.from({ length: 11 }, (_, i) => [47 + i * 0.01, 28]);
const km1 = haversineKm([47, 28], [47.01, 28]);

describe('remainingKm — km pe linia rutei până la oprirea omului', () => {
  it('autobuzul vine spre oprire: km de la el până la ea', () => {
    // Cursa merge de la vârful 0 spre 10; omul la vârful 7; autobuzul la 2.
    const r = remainingKm(shape, [47.02, 28.0005], shape[7], shape[10]);
    expect(r && !r.passed && r.km).toBeCloseTo(5 * km1, 1);
  });
  it('același lucru pe sensul invers al liniei', () => {
    const r = remainingKm(shape, [47.08, 28], shape[3], shape[0]);
    expect(r && !r.passed && r.km).toBeCloseTo(5 * km1, 1);
  });
  it('a trecut deja de oprire', () => {
    expect(remainingKm(shape, [47.09, 28], shape[7], shape[10])).toEqual({ passed: true });
  });
  it('autobuzul departe de linie (depou, ocol) = fără oră', () => {
    expect(remainingKm(shape, [47.05, 28.2], shape[7], shape[10])).toBeNull();
  });
});

describe('paceFromStops — minute pe km din istoricul GPS', () => {
  const row = (seq: number, arr: string, dep: string, km: number | null, dwell = 0): StopRow => ({
    vehicle_id: 'v', date: '2026-09-22', seq, arrival_at: `2026-09-22T${arr}:00Z`, departure_at: `2026-09-22T${dep}:00Z`, dwell_min: dwell, km_from_prev: km,
  });
  it('mers + opriri scurte de pe traseu, fără așteptarea lungă de la capăt', () => {
    const rows = [
      row(1, '05:00', '06:00', null, 60),     // pornire (așteptare lungă, nu intră)
      row(2, '07:00', '07:05', 60, 5),        // 60 km în 60 min, oprire 5 min
      row(3, '08:00', '10:00', 50, 120),      // 50 km în 55 min; 120 min = capăt, nu intră
      row(4, '11:00', '11:00', 40),           // 40 km în 60 min
    ];
    const p = paceFromStops(rows, 100)!;
    expect(p.km).toBe(150);
    expect(p.minPerKm).toBeCloseTo((60 + 5 + 55 + 60) / 150, 5);
  });
  it('viteză imposibilă sau segment scurt = zgomot, nu intră', () => {
    const rows = [row(1, '05:00', '06:00', null), row(2, '06:10', '06:10', 60), row(3, '06:20', '06:20', 1)];
    expect(paceFromStops(rows, 1)).toBeNull();
  });
});

describe('etaFrom', () => {
  it('ora de la punctul GPS + km × ritm, în ora Chișinăului', () => {
    const at = '2026-09-23T17:00:00Z'; // 20:00 la Chișinău
    const r = etaFrom(30, 1.2, at, Date.parse(at));
    expect(r).toEqual({ eta: '20:36', eta_min: 36 });
  });
});
