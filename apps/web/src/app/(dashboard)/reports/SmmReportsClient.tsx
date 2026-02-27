'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { SMM_PLATFORM_LABELS } from '@translux/db';
import type { SmmReportRow } from './smm-actions';

interface Props {
  smmData: SmmReportRow[];
  dateFrom: string;
  dateTo: string;
}

function formatDateShort(d: string) {
  const [, m, day] = d.split('-');
  return `${day}.${m}`;
}

const DAY_NAMES = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

export default function SmmReportsClient({ smmData, dateFrom, dateTo }: Props) {
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

  return (
    <div className="page-wide">
      <div className="page-header">
        <h1>Rapoarte</h1>
      </div>

      {/* Report type toggle */}
      <div className="card mb-4">
        <div className="filter-bar">
          <div className="mode-toggle">
            <button
              className="mode-btn"
              onClick={() => updateParams({ reportType: '' })}
            >
              Transport
            </button>
            <button className="mode-btn mode-btn-active">SMM</button>
          </div>

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
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid-4 mb-4">
        <div className="summary-card card">
          <div className="summary-value">{summary.posts}</div>
          <div className="summary-label">Postări</div>
        </div>
        <div className="summary-card card">
          <div className="summary-value">{summary.views.toLocaleString()}</div>
          <div className="summary-label">Vizualizări</div>
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

      {/* Pivot table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        {pivot.dates.length === 0 ? (
          <p className="text-center text-muted" style={{ padding: 24 }}>
            Nu există date SMM pentru această perioadă.
          </p>
        ) : (
          <table className="pivot-table">
            <thead>
              <tr>
                <th className="pivot-sticky" style={{ left: 0, zIndex: 2 }}>
                  Data
                </th>
                {pivot.accounts.map((acc) => {
                  const platform = smmData.find(
                    (r) => r.account_name === acc
                  )?.platform;
                  const icon = platform === 'TIKTOK' ? '🎵' : '📘';
                  return (
                    <th key={acc} colSpan={4} style={{ textAlign: 'center' }}>
                      {icon} {acc}
                    </th>
                  );
                })}
              </tr>
              <tr>
                <th className="pivot-sticky" style={{ left: 0, zIndex: 2 }} />
                {pivot.accounts.map((acc) => (
                  <React.Fragment key={acc}>
                    <th className="pivot-cell">👁</th>
                    <th className="pivot-cell">❤️</th>
                    <th className="pivot-cell">💬</th>
                    <th className="pivot-cell">🔄</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {pivot.dates.map((d) => {
                const dt = new Date(d + 'T12:00:00');
                const dayName = DAY_NAMES[dt.getDay()];
                return (
                  <tr key={d}>
                    <td
                      className="pivot-sticky"
                      style={{
                        left: 0,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {dayName} {formatDateShort(d)}
                    </td>
                    {pivot.accounts.map((acc) => {
                      const cell = pivot.cellMap.get(`${acc}|${d}`);
                      return (
                        <React.Fragment key={acc}>
                          <td className="pivot-cell">
                            {cell ? cell.total_views.toLocaleString() : '—'}
                          </td>
                          <td className="pivot-cell">
                            {cell ? cell.total_likes : '—'}
                          </td>
                          <td className="pivot-cell">
                            {cell ? cell.total_comments : '—'}
                          </td>
                          <td className="pivot-cell">
                            {cell ? cell.total_shares : '—'}
                          </td>
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
    </div>
  );
}

// React is already in scope via JSX transform, but need Fragment
import React from 'react';
