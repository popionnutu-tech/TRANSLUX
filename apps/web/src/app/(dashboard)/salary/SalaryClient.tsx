'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { POINT_LABELS } from '@translux/db';
import { IURIE_TELEGRAM_ID } from '@/lib/operators';
import type { SalaryReport } from './actions';

type Period = 'weekly' | 'monthly';

interface Props {
  salaryData: SalaryReport;
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

const DAY_NAMES = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

function formatDateWithDay(d: string) {
  const dt = new Date(d + 'T12:00:00');
  const dayName = DAY_NAMES[dt.getDay()];
  return `${dayName} ${formatDateShort(d)}`;
}

const MONTHS_RO = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];

export default function SalaryClient({ salaryData, dateFrom, dateTo, period }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expandedOperator, setExpandedOperator] = useState<string | null>(null);
  const [tiktokVideos, setTiktokVideos] = useState<{ tiktok1: number; tiktok2: number }>({
    tiktok1: 0,
    tiktok2: 0,
  });

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.push(`/salary?${params.toString()}`);
    },
    [router, searchParams],
  );

  function handlePeriodChange(newPeriod: Period) {
    const dates = getPeriodDates(newPeriod);
    updateParams({ period: newPeriod, dateFrom: dates.dateFrom, dateTo: dates.dateTo });
  }

  // Find Iurie for TikTok bonus
  const iurie = salaryData.operators.find((op) => op.telegramId === IURIE_TELEGRAM_ID);
  const tiktokTotal = (tiktokVideos.tiktok1 + tiktokVideos.tiktok2) * 100;

  const grandTotal = salaryData.operators.reduce((sum, op) => sum + op.baseSalary, 0) + tiktokTotal;

  // Format period label
  const fromDate = new Date(dateFrom + 'T12:00:00');
  const toDate = new Date(dateTo + 'T12:00:00');
  const periodLabel =
    period === 'monthly'
      ? `${MONTHS_RO[fromDate.getMonth()]} ${fromDate.getFullYear()}`
      : `${formatDateShort(dateFrom)} — ${formatDateShort(dateTo)}`;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1000 }}>
      <style>{`
        .salary-card {
          background: #fff;
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 20px;
        }
        .salary-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .salary-title {
          font-size: 20px;
          font-weight: 700;
          color: #111;
        }
        .salary-controls {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .period-btn {
          padding: 6px 14px;
          border-radius: 6px;
          border: 1px solid #ddd;
          background: #fff;
          color: #666;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .period-btn:hover {
          border-color: #D42027;
          color: #D42027;
        }
        .period-btn-active {
          background: #D42027;
          color: #fff;
          border-color: #D42027;
        }
        .date-input {
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid #ddd;
          font-size: 13px;
          font-family: inherit;
          color: #333;
        }
        .salary-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .salary-table th {
          text-align: left;
          padding: 10px 12px;
          border-bottom: 2px solid #eee;
          color: #999;
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .salary-table td {
          padding: 12px;
          border-bottom: 1px solid #f5f5f5;
          color: #333;
        }
        .salary-table tr:last-child td {
          border-bottom: none;
        }
        .salary-table .operator-row {
          cursor: pointer;
          transition: background 0.15s;
        }
        .salary-table .operator-row:hover {
          background: #fafafa;
        }
        .point-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }
        .point-CHISINAU {
          background: rgba(59,130,246,0.08);
          color: #3b82f6;
        }
        .point-BALTI {
          background: rgba(168,85,247,0.08);
          color: #a855f7;
        }
        .salary-amount {
          font-weight: 700;
          color: #111;
          font-size: 15px;
        }
        .day-details {
          background: #fafafa;
          padding: 0;
        }
        .day-details td {
          padding: 0;
        }
        .day-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 6px;
          padding: 12px 16px;
        }
        .day-chip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 12px;
          border: 1px solid #eee;
          background: #fff;
        }
        .day-chip-ok {
          border-color: #d1fae5;
          background: #f0fdf4;
        }
        .day-chip-bad {
          border-color: #fecaca;
          background: #fef2f2;
          color: #b91c1c;
        }
        .expand-icon {
          font-size: 10px;
          color: #999;
          transition: transform 0.2s;
        }
        .total-row td {
          border-top: 2px solid #eee;
          font-weight: 700;
          color: #111;
          font-size: 14px;
        }
        .tiktok-section {
          margin-top: 8px;
        }
        .tiktok-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        .tiktok-input-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .tiktok-label {
          font-size: 12px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .tiktok-input {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          width: 100%;
          box-sizing: border-box;
        }
        .tiktok-input:focus {
          outline: none;
          border-color: #D42027;
        }
        .tiktok-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: #fafafa;
          border-radius: 8px;
          font-size: 13px;
        }
        .tiktok-total {
          font-weight: 700;
          font-size: 16px;
          color: #111;
        }
        .grand-total-card {
          background: linear-gradient(135deg, #D42027 0%, #a01a1f 100%);
          color: #fff;
          border-radius: 12px;
          padding: 20px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .grand-total-label {
          font-size: 14px;
          font-weight: 500;
          opacity: 0.9;
        }
        .grand-total-amount {
          font-size: 28px;
          font-weight: 800;
        }
        .disqualified-badge {
          color: #b91c1c;
          font-size: 11px;
          font-weight: 600;
        }
        .qualified-count {
          color: #16a34a;
          font-weight: 600;
        }
      `}</style>

      {/* Header */}
      <div className="salary-header">
        <div className="salary-title">Salariu operatori</div>
        <div className="salary-controls">
          <button
            className={`period-btn${period === 'weekly' ? ' period-btn-active' : ''}`}
            onClick={() => handlePeriodChange('weekly')}
          >
            Săptămânal
          </button>
          <button
            className={`period-btn${period === 'monthly' ? ' period-btn-active' : ''}`}
            onClick={() => handlePeriodChange('monthly')}
          >
            Lunar
          </button>
          <input
            type="date"
            className="date-input"
            value={dateFrom}
            onChange={(e) => updateParams({ dateFrom: e.target.value, period: undefined })}
          />
          <span style={{ color: '#999' }}>—</span>
          <input
            type="date"
            className="date-input"
            value={dateTo}
            onChange={(e) => updateParams({ dateTo: e.target.value, period: undefined })}
          />
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#999', marginBottom: 20 }}>{periodLabel}</div>

      {/* Main salary table */}
      <div className="salary-card">
        <table className="salary-table">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Punct</th>
              <th>Tarif/zi</th>
              <th>Zile lucrate</th>
              <th>Zile valide</th>
              <th style={{ textAlign: 'right' }}>Salariu</th>
            </tr>
          </thead>
          <tbody>
            {salaryData.operators.map((op) => (
              <>
                <tr
                  key={op.userId}
                  className="operator-row"
                  onClick={() =>
                    setExpandedOperator(expandedOperator === op.userId ? null : op.userId)
                  }
                >
                  <td>
                    <span style={{ fontWeight: 600 }}>{op.operatorName}</span>
                    {op.telegramUsername && (
                      <span style={{ color: '#999', marginLeft: 6, fontSize: 12 }}>
                        @{op.telegramUsername}
                      </span>
                    )}
                    <span className="expand-icon" style={{ marginLeft: 8 }}>
                      {expandedOperator === op.userId ? '\u25B2' : '\u25BC'}
                    </span>
                  </td>
                  <td>
                    <span className={`point-badge point-${op.point}`}>
                      {POINT_LABELS[op.point]}
                    </span>
                  </td>
                  <td>{op.dailyRate} lei</td>
                  <td>{op.workingDays}</td>
                  <td>
                    <span className="qualified-count">{op.qualifiedDays}</span>
                    {op.disqualifiedDays > 0 && (
                      <span className="disqualified-badge" style={{ marginLeft: 6 }}>
                        (-{op.disqualifiedDays})
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="salary-amount">{op.baseSalary.toLocaleString()} lei</span>
                  </td>
                </tr>
                {expandedOperator === op.userId && (
                  <tr key={`${op.userId}-details`} className="day-details">
                    <td colSpan={6}>
                      <div className="day-grid">
                        {op.dayDetails.map((day) => (
                          <div
                            key={day.date}
                            className={`day-chip ${day.qualifies ? 'day-chip-ok' : 'day-chip-bad'}`}
                          >
                            <span>{formatDateWithDay(day.date)}</span>
                            <span style={{ fontSize: 11, opacity: 0.7 }}>
                              {day.totalReports}r
                              {day.geoViolations > 0 && ` / ${day.geoViolations}geo`}
                            </span>
                          </div>
                        ))}
                        {op.dayDetails.length === 0 && (
                          <div style={{ color: '#999', padding: '8px 0', fontSize: 12 }}>
                            Nu sunt rapoarte în această perioadă
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}

            {/* Total row */}
            <tr className="total-row">
              <td colSpan={5}>Total salariu de bază</td>
              <td style={{ textAlign: 'right', fontSize: 16 }}>
                {salaryData.operators
                  .reduce((sum, op) => sum + op.baseSalary, 0)
                  .toLocaleString()}{' '}
                lei
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* TikTok bonus section for Iurie */}
      {iurie && (
        <div className="salary-card tiktok-section">
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 16 }}>
            Bonus TikTok — {iurie.operatorName}
          </div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
            100 lei per video postat
          </div>
          <div className="tiktok-grid">
            <div className="tiktok-input-group">
              <label className="tiktok-label">TikTok 1 — videouri</label>
              <input
                type="number"
                min={0}
                className="tiktok-input"
                value={tiktokVideos.tiktok1}
                onChange={(e) =>
                  setTiktokVideos((prev) => ({
                    ...prev,
                    tiktok1: Math.max(0, parseInt(e.target.value) || 0),
                  }))
                }
              />
            </div>
            <div className="tiktok-input-group">
              <label className="tiktok-label">TikTok 2 — videouri</label>
              <input
                type="number"
                min={0}
                className="tiktok-input"
                value={tiktokVideos.tiktok2}
                onChange={(e) =>
                  setTiktokVideos((prev) => ({
                    ...prev,
                    tiktok2: Math.max(0, parseInt(e.target.value) || 0),
                  }))
                }
              />
            </div>
          </div>
          <div className="tiktok-summary">
            <span>
              {tiktokVideos.tiktok1 + tiktokVideos.tiktok2} videouri x 100 lei
            </span>
            <span className="tiktok-total">{tiktokTotal.toLocaleString()} lei</span>
          </div>
        </div>
      )}

      {/* Grand total */}
      <div className="grand-total-card">
        <div className="grand-total-label">Total general</div>
        <div className="grand-total-amount">{grandTotal.toLocaleString()} lei</div>
      </div>
    </div>
  );
}
