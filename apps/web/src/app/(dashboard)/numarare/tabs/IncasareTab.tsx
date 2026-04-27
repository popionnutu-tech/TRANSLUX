'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getIncasareReport,
  assignOverride,
  ignoreOverride,
  confirmDay,
  unconfirmDay,
  type IncasareRow,
  type IncasareStatus,
  type Anomaly,
  type Confirmation,
} from './incasareActions';
import AnomalyCard from './AnomalyCard';
import AssignDriverModal from './AssignDriverModal';
import IgnoreModal from './IgnoreModal';

function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}
function yesterdayChisinau(): string {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

const STATUS_META: Record<IncasareStatus, { label: string; color: string; icon: string }> = {
  ok:          { label: 'OK',             color: 'var(--success)', icon: '✓' },
  underpaid:   { label: 'Datorează',      color: 'var(--danger)',  icon: '⚠' },
  overpaid:    { label: 'Plătit în plus', color: 'var(--warning)', icon: 'ℹ' },
  no_cashin:   { label: 'Fără încasare',  color: 'var(--danger)',  icon: '✗' },
  no_numarare: { label: 'Fără numărare',  color: 'var(--warning)', icon: '?' },
};

interface Props {
  role: string;  // 'ADMIN' | 'EVALUATOR_INCASARI'
}

export default function IncasareTab({ role }: Props) {
  const canEdit = role === 'EVALUATOR_INCASARI';
  const [from, setFrom] = useState<string>(yesterdayChisinau);
  const [to, setTo] = useState<string>(yesterdayChisinau);
  const [rows, setRows] = useState<IncasareRow[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [assignTarget, setAssignTarget] = useState<Anomaly | null>(null);
  const [ignoreTarget, setIgnoreTarget] = useState<Anomaly | null>(null);

  const isSingleDay = from === to;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await getIncasareReport(from, to);
      if (res.error) {
        setError(res.error);
        setRows([]); setAnomalies([]); setConfirmation(null);
      } else if (res.data) {
        setRows(res.data.rows);
        setAnomalies(res.data.anomalies);
        setConfirmation(res.data.confirmation);
      }
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const totalNumarare = rows.reduce((s, r) => s + r.numarare_lei, 0);
  const totalIncasare = rows.reduce((s, r) => s + r.incasare_lei, 0);
  const totalPlati    = rows.reduce((s, r) => s + (r.plati || 0), 0);
  const totalLgotnici = rows.reduce((s, r) => s + (r.lgotniki_count || 0), 0);
  const totalLgotniciSuma = rows.reduce((s, r) => s + (r.lgotniki_suma || 0), 0);
  const totalRashodi  = rows.reduce((s, r) => s + (r.dop_rashodi || 0), 0);
  const totalDiff     = totalIncasare - totalNumarare;

  async function handleAssign(driverId: string, note: string | null) {
    if (!assignTarget) return;
    const res = await assignOverride(assignTarget.receipt_nr, assignTarget.ziua, driverId, note);
    if (res.error) throw new Error(res.error);
    await load();
  }
  async function handleIgnore(note: string) {
    if (!ignoreTarget) return;
    const res = await ignoreOverride(ignoreTarget.receipt_nr, ignoreTarget.ziua, note);
    if (res.error) throw new Error(res.error);
    await load();
  }
  async function handleConfirmDay() {
    if (!isSingleDay) return;
    const res = await confirmDay(from, null);
    if (res.error) { setError(res.error); return; }
    await load();
  }
  async function handleUnconfirmDay() {
    if (!isSingleDay) return;
    if (!confirm('Sigur anulezi confirmarea zilei?')) return;
    const res = await unconfirmDay(from);
    if (res.error) { setError(res.error); return; }
    await load();
  }

  return (
    <div>
      {/* Header + filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Încasare vs. Numărare</h2>
          <p className="text-muted" style={{ fontSize: 13, margin: '6px 0 0 0' }}>
            Suma calculată la numărare vs. suma efectiv depusă la casa automată.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-muted" style={{ fontSize: 13 }}>De la</span>
          <input type="date" value={from} onChange={e => { const v = e.target.value; setFrom(v); if (v > to) setTo(v); }} className="form-control" style={{ width: 150 }} />
          <span className="text-muted" style={{ fontSize: 13 }}>până la</span>
          <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="form-control" style={{ width: 150 }} />
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-dim)', color: 'var(--danger)', padding: '10px 16px', borderRadius: 'var(--radius-xs)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Bara de status zi (doar pentru o singură zi selectată) */}
      {isSingleDay && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {confirmation ? (
              <>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                  ✓ Confirmat de {confirmation.confirmed_by_name || '—'}
                </span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  ({new Date(confirmation.confirmed_at).toLocaleString('ro-RO')})
                </span>
                {confirmation.has_new_payments_after && (
                  <span style={{ color: 'var(--warning)', fontSize: 12, fontWeight: 600 }}>
                    ⚠ Au apărut plăți noi după confirmare — re-revizuiește
                  </span>
                )}
              </>
            ) : anomalies.length > 0 ? (
              <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
                ⚠ {anomalies.length} {anomalies.length === 1 ? 'alertă nerezolvată' : 'alerte nerezolvate'}
              </span>
            ) : (
              <span className="text-muted">Neconfirmat</span>
            )}
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: 8 }}>
              {confirmation ? (
                <button type="button" onClick={handleUnconfirmDay} className="btn btn-sm">Anulează confirmarea</button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmDay}
                  className="btn btn-primary btn-sm"
                  disabled={anomalies.length > 0}
                  title={anomalies.length > 0 ? `Rezolvă ${anomalies.length} alerte mai întâi` : ''}
                >
                  Confirmă ziua
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Anomalii */}
      {anomalies.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 8px 0', color: 'var(--warning)' }}>
            ⚠ {anomalies.length} {anomalies.length === 1 ? 'alertă' : 'alerte'} de revizuit
          </h3>
          {anomalies.map(a => (
            <AnomalyCard
              key={`${a.receipt_nr}-${a.ziua}`}
              anomaly={a}
              canEdit={canEdit}
              onAssignClick={() => setAssignTarget(a)}
              onIgnoreClick={() => setIgnoreTarget(a)}
            />
          ))}
        </div>
      )}

      {/* Totals */}
      <div className="card" style={{ display: 'flex', gap: 24, padding: 14, marginBottom: 12, flexWrap: 'wrap' }}>
        <div><span className="text-muted">Numărare:</span> <strong>{Math.round(totalNumarare)} lei</strong></div>
        <div><span className="text-muted">Încasare:</span> <strong>{Math.round(totalIncasare)} lei</strong></div>
        <div><span className="text-muted">Plăți:</span> <strong>{totalPlati}</strong></div>
        <div><span className="text-muted">Lgotnici:</span> <strong>{totalLgotnici} ({Math.round(totalLgotniciSuma)} lei)</strong></div>
        {totalRashodi > 0 && (
          <div><span className="text-muted">Dop. rashodi:</span> <strong>{Math.round(totalRashodi)} lei</strong></div>
        )}
        <div>
          <span className="text-muted">Δ:</span>{' '}
          <strong style={{ color: totalDiff < 0 ? 'var(--danger)' : totalDiff > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {totalDiff >= 0 ? '+' : ''}{Math.round(totalDiff)} lei
          </strong>
        </div>
        <div className="text-muted" style={{ fontSize: 12 }}>Șoferi: {rows.length}</div>
      </div>

      {/* Tabelul de șoferi */}
      <div className="card">
        {loading ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 20 }}>Se încarcă...</p>
        ) : rows.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 20 }}>Nu există date pentru perioada selectată.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Șofer</th>
                <th style={{ textAlign: 'right' }}>Numărare</th>
                <th style={{ textAlign: 'right' }}>Încasare</th>
                <th style={{ textAlign: 'right' }}>Plăți</th>
                <th style={{ textAlign: 'right' }}>Lgotnici</th>
                <th style={{ textAlign: 'right' }}>Dop. rashodi</th>
                <th style={{ textAlign: 'right' }}>Δ</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const meta = STATUS_META[r.status];
                return (
                  <tr key={r.driver_id || r.driver_name}>
                    <td style={{ fontWeight: 600 }}>{r.driver_name || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {r.numarare_lei ? `${Math.round(r.numarare_lei)} lei` : <span className="text-muted">—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {r.incasare_lei ? `${Math.round(r.incasare_lei)} lei` : <span className="text-muted">—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {r.plati > 0 ? r.plati : <span className="text-muted">—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {r.lgotniki_count > 0
                        ? <>{r.lgotniki_count} <span className="text-muted">({Math.round(r.lgotniki_suma)} lei)</span></>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {r.dop_rashodi > 0 ? `${Math.round(r.dop_rashodi)} lei` : <span className="text-muted">—</span>}
                    </td>
                    <td style={{
                      textAlign: 'right', fontFamily: 'var(--font-mono)',
                      color: r.diff < 0 ? 'var(--danger)' : r.diff > 0 ? 'var(--warning)' : 'var(--text-muted)',
                      fontWeight: 600,
                    }}>
                      {r.status === 'no_cashin' || r.status === 'no_numarare'
                        ? <span className="text-muted">—</span>
                        : `${r.diff >= 0 ? '+' : ''}${Math.round(r.diff)} lei`}
                    </td>
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

      {/* Modaluri */}
      {assignTarget && (
        <AssignDriverModal
          open={true}
          receiptNr={assignTarget.receipt_nr}
          ziua={assignTarget.ziua}
          candidates={assignTarget.duplicate_candidates}
          onConfirm={handleAssign}
          onClose={() => setAssignTarget(null)}
        />
      )}
      {ignoreTarget && (
        <IgnoreModal
          open={true}
          receiptNr={ignoreTarget.receipt_nr}
          ziua={ignoreTarget.ziua}
          onConfirm={handleIgnore}
          onClose={() => setIgnoreTarget(null)}
        />
      )}
    </div>
  );
}
