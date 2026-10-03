import { describe, it, expect } from 'vitest';
import {
  buildCalendar, calendarColumns, defaultClosed, monthKey, weekKey, monthSpan, weekSpan, weekdayColumns,
  indexCells, programSet, sumCells, mean, totalRoutes, step, isoDow, isoWeek, fmtOra,
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

// O zi pe rută, ca din get_tiki_balti (migr. 499): vinde = max(20 − numărați, 0); libere/urca null = bilete neatribuite.
const zi = (r: string, d: string, n: number, urca: number | null) => ({
  r, d, la_plecare: n, vinde: Math.max(20 - n, 0), urca, libere: urca == null ? null : 20 - Math.max(n - urca, 0),
});

describe('Locuri în Bălți: mediile și culoarea (ION-220)', () => {
  const idx = indexCells([
    zi('A', '2026-09-01', 10, 4),   // mai avem 10, lib. 14
    zi('A', '2026-09-02', 24, 8),   // supraaglomerat: mai avem 0 (nu −4), lib. 4
    zi('A', '2026-09-03', 12, 15),  // bilete > numărați: mai avem 8 (din numărare), «!»
    zi('B', '2026-09-01', 16, null),// bilete neatribuite: lib./↑ necunoscute
  ]);

  it('cifra mare se plafonează pe fiecare plecare, apoi media (o zi plină nu anulează alta)', () => {
    const m = mean(sumCells(idx, ['A'], ['2026-09-01', '2026-09-02']))!;
    expect(m.vinde).toBe(5);
    expect(m.libere).toBe(9);
    expect(m.urca).toBe(6);
    expect(m.plin).toBe(false);
    expect(mean(sumCells(idx, ['A'], ['2026-09-02']))!.plin).toBe(true);
  });

  it('cifra mare vine din numărare chiar când biletele din Bălți sunt mai multe decât numărații', () => {
    const m = mean(sumCells(idx, ['A'], ['2026-09-03']))!;
    expect(m.vinde).toBe(8);
    expect(m.nepotr).toBe(1);
  });

  it('bilete neatribuite → lib. și ↑ necunoscute, nu 0', () => {
    const m = mean(sumCells(idx, ['B'], ['2026-09-01']))!;
    expect(m.vinde).toBe(4);
    expect(m.libere).toBeNull();
    expect(m.urca).toBeNull();
    const ab = mean(sumCells(idx, ['A', 'B'], ['2026-09-01']))!;
    expect(ab.vinde).toBe(7);
    expect(ab.libere).toBe(14);
  });

  it('fără curse → null', () => {
    expect(mean(sumCells(idx, ['A'], ['2026-09-04']))).toBeNull();
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

describe('Locuri în Bălți: totalul pe toate graficele, media pe zi (ION-214, acoperirea ION-220)', () => {
  const idx = indexCells([
    zi('A', '2026-09-05', 14, 4),   // mai avem 6, lib. 10
    zi('B', '2026-09-05', 22, 9),   // plin: 0, lib. 7
    zi('A', '2026-09-12', 12, 6),   // 8, lib. 14
  ]);
  const prog = programSet([
    { r: 'A', d: '2026-09-05' }, { r: 'B', d: '2026-09-05' },
    { r: 'A', d: '2026-09-12' }, { r: 'B', d: '2026-09-12' },   // B în grafic, dar nenumărat pe 12.09
  ]);

  it('graficul nenumărat într-o zi intră cu media lui din coloană; media pe zile', () => {
    const t = totalRoutes(idx, prog, ['A', 'B'], ['2026-09-05', '2026-09-12', '2026-09-19'])!;
    // 05.09: 6 + 0 = 6, lib. 17; 12.09: 8 + 0 (media lui B) = 8, lib. 14 + 7 = 21
    expect(t.n).toBe(2);
    expect(t.vinde).toBe(7);
    expect(t.libere).toBe(19);
    expect(t.numarate).toBe(3);
    expect(t.programate).toBe(4);
  });

  it('o rută care nu e în grafic într-o zi nu se adaugă', () => {
    const t = totalRoutes(idx, programSet([]), ['A', 'B'], ['2026-09-12'])!;
    expect(t.vinde).toBe(8);
    expect(t.programate).toBe(1);
  });

  it('fără curse în coloană → nimic', () => {
    expect(totalRoutes(idx, prog, ['A', 'B'], ['2026-09-19'])).toBeNull();
  });
});
