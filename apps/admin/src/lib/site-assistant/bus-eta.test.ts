import { describe, expect, it } from 'vitest';
import { etaFrom, haversineKm, paceFromStops, remainingKm, typicalLeg, typicalOffset, type LatLon, type StopRow } from './bus-eta';

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

describe('typicalOffset / typicalLeg — ora reală din treceri', () => {
  const pass = (date: string, stop: number, hhmm: string, off: number) =>
    ({ date, stop_order: stop, passed_at: `${date}T${hhmm}:00Z`, offset_min: off });
  const days = ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22'];

  it('ultimele 7 zile cântăresc: obiceiul nou bate media veche', () => {
    const old = ['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'].map((d) => pass(d, 80, '20:10', 10));
    const recent = days.map((d) => pass(d, 80, '19:50', -8));
    expect(typicalOffset([...old, ...recent], 80, '2026-09-23')).toBe(-8);
  });
  it('prea puține treceri = fără oră reală', () => {
    expect(typicalOffset([pass('2026-09-22', 80, '20:00', -5)], 80, '2026-09-23')).toBeNull();
  });
  it('durata reală a tronsonului A → B, mediana pe zile', () => {
    const rows = days.flatMap((d, i) => [pass(d, 10, '20:00', 0), pass(d, 20, `20:${String(30 + i).padStart(2, '0')}`, 0)]);
    expect(typicalLeg(rows, 10, 20)).toBe(33);
  });
});

describe('typicalOffset — abaterea uriașă nu se crede', () => {
  it('peste 45 min rămâne graficul', () => {
    const rows = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22']
      .map((date) => ({ date, stop_order: 5, passed_at: `${date}T10:00:00Z`, offset_min: -60 }));
    expect(typicalOffset(rows, 5, '2026-09-23')).toBeNull();
  });
});
