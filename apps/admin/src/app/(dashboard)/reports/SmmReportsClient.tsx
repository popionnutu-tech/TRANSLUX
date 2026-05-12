'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { SMM_PLATFORM_LABELS } from '@translux/db';
import type { SmmReportRow } from './smm-actions';

type Period = 'daily' | 'weekly' | 'monthly';

interface Props {
  smmData: SmmReportRow[];
  dateFrom: string;
  dateTo: string;
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

function formatDateShort(d: string) {
  const [, m, day] = d.split('-');
  return `${day}.${m}`;
}

const DAY_NAMES = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sam'];

function getMondayStr(dateStr: string): string {
  const dt = new Date(dateStr + 'T12:00:00');
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(dt);
  monday.setDate(diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type WeekTotals = { posts: number; views: number; likes: number; comments: number; shares: number };

const METRICS: Array<{ key: keyof WeekTotals; label: string; fmt: (v: number) => string }> = [
  { key: 'posts', label: 'Postari', fmt: (v) => String(v) },
  { key: 'views', label: 'Vizualizari', fmt: (v) => v.toLocaleString() },
  { key: 'likes', label: 'Like-uri', fmt: (v) => v.toLocaleString() },
  { key: 'comments', label: 'Comentarii', fmt: (v) => String(v) },
  { key: 'shares', label: 'Distribuiri', fmt: (v) => String(v) },
];

export default function SmmReportsClient({ smmData, dateFrom, dateTo, period }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(new Set());
  const [smmView, setSmmView] = useState<'table' | 'comparison'>('table');

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

  // Build pivot: rows = accounts, columns = dates
  const pivot = useMemo(() => {
    const accountSet = new Set<string>();
    const dateSet = new Set<string>();
    const cellMap = new Map<string, SmmReportRow>();

    for (const r of smmData) {
      accountSet.add(r.account_name);
      dateSet.add(r.stat_date);
      cellMap.set(`${r.account_name}|${r.stat_date}`, r);
    }

    const accounts = Array.from(accountSet).sort();
    const dates = Array.from(dateSet).sort();

    return { accounts, dates, cellMap };
  }, [smmData]);

  // Determine grouping mode from actual data: by month if multiple months, by week if multiple weeks
  const groupMode = useMemo(() => {
    if (pivot.dates.length <= 1) return 'none';
    const months = new Set(pivot.dates.map((d) => d.slice(0, 7)));
    if (months.size >= 2) return 'monthly';
    const weeks = new Set(pivot.dates.map((d) => getMondayStr(d)));
    if (weeks.size >= 2) return 'weekly';
    return 'none';
  }, [pivot.dates]);

  // Group dates for collapsible UI (by week or by month)
  const weekGroups = useMemo(() => {
    if (groupMode === 'none') return null;
    const groupMap = new Map<string, string[]>();
    for (const d of pivot.dates) {
      const key = groupMode === 'weekly' ? getMondayStr(d) : d.slice(0, 7);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(d);
    }
    const MONTH_NAMES = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Array.from(groupMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, dates]) => {
        let label: string;
        if (groupMode === 'weekly') {
          const sundayDt = new Date(key + 'T12:00:00');
          sundayDt.setDate(sundayDt.getDate() + 6);
          const sy = sundayDt.getFullYear();
          const sm = String(sundayDt.getMonth() + 1).padStart(2, '0');
          const sd = String(sundayDt.getDate()).padStart(2, '0');
          label = `${formatDateShort(key)}-${formatDateShort(`${sy}-${sm}-${sd}`)}`;
        } else {
          const [y, m] = key.split('-');
          label = `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
        }
        return { monday: key, label, dates };
      });
  }, [pivot.dates, groupMode]);

  function toggleWeek(monday: string) {
    setCollapsedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(monday)) next.delete(monday);
      else next.add(monday);
      return next;
    });
  }

  function toggleAllWeeks() {
    if (!weekGroups) return;
    const allCollapsed = weekGroups.every((wg) => collapsedWeeks.has(wg.monday));
    if (allCollapsed) {
      setCollapsedWeeks(new Set());
    } else {
      setCollapsedWeeks(new Set(weekGroups.map((wg) => wg.monday)));
    }
  }

  // Summary
  const summary = useMemo(() => {
    let views = 0,
      likes = 0,
      posts = 0,
      comments = 0;
    for (const r of smmData) {
      views += r.total_views;
      likes += r.total_likes;
      posts += r.posts_count;
      comments += r.total_comments;
    }
    return { views, likes, posts, comments };
  }, [smmData]);

  // ── Week comparison data ──────────────────────
  const weekComparison = useMemo(() => {
    const totalsMap = new Map<string, WeekTotals>();
    const perAccountMap = new Map<string, Map<string, WeekTotals>>();

    for (const r of smmData) {
      const monday = getMondayStr(r.stat_date);

      // Total
      if (!totalsMap.has(monday)) totalsMap.set(monday, { posts: 0, views: 0, likes: 0, comments: 0, shares: 0 });
      const t = totalsMap.get(monday)!;
      t.posts += r.posts_count;
      t.views += r.total_views;
      t.likes += r.total_likes;
      t.comments += r.total_comments;
      t.shares += r.total_shares;

      // Per account
      if (!perAccountMap.has(r.account_name)) perAccountMap.set(r.account_name, new Map());
      const accMap = perAccountMap.get(r.account_name)!;
      if (!accMap.has(monday)) accMap.set(monday, { posts: 0, views: 0, likes: 0, comments: 0, shares: 0 });
      const a = accMap.get(monday)!;
      a.posts += r.posts_count;
      a.views += r.total_views;
      a.likes += r.total_likes;
      a.comments += r.total_comments;
      a.shares += r.total_shares;
    }

    // Weeks sorted newest first
    const weeks = Array.from(totalsMap.keys())
      .sort((a, b) => b.localeCompare(a))
      .map((monday) => {
        const sundayDt = new Date(monday + 'T12:00:00');
        sundayDt.setDate(sundayDt.getDate() + 6);
        return { monday, label: `${formatDateShort(monday)} – ${formatDateShort(toDateStr(sundayDt))}` };
      });

    const accounts = Array.from(perAccountMap.keys()).sort();

    return { weeks, totalsMap, perAccountMap, accounts };
  }, [smmData]);

  function renderComparisonBlock(
    title: string,
    dataMap: Map<string, WeekTotals>,
    weeks: Array<{ monday: string; label: string }>
  ) {
    return (
      <>
        <tr>
          <td
            className="pivot-sticky"
            style={{ left: 0, fontWeight: 700, background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-accent)' }}
            colSpan={1 + weeks.length}
          >
            {title}
          </td>
        </tr>
        {METRICS.map((metric) => (
          <tr key={`${title}-${metric.key}`}>
            <td className="pivot-sticky" style={{ left: 0, paddingLeft: 20, fontSize: 12 }}>{metric.label}</td>
            {weeks.map((w, wi) => {
              const data = dataMap.get(w.monday);
              const val = data ? data[metric.key] : 0;
              const nextWeek = weeks[wi + 1];
              const prevData = nextWeek ? dataMap.get(nextWeek.monday) : null;
              const prevVal = prevData ? prevData[metric.key] : 0;
              const delta = prevVal > 0 ? ((val - prevVal) / prevVal) * 100 : null;

              return (
                <td key={w.monday} className="pivot-cell" style={{ textAlign: 'center', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 500 }}>{metric.fmt(val)}</div>
                  {delta != null && (
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: delta >= 0 ? 'var(--success)' : 'var(--danger)',
                        marginTop: 1,
                      }}
                    >
                      {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </>
    );
  }

  return (
    <div className="page-wide">
      <div className="page-header">
        <h1>Rapoarte</h1>
      </div>

      {/* Report type toggle */}
      <div className="card mb-4" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <div className="mode-toggle">
            <button
              className="mode-btn"
              onClick={() => updateParams({ reportType: '' })}
            >
              Transport
            </button>
            <button className="mode-btn mode-btn-active">SMM</button>
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
                {p === 'daily' ? 'Zilnic' : p === 'weekly' ? 'Saptamanal' : 'Lunar'}
              </button>
            ))}
          </div>
          <div className="mode-toggle" style={{ marginLeft: 8 }}>
            <button
              className={`mode-btn${smmView === 'table' ? ' mode-btn-active' : ''}`}
              onClick={() => setSmmView('table')}
            >
              Tabel
            </button>
            <button
              className={`mode-btn${smmView === 'comparison' ? ' mode-btn-active' : ''}`}
              onClick={() => setSmmView('comparison')}
            >
              Comparatie saptamini
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>De la</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => updateParams({ dateFrom: e.target.value, period: '' })}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Pana la</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => updateParams({ dateTo: e.target.value, period: '' })}
            />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid-4 mb-4">
        <div className="summary-card card">
          <div className="summary-value">{summary.posts}</div>
          <div className="summary-label">Postari</div>
        </div>
        <div className="summary-card card">
          <div className="summary-value">{summary.views.toLocaleString()}</div>
          <div className="summary-label">Vizualizari</div>
        </div>
        <div className="summary-card card">
          <div className="summary-value">{summary.likes.toLocaleString()}</div>
          <div className="summary-label">Like-uri</div>
        </div>
        <div className="summary-card card">
          <div className="summary-value">{summary.comments}</div>
          <div className="summary-label">Comentarii</div>
        </div>
      </div>

      {/* Comparison view */}
      {smmView === 'comparison' && (
        <div className="card" style={{ overflowX: 'auto' }}>
          {weekComparison.weeks.length < 2 ? (
            <p className="text-center text-muted" style={{ padding: 24 }}>
              Selectati o perioada care include cel putin 2 saptamini pentru comparatie.
            </p>
          ) : (
            <table className="pivot-table">
              <thead>
                <tr>
                  <th className="pivot-sticky" style={{ left: 0, zIndex: 2, minWidth: 140 }}>Metric</th>
                  {weekComparison.weeks.map((w) => (
                    <th key={w.monday} style={{ textAlign: 'center', minWidth: 110 }}>{w.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {renderComparisonBlock('Total', weekComparison.totalsMap, weekComparison.weeks)}
                {weekComparison.accounts.map((accName) => {
                  const accData = weekComparison.perAccountMap.get(accName)!;
                  const platform = smmData.find((r) => r.account_name === accName)?.platform;
                  const platformLabel = platform ? SMM_PLATFORM_LABELS[platform] : '';
                  return (
                    <React.Fragment key={accName}>
                      {renderComparisonBlock(`${accName} (${platformLabel})`, accData, weekComparison.weeks)}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pivot table (standard view) */}
      {smmView === 'table' && (
        <div className="card" style={{ overflowX: 'auto' }}>
          {pivot.dates.length === 0 ? (
            <p className="text-center text-muted" style={{ padding: 24 }}>
              Nu exista date SMM pentru aceasta perioada.
            </p>
          ) : (
            <table className="pivot-table pivot-compact">
              <thead>
                <tr>
                  <th className="pivot-sticky" style={{ left: 0, zIndex: 2 }}>
                    {weekGroups && (
                      <span
                        className="pivot-group-toggle"
                        onClick={toggleAllWeeks}
                        style={{ cursor: 'pointer' }}
                      >
                        {weekGroups.every((wg) => collapsedWeeks.has(wg.monday)) ? '+' : '\u2212'}
                      </span>
                    )}
                    Data
                  </th>
                  {pivot.accounts.map((acc, ai) => {
                    const platform = smmData.find(
                      (r) => r.account_name === acc
                    )?.platform;
                    const platformLabel = platform ? SMM_PLATFORM_LABELS[platform] : '';
                    return (
                      <th key={acc} colSpan={5} className={ai > 0 ? 'pivot-account-border' : ''} style={{ textAlign: 'center' }}>
                        {acc} ({platformLabel})
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  <th className="pivot-sticky" style={{ left: 0, zIndex: 2 }} />
                  {pivot.accounts.map((acc, ai) => (
                    <React.Fragment key={acc}>
                      <th className={`pivot-cell${ai > 0 ? ' pivot-account-border' : ''}`}>Post</th>
                      <th className="pivot-cell">Views</th>
                      <th className="pivot-cell">Likes</th>
                      <th className="pivot-cell">Com</th>
                      <th className="pivot-cell">Share</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekGroups ? weekGroups.map((wg) => {
                  const isCollapsed = collapsedWeeks.has(wg.monday);
                  // Compute weekly sums per account
                  const weekSums = pivot.accounts.map((acc) => {
                    let posts = 0, views = 0, likes = 0, comments = 0, shares = 0;
                    for (const d of wg.dates) {
                      const cell = pivot.cellMap.get(`${acc}|${d}`);
                      if (cell) {
                        posts += cell.posts_count;
                        views += cell.total_views;
                        likes += cell.total_likes;
                        comments += cell.total_comments;
                        shares += cell.total_shares;
                      }
                    }
                    return { posts, views, likes, comments, shares };
                  });
                  return (
                    <React.Fragment key={wg.monday}>
                      {/* Week summary row */}
                      <tr className="pivot-group-row" onClick={() => toggleWeek(wg.monday)} style={{ cursor: 'pointer' }}>
                        <td
                          className="pivot-sticky"
                          style={{ left: 0, fontWeight: 700, whiteSpace: 'nowrap' }}
                        >
                          <span className="pivot-group-toggle">{isCollapsed ? '+' : '\u2212'}</span>
                          {wg.label}
                        </td>
                        {weekSums.map((ws, i) => (
                          <React.Fragment key={i}>
                            <td className={`pivot-cell${i > 0 ? ' pivot-account-border' : ''}`} style={{ fontWeight: 700 }}>{ws.posts}</td>
                            <td className="pivot-cell" style={{ fontWeight: 700 }}>{ws.views.toLocaleString()}</td>
                            <td className="pivot-cell" style={{ fontWeight: 700 }}>{ws.likes}</td>
                            <td className="pivot-cell" style={{ fontWeight: 700 }}>{ws.comments}</td>
                            <td className="pivot-cell" style={{ fontWeight: 700 }}>{ws.shares}</td>
                          </React.Fragment>
                        ))}
                      </tr>
                      {/* Individual day rows (visible when expanded) */}
                      {!isCollapsed && wg.dates.map((d) => {
                        const dt = new Date(d + 'T12:00:00');
                        const dayName = DAY_NAMES[dt.getDay()];
                        return (
                          <tr key={d}>
                            <td
                              className="pivot-sticky"
                              style={{ left: 0, fontWeight: 400, whiteSpace: 'nowrap', paddingLeft: 20 }}
                            >
                              {dayName} {formatDateShort(d)}
                            </td>
                            {pivot.accounts.map((acc, ai) => {
                              const cell = pivot.cellMap.get(`${acc}|${d}`);
                              return (
                                <React.Fragment key={acc}>
                                  <td className={`pivot-cell${ai > 0 ? ' pivot-account-border' : ''}`}>{cell ? cell.posts_count : '\u2014'}</td>
                                  <td className="pivot-cell">{cell ? cell.total_views.toLocaleString() : '\u2014'}</td>
                                  <td className="pivot-cell">{cell ? cell.total_likes : '\u2014'}</td>
                                  <td className="pivot-cell">{cell ? cell.total_comments : '\u2014'}</td>
                                  <td className="pivot-cell">{cell ? cell.total_shares : '\u2014'}</td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                }) : pivot.dates.map((d) => {
                  const dt = new Date(d + 'T12:00:00');
                  const dayName = DAY_NAMES[dt.getDay()];
                  return (
                    <tr key={d}>
                      <td
                        className="pivot-sticky"
                        style={{ left: 0, fontWeight: 600, whiteSpace: 'nowrap' }}
                      >
                        {dayName} {formatDateShort(d)}
                      </td>
                      {pivot.accounts.map((acc, ai) => {
                        const cell = pivot.cellMap.get(`${acc}|${d}`);
                        return (
                          <React.Fragment key={acc}>
                            <td className={`pivot-cell${ai > 0 ? ' pivot-account-border' : ''}`}>{cell ? cell.posts_count : '\u2014'}</td>
                            <td className="pivot-cell">{cell ? cell.total_views.toLocaleString() : '\u2014'}</td>
                            <td className="pivot-cell">{cell ? cell.total_likes : '\u2014'}</td>
                            <td className="pivot-cell">{cell ? cell.total_comments : '\u2014'}</td>
                            <td className="pivot-cell">{cell ? cell.total_shares : '\u2014'}</td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
