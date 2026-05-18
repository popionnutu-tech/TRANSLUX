// apps/admin/src/app/(dashboard)/reports/NumarareReportsClient.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { NumarareDailyRow, NumarareWeeklyRow } from './numarare-report-actions';

type ViewMode = 'daily' | 'weekly';

interface Props {
  dailyData: NumarareDailyRow[];
  weeklyData: NumarareWeeklyRow[];
  viewMode: ViewMode;
  date: string;
  dateFrom: string;
  dateTo: string;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DAY_NAMES = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];

export default function NumarareReportsClient({
  dailyData,
  weeklyData,
  viewMode,
  date,
  dateFrom,
  dateTo,
}: Props) {
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
    [router, searchParams],
  );

  // Daily: simple total
  const dailyTotal = useMemo(() => {
    let sum = 0;
    for (const r of dailyData) {
      if (r.passengers != null) sum += r.passengers;
    }
    return sum;
  }, [dailyData]);

  // Weekly: build pivot { routeKey → { dayOfWeek → avg } }
  const weeklyPivot = useMemo(() => {
    const routeKeys: { crm_route_id: number; dest_to_ro: string; time_chisinau: string; key: string }[] = [];
    const seen = new Set<string>();
    const cellMap = new Map<string, number>();

    for (const r of weeklyData) {
      const key = `${r.crm_route_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        routeKeys.push({
          crm_route_id: r.crm_route_id,
          dest_to_ro: r.dest_to_ro,
          time_chisinau: r.time_chisinau,
          key,
        });
      }
      cellMap.set(`${key}|${r.dayOfWeek}`, r.avgPassengers);
    }

    // Sort by time_chisinau
    const parseT = (t: string) => {
      const m = t?.match(/(\d{1,2}):(\d{2})/);
      if (!m) return 9999;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };
    routeKeys.sort((a, b) => parseT(a.time_chisinau) - parseT(b.time_chisinau));

    return { routeKeys, cellMap };
  }, [weeklyData]);

  // Weekly: column totals + row averages
  const weeklyColumnTotals = useMemo(() => {
    const totals: (number | null)[] = [];
    for (let d = 1; d <= 7; d++) {
      let sum = 0;
      let has = false;
      for (const rk of weeklyPivot.routeKeys) {
        const v = weeklyPivot.cellMap.get(`${rk.key}|${d}`);
        if (v != null) {
          sum += v;
          has = true;
        }
      }
      totals.push(has ? Math.round(sum * 10) / 10 : null);
    }
    return totals;
  }, [weeklyPivot]);

  const weeklyRowAverages = useMemo(() => {
    const avgs = new Map<string, number | null>();
    for (const rk of weeklyPivot.routeKeys) {
      let sum = 0;
      let count = 0;
      for (let d = 1; d <= 7; d++) {
        const v = weeklyPivot.cellMap.get(`${rk.key}|${d}`);
        if (v != null) {
          sum += v;
          count++;
        }
      }
      avgs.set(rk.key, count > 0 ? Math.round((sum / count) * 10) / 10 : null);
    }
    return avgs;
  }, [weeklyPivot]);

  function handleExportCSV() {
    if (viewMode === 'daily') {
      const header = 'Ruta,Ora,Pasageri';
      const lines = dailyData.map((r) =>
        `"${r.dest_to_ro}",${r.time_chisinau},${r.passengers ?? ''}`
      );
      const totalLine = `Total,,${dailyTotal}`;
      downloadCSV([header, ...lines, totalLine].join('\n'), `numarare-${date}.csv`);
    } else {
      const header = ['Ruta', 'Ora', ...DAY_NAMES, 'Media'].join(',');
      const lines = weeklyPivot.routeKeys.map((rk) => {
        const days = Array.from({ length: 7 }, (_, i) => {
          const v = weeklyPivot.cellMap.get(`${rk.key}|${i + 1}`);
          return v != null ? v.toFixed(1) : '';
        });
        const avg = weeklyRowAverages.get(rk.key);
        return [`"${rk.dest_to_ro}"`, rk.time_chisinau, ...days, avg != null ? avg.toFixed(1) : ''].join(',');
      });
      const totalLine = ['Total', '', ...weeklyColumnTotals.map((t) => t != null ? t.toFixed(1) : ''), ''].join(',');
      downloadCSV([header, ...lines, totalLine].join('\n'), `numarare-${dateFrom}_${dateTo}.csv`);
    }
  }

  function downloadCSV(csv: string, filename: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-wide">
      <div className="page-header">
        <h1>Raport numărare pasageri</h1>
        <button onClick={handleExportCSV} className="btn btn-outline">
          Exportă CSV
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <div className="mode-toggle">
            <button
              className="mode-btn"
              onClick={() => updateParams({ reportType: '' })}
            >
              Transport
            </button>
            <button
              className="mode-btn"
              onClick={() => updateParams({ reportType: 'smm' })}
            >
              SMM
            </button>
            <button className="mode-btn mode-btn-active">Numărare</button>
          </div>
          <div className="mode-toggle" style={{ marginLeft: 8 }}>
            <button
              className={`mode-btn${viewMode === 'daily' ? ' mode-btn-active' : ''}`}
              onClick={() => {
                const today = toDateStr(new Date());
                updateParams({ view: 'daily', date: today });
              }}
            >
              Zilnic
            </button>
            <button
              className={`mode-btn${viewMode === 'weekly' ? ' mode-btn-active' : ''}`}
              onClick={() => {
                updateParams({ view: 'weekly' });
              }}
            >
              Săptămânal
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
          {viewMode === 'daily' ? (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => updateParams({ date: e.target.value })}
              />
            </div>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>De la</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => updateParams({ dateFrom: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Până la</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => updateParams({ dateTo: e.target.value })}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      {viewMode === 'daily' && (
        <div className="grid-3 mb-4">
          <div className="card summary-card">
            <div className="value">{dailyTotal}</div>
            <div className="label">Total pasageri</div>
          </div>
          <div className="card summary-card">
            <div className="value">{dailyData.filter((r) => r.passengers != null).length}</div>
            <div className="label">Rute cu date</div>
          </div>
          <div className="card summary-card">
            <div className="value">
              {(() => {
                const withData = dailyData.filter((r) => r.passengers != null);
                return withData.length > 0 ? Math.round((dailyTotal / withData.length) * 10) / 10 : 0;
              })()}
            </div>
            <div className="label">Media / rută</div>
          </div>
        </div>
      )}

      {/* Table */}
      {viewMode === 'daily' ? (
        <div className="card pivot-wrap">
          <table className="pivot-table">
            <thead>
              <tr>
                <th className="pivot-sticky pivot-sticky-time">Ruta</th>
                <th className="pivot-date-col">Ora</th>
                <th className="pivot-date-col">Pasageri</th>
              </tr>
            </thead>
            <tbody>
              {dailyData.map((r) => (
                <tr key={r.crm_route_id}>
                  <td className="pivot-time pivot-sticky pivot-sticky-time">{r.dest_to_ro}</td>
                  <td className="pivot-cell">{r.time_chisinau}</td>
                  <td className={`pivot-cell${r.passengers == null ? ' pivot-empty' : ''}`}>
                    {r.passengers != null ? r.passengers : '—'}
                  </td>
                </tr>
              ))}
              {dailyData.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-muted" style={{ padding: 24 }}>
                    Nu există rute interurbane active.
                  </td>
                </tr>
              )}
            </tbody>
            {dailyData.length > 0 && (
              <tfoot>
                <tr className="pivot-total-row">
                  <td className="pivot-sticky pivot-total-label">Total</td>
                  <td className="pivot-cell pivot-total-cell" />
                  <td className="pivot-cell pivot-total-cell">{dailyTotal}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <div className="card pivot-wrap">
          <table className="pivot-table">
            <thead>
              <tr>
                <th className="pivot-sticky pivot-sticky-time">Ruta</th>
                <th className="pivot-date-col">Ora</th>
                {DAY_NAMES.map((d) => (
                  <th key={d} className="pivot-date-col">{d}</th>
                ))}
                <th className="pivot-date-col">Media</th>
              </tr>
            </thead>
            <tbody>
              {weeklyPivot.routeKeys.map((rk) => (
                <tr key={rk.crm_route_id}>
                  <td className="pivot-time pivot-sticky pivot-sticky-time">{rk.dest_to_ro}</td>
                  <td className="pivot-cell">{rk.time_chisinau}</td>
                  {Array.from({ length: 7 }, (_, i) => {
                    const v = weeklyPivot.cellMap.get(`${rk.key}|${i + 1}`);
                    return (
                      <td key={i} className={`pivot-cell${v == null ? ' pivot-empty' : ''}`}>
                        {v != null ? v.toFixed(1) : '—'}
                      </td>
                    );
                  })}
                  <td className={`pivot-cell${weeklyRowAverages.get(rk.key) == null ? ' pivot-empty' : ''}`}>
                    {weeklyRowAverages.get(rk.key) != null
                      ? weeklyRowAverages.get(rk.key)!.toFixed(1)
                      : '—'}
                  </td>
                </tr>
              ))}
              {weeklyPivot.routeKeys.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-muted" style={{ padding: 24 }}>
                    Nu există date pentru perioada selectată.
                  </td>
                </tr>
              )}
            </tbody>
            {weeklyPivot.routeKeys.length > 0 && (
              <tfoot>
                <tr className="pivot-total-row">
                  <td className="pivot-sticky pivot-total-label">Total</td>
                  <td className="pivot-cell pivot-total-cell" />
                  {weeklyColumnTotals.map((t, i) => (
                    <td key={i} className="pivot-cell pivot-total-cell">
                      {t != null ? t.toFixed(1) : '—'}
                    </td>
                  ))}
                  <td className="pivot-cell pivot-total-cell" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
