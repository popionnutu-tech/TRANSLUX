'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { POINT_LABELS } from '@translux/db';
import type { SalaryReport } from './actions';

interface Props {
  salaryData: SalaryReport;
  year: number;
  month: number; // 0-based
}

const MONTHS_RO = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];

const DAY_NAMES = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

function formatDateShort(d: string) {
  const [, m, day] = d.split('-');
  return `${day}.${m}`;
}

function formatDateWithDay(d: string) {
  const dt = new Date(d + 'T12:00:00');
  const dayName = DAY_NAMES[dt.getDay()];
  return `${dayName} ${formatDateShort(d)}`;
}

export default function SalaryClient({ salaryData, year, month }: Props) {
  const router = useRouter();
  const [expandedOperator, setExpandedOperator] = useState<string | null>(null);

  function goToMonth(y: number, m: number) {
    if (m < 0) { y--; m = 11; }
    if (m > 11) { y++; m = 0; }
    router.push(`/salary?year=${y}&month=${m + 1}`);
  }

  const tiktok = salaryData.tiktokBonus;
  const baseSalaryTotal = salaryData.operators.reduce((sum, op) => sum + op.baseSalary, 0);
  const tiktokTotal = tiktok?.totalBonus || 0;
  const grandTotal = baseSalaryTotal + tiktokTotal;

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
        .month-nav {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .month-btn {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          border: 1px solid #ddd;
          background: #fff;
          color: #666;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          font-family: inherit;
        }
        .month-btn:hover {
          border-color: #D42027;
          color: #D42027;
        }
        .month-label {
          font-size: 15px;
          font-weight: 600;
          color: #333;
          min-width: 140px;
          text-align: center;
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
        .tiktok-account {
          padding: 12px 16px;
          background: #fafafa;
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .tiktok-account-name {
          font-size: 13px;
          font-weight: 500;
          color: #555;
        }
        .tiktok-posts {
          font-size: 18px;
          font-weight: 700;
          color: #111;
        }
        .tiktok-posts-label {
          font-size: 11px;
          color: #999;
          font-weight: 400;
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
        <div className="month-nav">
          <button className="month-btn" onClick={() => goToMonth(year, month - 1)}>
            &lsaquo;
          </button>
          <div className="month-label">
            {MONTHS_RO[month]} {year}
          </div>
          <button className="month-btn" onClick={() => goToMonth(year, month + 1)}>
            &rsaquo;
          </button>
        </div>
      </div>

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
              <React.Fragment key={op.userId}>
                <tr
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
                  <tr key={`${op.userId}-details`}>
                    <td colSpan={6} style={{ padding: 0, background: '#fafafa' }}>
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
                            Nu sunt rapoarte
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}

            {/* Total row */}
            <tr className="total-row">
              <td colSpan={5}>Total salariu de baza</td>
              <td style={{ textAlign: 'right', fontSize: 16 }}>
                {baseSalaryTotal.toLocaleString()} lei
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* TikTok bonus section */}
      {tiktok && (
        <div className="salary-card tiktok-section">
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 16 }}>
            Bonus TikTok — Iurie
          </div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
            {MONTHS_RO[month]} {year} — 100 lei per video postat
          </div>
          <div className="tiktok-grid">
            <div className="tiktok-account">
              <span className="tiktok-account-name">{tiktok.account1Name}</span>
              <span className="tiktok-posts">
                {tiktok.account1Posts} <span className="tiktok-posts-label">videouri</span>
              </span>
            </div>
            <div className="tiktok-account">
              <span className="tiktok-account-name">{tiktok.account2Name}</span>
              <span className="tiktok-posts">
                {tiktok.account2Posts} <span className="tiktok-posts-label">videouri</span>
              </span>
            </div>
          </div>
          <div className="tiktok-summary">
            <span>
              {tiktok.totalPosts} videouri x 100 lei
            </span>
            <span className="tiktok-total">{tiktok.totalBonus.toLocaleString()} lei</span>
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
