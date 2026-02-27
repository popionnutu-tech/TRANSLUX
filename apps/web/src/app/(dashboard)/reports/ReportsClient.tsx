'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { POINT_LABELS } from '@translux/db';
import type { PointEnum } from '@translux/db';
import type { PivotRawRow } from './actions';

type Period = 'daily' | 'weekly' | 'monthly';

interface Props {
  pivotData: PivotRawRow[];
  dateFrom: string;
  dateTo: string;
  viewMode: 'daily' | 'weekly';
  point: PointEnum;
  period: Period;
}

function getPeriodDates(period: Period) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (period === 'daily') return { dateFrom: today, dateTo: today };
  if (period === 'weekly') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setDate(diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { dateFrom: monday.toISOString().slice(0, 10), dateTo: sunday.toISOString().slice(0, 10) };
  }
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { dateFrom: firstDay.toISOString().slice(0, 10), dateTo: lastDay.toISOString().slice(0, 10) };
}

const DAY_NAMES = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

function formatDateShort(d: string) {
  const [, m, day] = d.split('-');
  return `${day}.${m}`;
}

function getMondayStr(dateStr: string): string {
  const dt = new Date(dateStr + 'T12:00:00');
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(dt);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

interface PivotRow {
  point: PointEnum;
  departure_time: string;
  key: string;
}

interface DailyPivot {
  rows: PivotRow[];
  columns: string[];
  cellMap: Map<string, { passengers: number | null; status: string }>;
}

interface WeeklyPivot {
  rows: PivotRow[];
  columns: string[];
  weekCells: Map<string, number | null>;
}

export default function ReportsClient({ pivotData, dateFrom, dateTo, viewMode, point, period }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.push(`/reports?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Build pivot data
  const daily: DailyPivot = useMemo(() => {
    const rowKeySet = new Set<string>();
    const dateSet = new Set<string>();
    const cellMap = new Map<string, { passengers: number | null; status: string }>();

    for (const r of pivotData) {
      const rowKey = `${r.point}|${r.departure_time}`;
      rowKeySet.add(rowKey);
      dateSet.add(r.report_date);
      cellMap.set(`${rowKey}|${r.report_date}`, {
        passengers: r.passengers_count,
        status: r.status,
      });
    }

    const rows = Array.from(rowKeySet)
      .map((k) => {
        const [point, time] = k.split('|');
        return { point: point as PointEnum, departure_time: time, key: k };
      })
      .sort((a, b) => {
        if (a.point !== b.point) return a.point.localeCompare(b.point);
        return a.departure_time.localeCompare(b.departure_time);
      });

    const columns = Array.from(dateSet).sort();

    return { rows, columns, cellMap };
  }, [pivotData]);

  const weekly: WeeklyPivot = useMemo(() => {
    // Group dates into weeks (Mon-Sun)
    const weekMap = new Map<string, string[]>();

    for (const d of daily.columns) {
      const mondayStr = getMondayStr(d);
      if (!weekMap.has(mondayStr)) weekMap.set(mondayStr, []);
      weekMap.get(mondayStr)!.push(d);
    }

    const sortedWeeks = Array.from(weekMap.entries()).sort(([a], [b]) => a.localeCompare(b));

    const columns: string[] = [];
    const weekDateGroups: string[][] = [];

    for (const [mondayStr, weekDates] of sortedWeeks) {
      const sunday = new Date(mondayStr + 'T12:00:00');
      sunday.setDate(sunday.getDate() + 6);
      const label = `${formatDateShort(mondayStr)}-${formatDateShort(sunday.toISOString().slice(0, 10))}`;
      columns.push(label);
      weekDateGroups.push(weekDates);
    }

    // Aggregate: sum passengers per row per week
    const weekCells = new Map<string, number | null>();

    for (const row of daily.rows) {
      for (let wi = 0; wi < weekDateGroups.length; wi++) {
        let sum: number | null = null;
        for (const d of weekDateGroups[wi]) {
          const cell = daily.cellMap.get(`${row.key}|${d}`);
          if (cell && cell.status === 'OK' && cell.passengers != null) {
            sum = (sum || 0) + cell.passengers;
          }
        }
        weekCells.set(`${row.key}|${wi}`, sum);
      }
    }

    return { rows: daily.rows, columns, weekCells };
  }, [daily]);

  const pivot = viewMode === 'weekly' ? weekly : daily;

  // Compute summary
  const summary = useMemo(() => {
    let total = 0;
    let trips = 0;
    for (const r of pivotData) {
      if (r.status === 'OK' && r.passengers_count != null) {
        total += r.passengers_count;
        trips++;
      }
    }
    return {
      totalPassengers: total,
      totalTrips: trips,
      avgPerTrip: trips > 0 ? Math.round((total / trips) * 10) / 10 : 0,
    };
  }, [pivotData]);

  // Determine which rows belong to which point for rowSpan grouping
  const pointGroups = useMemo(() => {
    const groups: Array<{ point: PointEnum; startIdx: number; count: number }> = [];
    for (let i = 0; i < pivot.rows.length; i++) {
      const row = pivot.rows[i];
      if (i === 0 || pivot.rows[i - 1].point !== row.point) {
        groups.push({ point: row.point, startIdx: i, count: 1 });
      } else {
        groups[groups.length - 1].count++;
      }
    }
    return groups;
  }, [pivot.rows]);

  // Compute column totals for the total row
  const columnTotals = useMemo(() => {
    return pivot.columns.map((col, ci) => {
      let sum = 0;
      let hasData = false;
      for (const row of pivot.rows) {
        if (viewMode === 'weekly') {
          const v = (pivot as WeeklyPivot).weekCells.get(`${row.key}|${ci}`);
          if (v != null) {
            sum += v;
            hasData = true;
          }
        } else {
          const cell = (pivot as DailyPivot).cellMap.get(`${row.key}|${col}`);
          if (cell && cell.status === 'OK' && cell.passengers != null) {
            sum += cell.passengers;
            hasData = true;
          }
        }
      }
      return hasData ? sum : null;
    });
  }, [pivot, viewMode]);

  // CSV export for pivot data
  function handleExportCSV() {
    const cols = pivot.columns;
    const header = ['Punct', 'Ora', ...cols.map(c => viewMode === 'weekly' ? c : formatDateShort(c))].join(',');
    const lines = pivot.rows.map((row) => {
      const values = cols.map((col, ci) => {
        if (viewMode === 'weekly') {
          const v = (pivot as WeeklyPivot).weekCells.get(`${row.key}|${ci}`);
          return v != null ? String(v) : '';
        } else {
          const cell = (pivot as DailyPivot).cellMap.get(`${row.key}|${col}`);
          if (!cell) return '';
          if (cell.status === 'ABSENT') return 'A';
          if (cell.status === 'FULL') return 'F';
          return cell.passengers != null ? String(cell.passengers) : '';
        }
      });
      return [POINT_LABELS[row.point], row.departure_time, ...values].join(',');
    });

    const totalLine = ['Total', '', ...columnTotals.map(t => t != null ? String(t) : '')].join(',');
    const csv = [header, ...lines, totalLine].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translux-raport-${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function isGroupStart(idx: number): boolean {
    return pointGroups.some((g) => g.startIdx === idx);
  }

  function getGroupSize(idx: number): number {
    const g = pointGroups.find((g) => g.startIdx === idx);
    return g ? g.count : 1;
  }

  return (
    <div className="page-wide">
      <div className="page-header">
        <h1>Raport pasageri</h1>
        <button onClick={handleExportCSV} className="btn btn-outline">
          Exportă CSV
        </button>
      </div>

      {/* Filters */}
      <div className="filter-bar card mb-4">
        <div className="mode-toggle" style={{ marginRight: 12 }}>
          <button className="mode-btn mode-btn-active">Transport</button>
          <button
            className="mode-btn"
            onClick={() => updateParams({ reportType: 'smm' })}
          >
            SMM
          </button>
        </div>
        <div className="form-group">
          <label>Punct de pornire</label>
          <select
            value={point}
            onChange={(e) => updateParams({ point: e.target.value })}
          >
            {(Object.keys(POINT_LABELS) as PointEnum[]).map((p) => (
              <option key={p} value={p}>
                {POINT_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Perioadă</label>
          <div className="mode-toggle">
            {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
              <button
                key={p}
                className={`mode-btn${period === p ? ' mode-btn-active' : ''}`}
                onClick={() => {
                  const dates = getPeriodDates(p);
                  updateParams({ period: p, dateFrom: dates.dateFrom, dateTo: dates.dateTo });
                }}
              >
                {p === 'daily' ? 'Zilnic' : p === 'weekly' ? 'Săptămânal' : 'Lunar'}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label>De la</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => updateParams({ dateFrom: e.target.value, period: '' })}
          />
        </div>
        <div className="form-group">
          <label>Până la</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => updateParams({ dateTo: e.target.value, period: '' })}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid-3 mb-4">
        <div className="card summary-card">
          <div className="value">{summary.totalPassengers}</div>
          <div className="label">Total pasageri</div>
        </div>
        <div className="card summary-card">
          <div className="value">{summary.totalTrips}</div>
          <div className="label">Total curse (OK)</div>
        </div>
        <div className="card summary-card">
          <div className="value">{summary.avgPerTrip}</div>
          <div className="label">Media / cursă</div>
        </div>
      </div>

      {/* Pivot table */}
      <div className="card pivot-wrap">
        <table className="pivot-table">
          <thead>
            <tr>
              <th className="pivot-sticky">Punct</th>
              <th className="pivot-sticky pivot-sticky-time">Ora</th>
              {pivot.columns.map((col, i) => (
                <th key={i} className="pivot-date-col">
                  {viewMode === 'weekly' ? (
                    col
                  ) : (
                    <>
                      <span className="pivot-day-name">
                        {DAY_NAMES[new Date(col + 'T12:00:00').getDay()]}
                      </span>
                      <br />
                      {formatDateShort(col)}
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pivot.rows.map((row, ri) => {
              const showPoint = isGroupStart(ri);
              const groupSize = showPoint ? getGroupSize(ri) : 0;

              return (
                <tr key={row.key} className={showPoint && ri > 0 ? 'pivot-group-border' : ''}>
                  {showPoint && (
                    <td rowSpan={groupSize} className="pivot-point pivot-sticky">
                      {POINT_LABELS[row.point]}
                    </td>
                  )}
                  <td className="pivot-time pivot-sticky pivot-sticky-time">{row.departure_time}</td>
                  {pivot.columns.map((col, ci) => {
                    let display: string;
                    let className = 'pivot-cell';

                    if (viewMode === 'weekly') {
                      const v = (pivot as WeeklyPivot).weekCells.get(`${row.key}|${ci}`);
                      if (v != null) {
                        display = String(v);
                      } else {
                        display = '—';
                        className += ' pivot-empty';
                      }
                    } else {
                      const cell = (pivot as DailyPivot).cellMap.get(`${row.key}|${col}`);
                      if (!cell) {
                        display = '—';
                        className += ' pivot-empty';
                      } else if (cell.status === 'ABSENT') {
                        display = 'A';
                        className += ' pivot-absent';
                      } else if (cell.status === 'FULL') {
                        display = 'F';
                        className += ' pivot-full';
                      } else {
                        display = cell.passengers != null ? String(cell.passengers) : '—';
                      }
                    }

                    return (
                      <td key={ci} className={className}>
                        {display}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {pivot.rows.length === 0 && (
              <tr>
                <td colSpan={2 + pivot.columns.length} className="text-center text-muted" style={{ padding: 24 }}>
                  Nu există date pentru perioada selectată.
                </td>
              </tr>
            )}
          </tbody>
          {pivot.rows.length > 0 && (
            <tfoot>
              <tr className="pivot-total-row">
                <td colSpan={2} className="pivot-sticky pivot-total-label">Total</td>
                {columnTotals.map((total, ci) => (
                  <td key={ci} className="pivot-cell pivot-total-cell">
                    {total != null ? total : '—'}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
