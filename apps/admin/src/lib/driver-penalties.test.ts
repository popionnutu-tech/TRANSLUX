import { describe, expect, it } from 'vitest';
import {
  addMonths,
  dayBaseLei,
  dayVerdicts,
  monthMultiplier,
  penaltyCaption,
  previousWeekStart,
  weekStartOf,
  weeklyReport,
  type AppearanceCheckRow,
  type DayVerdict,
} from './driver-penalties';

const chk = (driver_id: string, check_date: string, uniform_ok: boolean | null, groomed_ok: boolean | null, created_at = `${check_date}T05:00:00Z`): AppearanceCheckRow =>
  ({ driver_id, check_date, uniform_ok, groomed_ok, created_at });

describe('dayVerdicts — o zi, ultima poză', () => {
  it('ia ultima poză acceptată a zilei, nu prima', () => {
    const m = dayVerdicts([
      chk('a', '2026-09-13', false, false, '2026-09-13T05:00:00Z'),
      chk('a', '2026-09-13', true, true, '2026-09-13T05:20:00Z'),
    ]);
    expect(m.get('a')).toEqual([{ date: '2026-09-13', uniformOk: true, groomedOk: true }]);
  });

  it('ordinea în listă nu contează, contează created_at', () => {
    const m = dayVerdicts([
      chk('a', '2026-09-13', true, true, '2026-09-13T05:20:00Z'),
      chk('a', '2026-09-13', false, true, '2026-09-13T05:00:00Z'),
    ]);
    expect(m.get('a')![0].uniformOk).toBe(true);
  });

  it('sare peste pozele fără verdict și fără șofer', () => {
    const m = dayVerdicts([
      chk('a', '2026-09-13', null, null),
      chk(null as unknown as string, '2026-09-13', false, false),
    ]);
    expect(m.size).toBe(0);
  });
});

describe('dayBaseLei', () => {
  it('30 / 20 / 50 / 0', () => {
    expect(dayBaseLei({ date: 'x', uniformOk: false, groomedOk: true })).toBe(30);
    expect(dayBaseLei({ date: 'x', uniformOk: true, groomedOk: false })).toBe(20);
    expect(dayBaseLei({ date: 'x', uniformOk: false, groomedOk: false })).toBe(50);
    expect(dayBaseLei({ date: 'x', uniformOk: true, groomedOk: true })).toBe(0);
  });
});

describe('calendar', () => {
  it('luni a săptămânii, inclusiv pentru duminică', () => {
    expect(weekStartOf('2026-09-14')).toBe('2026-09-14'); // luni
    expect(weekStartOf('2026-09-13')).toBe('2026-09-07'); // duminică
    expect(weekStartOf('2026-09-10')).toBe('2026-09-07');
  });
  it('săptămâna precedentă din orice zi a săptămânii curente', () => {
    expect(previousWeekStart('2026-09-14')).toBe('2026-09-07');
    expect(previousWeekStart('2026-09-20')).toBe('2026-09-07');
  });
  it('addMonths trece peste an', () => {
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
  });
});

