'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getIncasareReport,
  type IncasareRow,
  type IncasareStatus,
  type UnmappedTomberon,
} from './incasareActions';

function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

function yesterdayChisinau(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

const STATUS_META: Record<IncasareStatus, { label: string; color: string; icon: string }> = {
  ok:          { label: 'OK',            color: 'var(--success)', icon: '✓' },
  underpaid:   { label: 'Datorează',     color: 'var(--danger)',  icon: '⚠' },
  overpaid:    { label: 'Plătit în plus', color: 'var(--warning)', icon: 'ℹ' },
  no_cashin:   { label: 'Fără încasare', color: 'var(--danger)',  icon: '✗' },
  no_numarare: { label: 'Fără numărare', color: 'var(--warning)', icon: '?' },
};

export default function IncasareTab() {
  const [from, setFrom] = useState<string>(yesterdayChisinau);
  const [to, setTo] = useState<string>(yesterdayChisinau);
  const [rows, setRows] = useState<IncasareRow[]>([]);
  const [unmapped, setUnmapped] = useState<UnmappedTomberon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getIncasareReport(from, to);
      if (res.error) {
        setError(res.error);
        setRows([]);
        setUnmapped([]);
      } else {
        setRows(res.rows || []);
        setUnmapped(res.unmapped || []);
      }
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const totalNumarare = rows.reduce((s, r) => s + r.numarare_lei, 0);
  const totalIncasare = rows.reduce((s, r) => s + r.incasare_lei, 0);
  const totalDiff     = totalIncasare - totalNumarare;

  return (
    <div>
      {/* Header + filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Încasare vs. Numărare</h2>
          <p className="text-muted" style={{ fontSize: 13, margin: '6px 0 0 0' }}>
            Pentru fiecare șofer: suma calculată de operatori la numărare vs. suma efectiv depusă la casa automată.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-muted" style={{ fontSize: 13 }}>De la</span>
          <input
            type="date"
            value={from}
            onChange={e => { const v = e.target.value; setFrom(v); if (v > to) setTo(v); }}
            className="form-control"
            style={{ width: 150 }}
          />
          <span className="text-muted" style={{ fontSize: 13 }}>până la</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={e => setTo(e.target.value)}
            className="form-control"
            style={{ width: 150 }}
          />
        </div>
      </div>

      {error && (
        <div style={{
          background: 'var(--danger-dim)',
          color: 'var(--danger)',
          padding: '10px 16px',
          borderRadius: 'var(--radius-xs)',
          fontSize: 13,
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Totals card */}
      <div className="card" style={{ display: 'flex', gap: 24, padding: 14, marginBottom: 12, flexWrap: 'wrap' }}>
        <div><span className="text-muted">Total numărare:</span> <strong>{Math.round(totalNumarare)} lei</strong></div>
        <div><span className="text-muted">Total încasare:</span> <strong>{Math.round(totalIncasare)} lei</strong></div>
        <div>
          <span className="text-muted">Δ:</span>{' '}
          <strong style={{ color: totalDiff < 0 ? 'var(--danger)' : totalDiff > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {totalDiff >= 0 ? '+' : ''}{Math.round(totalDiff)} lei
          </strong>
        </div>
        <div className="text-muted" style={{ fontSize: 12 }}>
          Șoferi: {rows.length}
        </div>
      </div>

      {/* Main table */}
      <div className="card">
        {loading ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 20 }}>Se încarcă...</p>
        ) : rows.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 20 }}>
            Nu există date pentru perioada selectată.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Șofer</th>
                <th>ID cash-in</th>
                <th style={{ textAlign: 'right' }}>Numărare</th>
                <th style={{ textAlign: 'right' }}>Încasare</th>
                <th style={{ textAlign: 'right' }}>Δ</th>
                <th style={{ textAlign: 'right' }}>Plăți</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const meta = STATUS_META[r.status];
                return (
                  <tr key={r.driver_id || r.cashin_sofer_id}>
                    <td style={{ fontWeight: 600 }}>{r.driver_name || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {r.cashin_sofer_id || <span className="text-muted">nesetat</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {r.numarare_lei ? `${Math.round(r.numarare_lei)} lei` : <span className="text-muted">—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {r.incasare_lei ? `${Math.round(r.incasare_lei)} lei` : <span className="text-muted">—</span>}
                    </td>
                    <td style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: r.diff < 0 ? 'var(--danger)' : r.diff > 0 ? 'var(--warning)' : 'var(--text-muted)',
                      fontWeight: 600,
                    }}>
                      {r.status === 'no_cashin' || r.status === 'no_numarare'
                        ? <span className="text-muted">—</span>
                        : `${r.diff >= 0 ? '+' : ''}${Math.round(r.diff)} lei`
                      }
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.plati || '—'}</td>
                    <td style={{ color: meta.color, fontWeight: 600, fontSize: 13 }}>
                      {meta.icon} {meta.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Unmapped warning */}
      {unmapped.length > 0 && (
        <div className="card" style={{
          marginTop: 16,
          padding: 14,
          background: 'var(--warning-dim)',
          borderLeft: '4px solid var(--warning)',
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 14, color: 'var(--warning)' }}>
            ⚠ {unmapped.length} cod(uri) cash-in necartografiate
          </h3>
          <p className="text-muted" style={{ fontSize: 12, margin: '0 0 10px 0' }}>
            Următoarele ID-uri au apărut în casa automată dar nu sunt legate de niciun șofer.
            Setează ID-ul cash-in pentru șoferul corespunzător în pagina <strong>Șoferi</strong>.
          </p>
          <table>
            <thead>
              <tr>
                <th>ID cash-in</th>
                <th style={{ textAlign: 'right' }}>Plăți</th>
                <th style={{ textAlign: 'right' }}>Încasare</th>
              </tr>
            </thead>
            <tbody>
              {unmapped.map(u => (
                <tr key={u.sofer_id}>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{u.sofer_id}</td>
                  <td style={{ textAlign: 'right' }}>{u.plati}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {Math.round(u.incasare_lei)} lei
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
