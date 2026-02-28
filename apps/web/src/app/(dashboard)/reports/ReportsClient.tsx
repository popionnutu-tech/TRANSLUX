'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
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

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPeriodDates(period: Period) {
  const now = new Date();
  const today = toDateStr(now);
  if (period === 'daily') return { dateFrom: today, dateTo: today };
  if (period === 'weekly') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setDate(diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { dateFrom: toDateStr(monday), dateTo: toDateStr(sunday) };
  }
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { dateFrom: toDateStr(firstDay), dateTo: toDateStr(lastDay) };
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
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(new Set());

  function toggleWeek(monday: string) {
    setCollapsedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(monday)) next.delete(monday);
      else next.add(monday);
      return next;
    });
  }

  function toggleAllWeeks() {
    if (!weekColumnGroups) return;
    const allCollapsed = weekColumnGroups.every((wg) => collapsedWeeks.has(wg.monday));
    if (allCollapsed) {
      setCollapsedWeeks(new Set());
    } else {
      setCollapsedWeeks(new Set(weekColumnGroups.map((wg) => wg.monday)));
    }
  }

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

  // Determine grouping mode from actual data
  const columnGroupMode = useMemo(() => {
    if (viewMode === 'weekly' || daily.columns.length <= 1) return 'none';
    const months = new Set(daily.columns.map((d) => d.slice(0, 7)));
    if (months.size >= 2) return 'monthly';
    const weeks = new Set(daily.columns.map((d) => getMondayStr(d)));
    if (weeks.size >= 2) return 'weekly';
    return 'none';
  }, [daily.columns, viewMode]);

  // Group daily columns for collapsible column groups (by week or by month)
  const weekColumnGroups = useMemo(() => {
    if (columnGroupMode === 'none') return null;
    const groupMap = new Map<string, string[]>();
    for (const d of daily.columns) {
      const key = columnGroupMode === 'weekly' ? getMondayStr(d) : d.slice(0, 7);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(d);
    }
    const MONTH_NAMES = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Array.from(groupMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, dates]) => {
        let label: string;
        if (columnGroupMode === 'weekly') {
          const sundayDt = new Date(key + 'T12:00:00');
          sundayDt.setDate(sundayDt.getDate() + 6);
          label = `${formatDateShort(key)}-${formatDateShort(toDateStr(sundayDt))}`;
        } else {
          const [y, m] = key.split('-');
          label = `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
        }
        return { monday: key, label, dates };
      });
  }, [daily.columns, columnGroupMode]);

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

  // Per-column stats: trips count, total passengers, average
  const columnStats = useMemo(() => {
    const computeStats = (dates: string[]) => {
      let trips = 0;
      let total = 0;
      for (const d of dates) {
        for (const row of pivot.rows) {
          const cell = daily.cellMap.get(`${row.key}|${d}`);
          if (cell && cell.status === 'OK' && cell.passengers != null) {
            trips++;
            total += cell.passengers;
          }
        }
      }
      return { trips, total, avg: trips > 0 ? Math.round((total / trips) * 100) / 100 : 0 };
    };
    return daily.columns.map((col) => computeStats([col]));
  }, [daily, pivot.rows]);

  const weekGroupStats = useMemo(() => {
    if (!weekColumnGroups) return null;
    return weekColumnGroups.map((wg) => {
      let trips = 0;
      let total = 0;
      for (const d of wg.dates) {
        for (const row of pivot.rows) {
          const cell = daily.cellMap.get(`${row.key}|${d}`);
          if (cell && cell.status === 'OK' && cell.passengers != null) {
            trips++;
            total += cell.passengers;
          }
        }
      }
      return { trips, total, avg: trips > 0 ? Math.round((total / trips) * 100) / 100 : 0 };
    });
  }, [weekColumnGroups, daily, pivot.rows]);

  // CSV export for pivot data
  function handleExportCSV() {
    const cols = pivot.columns;
    const header = ['Ora', ...cols.map(c => viewMode === 'weekly' ? c : formatDateShort(c))].join(',');
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
      return [row.departure_time, ...values].join(',');
    });

    const totalLine = ['Total', ...columnTotals.map(t => t != null ? String(t) : '')].join(',');
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
      <div className="card mb-4" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div className="mode-toggle">
            <button className="mode-btn mode-btn-active">Transport</button>
            <button
              className="mode-btn"
              onClick={() => updateParams({ reportType: 'smm' })}
            >
              SMM
            </button>
          </div>
          <div className="mode-toggle" style={{ marginLeft: 8 }}>
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
        <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Punct</label>
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
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>De la</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => updateParams({ dateFrom: e.target.value, period: '' })}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Până la</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => updateParams({ dateTo: e.target.value, period: '' })}
            />
          </div>
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
              <th className="pivot-sticky pivot-sticky-time">
                {weekColumnGroups && (
                  <span
                    className="pivot-group-toggle"
                    onClick={toggleAllWeeks}
                    style={{ cursor: 'pointer' }}
                  >
                    {weekColumnGroups.every((wg) => collapsedWeeks.has(wg.monday)) ? '+' : '−'}
                  </span>
                )}
                Ora
              </th>
              {weekColumnGroups ? weekColumnGroups.map((wg) => {
                const isCollapsed = collapsedWeeks.has(wg.monday);
                if (isCollapsed) {
                  return (
                    <th
                      key={wg.monday}
                      className="pivot-date-col pivot-group-row"
                      onClick={() => toggleWeek(wg.monday)}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="pivot-group-toggle">+</span>
                      <br />
                      {wg.label}
                    </th>
                  );
                }
                return wg.dates.map((col, i) => (
                  <th key={col} className="pivot-date-col">
                    {i === 0 && (
                      <span
                        className="pivot-group-toggle"
                        onClick={() => toggleWeek(wg.monday)}
                        style={{ cursor: 'pointer' }}
                      >
                        −
                      </span>
                    )}
                    <span className="pivot-day-name">
                      {DAY_NAMES[new Date(col + 'T12:00:00').getDay()]}
                    </span>
                    <br />
                    {formatDateShort(col)}
                  </th>
                ));
              }) : pivot.columns.map((col, i) => (
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
            {viewMode !== 'weekly' && pivot.rows.length > 0 && (
              <>
                {[
                  { key: 'trips', fn: (s: { trips: number; total: number; avg: number }) => s.trips },
                  { key: 'total', fn: (s: { trips: number; total: number; avg: number }) => s.total },
                  { key: 'avg', fn: (s: { trips: number; total: number; avg: number }) => s.avg },
                ] .map(({ key, fn }) => (
                  <tr key={key} className="pivot-stat-row">
                    <th className="pivot-sticky pivot-sticky-time" style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}></th>
                    {weekColumnGroups ? weekColumnGroups.map((wg, gi) => {
                      const isCollapsed = collapsedWeeks.has(wg.monday);
                      if (isCollapsed) {
                        const s = weekGroupStats?.[gi];
                        return <td key={wg.monday} className="pivot-cell" style={{ fontSize: 11, color: '#64748b' }}>{s ? fn(s) : '—'}</td>;
                      }
                      return wg.dates.map((col) => {
                        const ci = daily.columns.indexOf(col);
                        const s = columnStats[ci];
                        return <td key={col} className="pivot-cell" style={{ fontSize: 11, color: '#64748b' }}>{s ? fn(s) : '—'}</td>;
                      });
                    }) : daily.columns.map((col, ci) => {
                      const s = columnStats[ci];
                      return <td key={ci} className="pivot-cell" style={{ fontSize: 11, color: '#64748b' }}>{s ? fn(s) : '—'}</td>;
                    })}
                  </tr>
                ))}
              </>
            )}
          </thead>
          <tbody>
            {pivot.rows.map((row) => (
              <tr key={row.key}>
                <td className="pivot-time pivot-sticky pivot-sticky-time">{row.departure_time}</td>
                {weekColumnGroups ? weekColumnGroups.map((wg) => {
                  const isCollapsed = collapsedWeeks.has(wg.monday);
                  if (isCollapsed) {
                    let sum: number | null = null;
                    for (const d of wg.dates) {
                      const cell = daily.cellMap.get(`${row.key}|${d}`);
                      if (cell && cell.status === 'OK' && cell.passengers != null) {
                        sum = (sum || 0) + cell.passengers;
                      }
                    }
                    return (
                      <td key={wg.monday} className={`pivot-cell${sum == null ? ' pivot-empty' : ''}`}>
                        {sum != null ? sum : '—'}
                      </td>
                    );
                  }
                  return wg.dates.map((col) => {
                    const cell = daily.cellMap.get(`${row.key}|${col}`);
                    let display: string;
                    let className = 'pivot-cell';
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
                    return (
                      <td key={col} className={className}>
                        {display}
                      </td>
                    );
                  });
                }) : pivot.columns.map((col, ci) => {
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
            ))}
            {pivot.rows.length === 0 && (
              <tr>
                <td colSpan={1 + pivot.columns.length} className="text-center text-muted" style={{ padding: 24 }}>
                  Nu există date pentru perioada selectată.
                </td>
              </tr>
            )}
          </tbody>
          {pivot.rows.length > 0 && (
            <tfoot>
              <tr className="pivot-total-row">
                <td className="pivot-sticky pivot-total-label">Total</td>
                {weekColumnGroups ? weekColumnGroups.map((wg) => {
                  const isCollapsed = collapsedWeeks.has(wg.monday);
                  if (isCollapsed) {
                    let sum = 0;
                    let hasData = false;
                    for (const d of wg.dates) {
                      for (const row of pivot.rows) {
                        const cell = daily.cellMap.get(`${row.key}|${d}`);
                        if (cell && cell.status === 'OK' && cell.passengers != null) {
                          sum += cell.passengers;
                          hasData = true;
                        }
                      }
                    }
                    return (
                      <td key={wg.monday} className="pivot-cell pivot-total-cell">
                        {hasData ? sum : '—'}
                      </td>
                    );
                  }
                  return wg.dates.map((col) => {
                    let sum = 0;
                    let hasData = false;
                    for (const row of pivot.rows) {
                      const cell = daily.cellMap.get(`${row.key}|${col}`);
                      if (cell && cell.status === 'OK' && cell.passengers != null) {
                        sum += cell.passengers;
                        hasData = true;
                      }
                    }
                    return (
                      <td key={col} className="pivot-cell pivot-total-cell">
                        {hasData ? sum : '—'}
                      </td>
                    );
                  });
                }) : columnTotals.map((total, ci) => (
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