function violationDays(month: string, n: number): DayVerdict[] {
  return Array.from({ length: n }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, '0')}`, uniformOk: false, groomedOk: true }));
}

describe('monthMultiplier', () => {
  it('1 când luna precedentă are sub 7 zile de abateri', () => {
    expect(monthMultiplier('2026-11-01', violationDays('2026-10', 6))).toBe(1);
  });
  it('+50% după o lună cu 7 zile, +100% după două consecutive', () => {
    expect(monthMultiplier('2026-11-01', violationDays('2026-10', 7))).toBe(1.5);
    expect(monthMultiplier('2026-12-01', [...violationDays('2026-10', 7), ...violationDays('2026-11', 9)])).toBe(2);
  });
  it('seria se rupe la o lună sub 7', () => {
    expect(monthMultiplier('2026-12-01', [...violationDays('2026-10', 9), ...violationDays('2026-11', 3)])).toBe(1);
  });
  it('septembrie (înainte de 01.10) nu scumpește octombrie', () => {
    expect(monthMultiplier('2026-10-01', violationDays('2026-09', 20))).toBe(1);
  });
  it('zilele fără abatere nu se numără', () => {
    const ok: DayVerdict[] = Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, uniformOk: true, groomedOk: true }));
    expect(monthMultiplier('2026-11-01', ok)).toBe(1);
  });
});

describe('weeklyReport', () => {
  const drivers = [
    { id: 'a', full_name: 'Golisco Andrei' },
    { id: 'b', full_name: 'Baesu Anatolii' },
    { id: 'c', full_name: 'Cibuc Anatolie' },
  ];

  it('adună zilele și leii pe săptămână, îi pune pe toți șoferii, cei fără poză la coadă', () => {
    const r = weeklyReport(drivers, [
      chk('a', '2026-09-09', false, false),
      chk('a', '2026-09-10', false, true),
      chk('a', '2026-09-12', true, true),
      chk('b', '2026-09-09', true, true),
      chk('b', '2026-09-13', true, false),
    ], '2026-09-07');
    expect(r.weekEnd).toBe('2026-09-13');
    expect(r.applied).toBe(false);
    expect(r.rows.map(x => x.name)).toEqual(['Golisco Andrei', 'Baesu Anatolii', 'Cibuc Anatolie']);
    const a = r.rows[0];
    expect(a).toMatchObject({ photoDays: 3, noUniformDays: 2, ungroomedDays: 1, weekLei: 80, monthLei: 80, multiplier: 1 });
    expect(r.rows[1]).toMatchObject({ photoDays: 2, noUniformDays: 0, ungroomedDays: 1, weekLei: 20 });
    expect(r.rows[2]).toMatchObject({ photoDays: 0, weekLei: 0, monthLei: 0 });
    expect(r.totals).toEqual({ weekLei: 100, driversWithViolations: 2, driversWithPhotos: 2 });
  });

  it('coloana lunii adună și zilele din săptămânile anterioare ale lunii, nu și luna trecută', () => {
    const r = weeklyReport(drivers.slice(0, 1), [
      chk('a', '2026-09-30', false, false), // septembrie — nu intră în luna octombrie
      chk('a', '2026-10-02', false, true),  // săpt. 28.09–04.10
      chk('a', '2026-10-06', false, true),  // săpt. 05.10–11.10
    ], '2026-10-05');
    expect(r.monthStart).toBe('2026-10-01');
    expect(r.applied).toBe(true);
    expect(r.rows[0]).toMatchObject({ weekLei: 30, monthLei: 60 });
  });

  it('multiplicatorul lunii se aplică pe zilele ei: 7 zile în octombrie → noiembrie ×1,5', () => {
    const oct = Array.from({ length: 7 }, (_, i) => chk('a', `2026-10-${String(i + 5).padStart(2, '0')}`, false, true));
    const r = weeklyReport(drivers.slice(0, 1), [...oct, chk('a', '2026-11-03', false, false)], '2026-11-02');
    expect(r.rows[0]).toMatchObject({ multiplier: 1.5, weekLei: 75, monthLei: 75 });
  });

  it('o săptămână care trece dintr-o lună în alta: fiecare zi cu multiplicatorul lunii ei', () => {
    const oct = Array.from({ length: 7 }, (_, i) => chk('a', `2026-10-${String(i + 5).padStart(2, '0')}`, false, true));
    const r = weeklyReport(drivers.slice(0, 1), [...oct, chk('a', '2026-10-30', false, true), chk('a', '2026-11-01', false, true)], '2026-10-26');
    // 30.10 → 30 × 1 (octombrie, prima lună) ; 01.11 → 30 × 1,5
    expect(r.rows[0].weekLei).toBe(75);
    expect(r.rows[0].monthLei).toBe(45); // doar 01.11
  });
});

describe('penaltyCaption', () => {
  it('înainte de 01.10 spune că nu se aplică, după — că se rețin', () => {
    const before = weeklyReport([{ id: 'a', full_name: 'X' }], [chk('a', '2026-09-09', false, true)], '2026-09-07');
    expect(penaltyCaption(before)).toContain('07.09–13.09.2026');
    expect(penaltyCaption(before)).toContain('не применяются');
    expect(penaltyCaption(before)).toContain('01.10.2026');
    const after = weeklyReport([{ id: 'a', full_name: 'X' }], [chk('a', '2026-10-06', false, true)], '2026-10-05');
    expect(penaltyCaption(after)).toContain('учитываются');
    expect(penaltyCaption(after)).not.toContain('не применяются');
  });
});
