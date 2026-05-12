'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  getCameraSalary,
  getSalaryConfig,
  updateSalaryConfig,
  type CameraOperatorSalary,
  type SalaryConfig,
} from './salaryActions';

const MONTHS_RO = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];

const ROUTE_TYPE_LABELS: Record<string, string> = {
  interurban: 'Interurban',
  suburban: 'Suburban',
};

function currentChisinauDate(): { year: number; month: number } {
  const now = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const [y, m] = now.split('-').map(Number);
  return { year: y, month: m };
}

function formatDateShort(d: string): string {
  const [, m, day] = d.split('-');
  return `${day}.${m}`;
}

export default function SalaryTab() {
  const initial = currentChisinauDate();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [operators, setOperators] = useState<CameraOperatorSalary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedOperator, setExpandedOperator] = useState<string | null>(null);

  const [config, setConfig] = useState<SalaryConfig>({ interurbanPrice: 0, suburbanPrice: 0 });
  const [editInterurban, setEditInterurban] = useState('');
  const [editSuburban, setEditSuburban] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMsg, setConfigMsg] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [salaryResult, configResult] = await Promise.all([
        getCameraSalary(year, month),
        getSalaryConfig(),
      ]);
      if (salaryResult.error) {
        setError(salaryResult.error);
      } else {
        setOperators(salaryResult.data || []);
      }
      setConfig(configResult);
      setEditInterurban(String(configResult.interurbanPrice));
      setEditSuburban(String(configResult.suburbanPrice));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Eroare necunoscută';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { loadData(); }, [loadData]);

  function navigateMonth(direction: -1 | 1) {
    setExpandedOperator(null);
    let newMonth = month + direction;
    let newYear = year;
    if (newMonth < 1) { newYear--; newMonth = 12; }
    if (newMonth > 12) { newYear++; newMonth = 1; }
    setMonth(newMonth);
    setYear(newYear);
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    setConfigMsg('');

    const interurbanValue = parseFloat(editInterurban);
    const suburbanValue = parseFloat(editSuburban);

    if (isNaN(interurbanValue) || isNaN(suburbanValue)) {
      setConfigMsg('Valoare invalidă');
      setSavingConfig(false);
      return;
    }

    const r1 = await updateSalaryConfig('interurban', interurbanValue);
    if (r1.error) { setConfigMsg(r1.error); setSavingConfig(false); return; }

    const r2 = await updateSalaryConfig('suburban', suburbanValue);
    if (r2.error) { setConfigMsg(r2.error); setSavingConfig(false); return; }

    setConfigMsg('Salvat');
    setSavingConfig(false);
    await loadData();
  }

  const grandTotal = operators.reduce((sum, op) => sum + op.totalSalary, 0);
  const totalRoutes = operators.reduce(
    (sum, op) => sum + op.interurbanRoutes + op.suburbanRoutes,
    0,
  );

  return (
    <div>
      <style>{`
        .sal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .sal-title {
          font-size: 20px;
          font-weight: 400;
          color: #9B1B30;
          font-style: italic;
          letter-spacing: 0.5px;
          font-family: var(--font-opensans), Open Sans, sans-serif;
        }
        .sal-month-nav {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .sal-month-btn {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          border: 1px solid rgba(155,27,48,0.15);
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
        .sal-month-btn:hover {
          border-color: #9B1B30;
          color: #9B1B30;
        }
        .sal-month-label {
          font-size: 15px;
          font-weight: 600;
          color: #333;
          min-width: 140px;
          text-align: center;
        }
        .sal-card {
          background: rgba(255,255,255,0.6);
          border: 1px solid rgba(255,255,255,0.5);
          border-radius: 24px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 8px 40px rgba(155,27,48,0.08), 0 1px 3px rgba(0,0,0,0.04);
          padding: 24px;
          margin-bottom: 20px;
        }
        .sal-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .sal-table th {
          text-align: left;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(155,27,48,0.08);
          color: rgba(155,27,48,0.4);
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .sal-table td {
          padding: 12px;
          border-bottom: 1px solid rgba(155,27,48,0.04);
          color: #333;
        }
        .sal-table tr:last-child td {
          border-bottom: none;
        }
        .sal-operator-row {
          cursor: pointer;
          transition: background 0.15s;
        }
        .sal-operator-row:hover {
          background: rgba(155,27,48,0.03);
        }
        .sal-amount {
          font-weight: 700;
          color: #9B1B30;
          font-size: 15px;
        }
        .sal-expand-icon {
          font-size: 10px;
          color: rgba(155,27,48,0.4);
          transition: transform 0.2s;
          margin-left: 8px;
        }
        .sal-day-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 6px;
          padding: 12px 16px;
        }
        .sal-day-chip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 12px;
          border: 1px solid #d1fae5;
          background: #f0fdf4;
        }
        .sal-total-row td {
          border-top: 2px solid rgba(155,27,48,0.2);
          font-weight: 700;
          color: #9B1B30;
          font-size: 14px;
        }
        .sal-config-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .sal-config-label {
          font-size: 13px;
          color: #666;
          min-width: 90px;
          font-weight: 500;
        }
        .sal-config-input {
          width: 100px;
          padding: 7px 12px;
          border: 1px solid rgba(155,27,48,0.15);
          border-radius: 8px;
          font-size: 14px;
          font-family: var(--font-opensans), Open Sans, sans-serif;
          font-style: italic;
          color: #6E0E14;
          background: rgba(255,255,255,0.85);
          text-align: right;
        }
        .sal-config-input:focus {
          outline: none;
          border-color: rgba(155,27,48,0.3);
          box-shadow: 0 0 0 2px rgba(155,27,48,0.1);
        }
        .sal-config-unit {
          font-size: 12px;
          color: rgba(155,27,48,0.4);
        }
        .sal-grand-total {
          background: linear-gradient(135deg, #9B1B30 0%, #7a1526 100%);
          color: #fff;
          border-radius: 24px;
          padding: 20px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .sal-grand-label {
          font-size: 14px;
          font-weight: 500;
          opacity: 0.9;
        }
        .sal-grand-amount {
          font-size: 28px;
          font-weight: 800;
        }
        .sal-grand-sub {
          font-size: 12px;
          opacity: 0.7;
          margin-top: 2px;
        }
        .sal-config-msg {
          font-size: 12px;
          margin-top: 8px;
          font-weight: 500;
        }
        .sal-route-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }
        .sal-badge-interurban {
          background: rgba(59,130,246,0.08);
          color: #3b82f6;
        }
        .sal-badge-suburban {
          background: rgba(168,85,247,0.08);
          color: #a855f7;
        }
      `}</style>

      {/* Заголовок с навигацией по месяцам */}
      <div className="sal-header">
        <div className="sal-title">Salariu operatori camere</div>
        <div className="sal-month-nav">
          <button className="sal-month-btn" onClick={() => navigateMonth(-1)}>
            &lsaquo;
          </button>
          <div className="sal-month-label">
            {MONTHS_RO[month - 1]} {year}
          </div>
          <button className="sal-month-btn" onClick={() => navigateMonth(1)}>
            &rsaquo;
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(185,28,28,0.06)',
          border: '1px solid rgba(185,28,28,0.15)',
          borderRadius: 12,
          color: '#b91c1c',
          fontSize: 13,
          marginBottom: 20,
        }}>
          {error}
        </div>
      )}

      {/* Основная таблица зарплат */}
      {loading ? (
        <p className="text-muted" style={{ fontStyle: 'italic' }}>Se incarca...</p>
      ) : (
        <div className="sal-card">
          <table className="sal-table">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Curse interurbane</th>
                <th>Curse suburbane</th>
                <th>Total curse</th>
                <th style={{ textAlign: 'right' }}>Salariu</th>
              </tr>
            </thead>
            <tbody>
              {operators.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'rgba(155,27,48,0.4)', padding: 32 }}>
                    Nu sunt date pentru această lună
                  </td>
                </tr>
              ) : (
                <>
                  {operators.map((op) => (
                    <React.Fragment key={op.operatorId}>
                      <tr
                        className="sal-operator-row"
                        onClick={() =>
                          setExpandedOperator(expandedOperator === op.operatorId ? null : op.operatorId)
                        }
                      >
                        <td>
                          <span style={{ fontWeight: 600 }}>
                            {op.operatorName || op.operatorEmail}
                          </span>
                          {op.operatorName && (
                            <span style={{ color: '#999', marginLeft: 6, fontSize: 12 }}>
                              {op.operatorEmail}
                            </span>
                          )}
                          <span className="sal-expand-icon">
                            {expandedOperator === op.operatorId ? '\u25B2' : '\u25BC'}
                          </span>
                        </td>
                        <td>{op.interurbanRoutes}</td>
                        <td>{op.suburbanRoutes}</td>
                        <td style={{ fontWeight: 600 }}>
                          {op.interurbanRoutes + op.suburbanRoutes}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="sal-amount">
                            {op.totalSalary.toLocaleString()} lei
                          </span>
                        </td>
                      </tr>

                      {expandedOperator === op.operatorId && (
                        <tr>
                          <td colSpan={5} style={{ padding: 0, background: '#fafafa' }}>
                            <div className="sal-day-grid">
                              {op.dayDetails.map((day, idx) => (
                                <div key={`${day.date}-${day.routeType}-${idx}`} className="sal-day-chip">
                                  <span>{formatDateShort(day.date)}</span>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 11, opacity: 0.7 }}>
                                      {day.routeCount}x
                                    </span>
                                    <span className={`sal-route-badge sal-badge-${day.routeType}`}>
                                      {ROUTE_TYPE_LABELS[day.routeType] || day.routeType}
                                    </span>
                                  </span>
                                </div>
                              ))}
                              {op.dayDetails.length === 0 && (
                                <div style={{ color: '#999', padding: '8px 0', fontSize: 12 }}>
                                  Nu sunt curse
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}

                  {/* Итого */}
                  <tr className="sal-total-row">
                    <td>Total</td>
                    <td>{operators.reduce((s, o) => s + o.interurbanRoutes, 0)}</td>
                    <td>{operators.reduce((s, o) => s + o.suburbanRoutes, 0)}</td>
                    <td style={{ fontWeight: 700 }}>{totalRoutes}</td>
                    <td style={{ textAlign: 'right', fontSize: 16 }}>
                      {grandTotal.toLocaleString()} lei
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Настройка тарифов */}
      <div className="sal-card">
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 16 }}>
          Pret per cursa
        </div>

        <div className="sal-config-row">
          <span className="sal-config-label">Interurban:</span>
          <input
            type="number"
            className="sal-config-input"
            value={editInterurban}
            onChange={(e) => setEditInterurban(e.target.value)}
            min={0}
            step={1}
          />
          <span className="sal-config-unit">lei/cursa</span>
        </div>

        <div className="sal-config-row">
          <span className="sal-config-label">Suburban:</span>
          <input
            type="number"
            className="sal-config-input"
            value={editSuburban}
            onChange={(e) => setEditSuburban(e.target.value)}
            min={0}
            step={1}
          />
          <span className="sal-config-unit">lei/cursa</span>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSaveConfig}
          disabled={savingConfig}
          style={{ marginTop: 8 }}
        >
          {savingConfig ? 'Se salveaza...' : 'Salveaza'}
        </button>

        {configMsg && (
          <div
            className="sal-config-msg"
            style={{ color: configMsg === 'Salvat' ? '#16a34a' : '#b91c1c' }}
          >
            {configMsg}
          </div>
        )}
      </div>

      {/* Grand total */}
      {!loading && operators.length > 0 && (
        <div className="sal-grand-total">
          <div>
            <div className="sal-grand-label">Total general</div>
            <div className="sal-grand-sub">
              {operators.length} {operators.length === 1 ? 'operator' : 'operatori'} / {totalRoutes} curse
            </div>
          </div>
          <div className="sal-grand-amount">{grandTotal.toLocaleString()} lei</div>
        </div>
      )}
    </div>
  );
}
