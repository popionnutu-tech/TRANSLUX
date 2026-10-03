import { describe, it, expect } from 'vitest';
import {
  buildCalendar, calendarColumns, defaultClosed, monthKey, weekKey, monthSpan, weekSpan, weekdayColumns,
  indexCells, sumCells, mean, totalRoutes, step, isoDow, isoWeek, fmtOra,
} from './balti';

describe('Locuri în Bălți: calendarul grupat', () => {
  const cal = buildCalendar('2026-08-27', '2026-09-08');

  it('luni → săptămâni rupte la schimbarea lunii → zile', () => {
    expect(cal.map(m => m.key)).toEqual(['2026-08', '2026-09']);
    // 27.08 e joi: săptămâna de luni 24.08 are în august doar jo–du
    expect(cal[0].weeks.map(w => [w.key, w.dates.length])).toEqual([['2026-08-24', 4], ['2026-08-31', 1]]);
    // aceeași săptămână (31.08) continuă în septembrie cu ma–du, apoi 07–08.09
    expect(cal[1].weeks.map(w => [w.key, w.dates.length])).toEqual([['2026-08-31', 6], ['2026-09-07', 2]]);
    expect(cal[1].weeks[0].iso).toBe(36);
    expect(cal[1].weeks[0].label).toBe('01.09–06.09');
    expect(cal[0].label).toBe('august 2026');
  });

  it('implicit săptămânile sunt închise și lunile deschise: o coloană pe săptămână', () => {
    const closed = defaultClosed(cal);
    const cols = calendarColumns(cal, closed);
    expect(cols.map(c => c.kind)).toEqual(['week', 'week', 'week', 'week']);
    expect(cols[0].dates).toEqual(['2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30']);
    expect(monthSpan(cal[0], closed)).toBe(2);
  });

  it('plusul deschide săptămâna pe zile, minusul lunii o strânge într-o coloană', () => {
    const closed = defaultClosed(cal);
    closed.delete(weekKey(cal[1], cal[1].weeks[0]));
    let cols = calendarColumns(cal, closed);
    expect(cols.map(c => c.kind)).toEqual(['week', 'week', 'day', 'day', 'day', 'day', 'day', 'day', 'week']);
    expect(cols[2].label).toBe('Ma 1');
    expect(weekSpan(cal[1], cal[1].weeks[0], closed)).toBe(6);
    expect(monthSpan(cal[1], closed)).toBe(7);

    closed.add(monthKey(cal[1]));
    cols = calendarColumns(cal, closed);
    expect(cols.map(c => c.kind)).toEqual(['week', 'week', 'month']);
    expect(cols[2].dates.length).toBe(8);
    expect(monthSpan(cal[1], closed)).toBe(1);
  });

  it('zilele săptămânii', () => {
    const cols = weekdayColumns('2026-09-01', '2026-09-14');
    expect(cols.map(c => c.dates.length)).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(cols[0].dates).toEqual(['2026-09-07', '2026-09-14']);
    expect(isoDow('2026-09-06')).toBe(7);
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2026-12-31')).toBe(53);
  });
});

describe('Locuri în Bălți: mediile și culoarea', () => {
  const idx = indexCells([
    { r: 'A', d: '2026-09-01', n: 2, libere: 30, urca: 8 },
    { r: 'A', d: '2026-09-02', n: 1, libere: 3, urca: 5 },
    { r: 'B', d: '2026-09-01', n: 1, libere: 18, urca: 0 },
  ]);

  it('media e ponderată pe curse, nu pe zile', () => {
    const m = mean(sumCells(idx, ['A'], ['2026-09-01', '2026-09-02']))!;
    expect(m.n).toBe(3);
    expect(m.libere).toBeCloseTo(11, 5);
    expect(m.urca).toBeCloseTo(13 / 3, 5);
    expect(m.vinde).toBeCloseTo(11 - 13 / 3, 5);
    expect(m.plin).toBe(false);
  });

  it('urcă mai mulți decât locurile libere → plin, nimic de vândut', () => {
    const m = mean(sumCells(idx, ['A'], ['2026-09-02']))!;
    expect(m.plin).toBe(true);
    expect(m.vinde).toBe(0);
  });

  it('fără curse → null; toate rutele se adună', () => {
    expect(mean(sumCells(idx, ['A'], ['2026-09-03']))).toBeNull();
    expect(sumCells(idx, ['A', 'B'], ['2026-09-01'])).toEqual({ n: 3, libere: 48, urca: 8, verif: 0 });
  });

  it('treapta de culoare pe 0–20', () => {
    expect(step(0)).toBe(0);
    expect(step(2.9)).toBe(0);
    expect(step(3.3)).toBe(0);
    expect(step(3.4)).toBe(1);
    expect(step(8.3)).toBe(2);
    expect(step(17.9)).toBe(5);
    expect(step(20)).toBe(5);
  });

  it('ora cu două cifre', () => {
    expect(fmtOra('2:35')).toBe('02:35');
    expect(fmtOra('12:35')).toBe('12:35');
  });
});

describe('Locuri în Bălți: totalul pe toate graficele, media pe zi (ION-214)', () => {
  const idx = indexCells([
    { r: 'A', d: '2026-09-05', n: 1, libere: 10, urca: 4, la_plecare: 14 },
    { r: 'B', d: '2026-09-05', n: 1, libere: 5, urca: 9, la_plecare: 22 },
    { r: 'A', d: '2026-09-12', n: 1, libere: 14, urca: 6, la_plecare: 12 },
  ]);

  it('media totalurilor zilnice; graficul lipsă într-o zi nu umflă totalul; cursa plină nu scade din «vinde»', () => {
    const t = totalRoutes(idx, ['A', 'B'], ['2026-09-05', '2026-09-12', '2026-09-19'])!;
    // 05.09: 15 libere, 13 urcă, vinde 6 + 0, num. 6 + 0 (22 numărați = plin); 12.09: 14 libere, 6 urcă, vinde 8, num. 8
    expect(t).toEqual({ n: 2, libere: 14.5, urca: 9.5, vinde: 7, plin: false, verif: 7 });
  });

  it('fără curse în coloană → nimic', () => {
    expect(totalRoutes(idx, ['A', 'B'], ['2026-09-19'])).toBeNull();
  });
});
