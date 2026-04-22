'use client';

import { useEffect, useState } from 'react';
import { getAuditComparison, type AuditComparison } from './auditActions';
import { buildComparisonRows, type ComparisonRow } from './comparison';

interface Props {
  sessionId: string;
  onClose: () => void;
}

export default function AuditComparisonView({ sessionId, onClose }: Props) {
  const [data, setData] = useState<AuditComparison | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAuditComparison(sessionId).then(res => {
      if (res.error) setError(res.error);
      else setData(res.data || null);
    });
  }, [sessionId]);

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <p className="text-muted">Se încarcă comparația...</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>Comparație Operator vs Audit</h2>
        <button className="btn btn-outline" onClick={onClose}>Închide</button>
      </div>

      <TotalsCard totals={data.totals} />

      {data.routeType === 'interurban' && (
        <>
          <DirectionTable title="Tur" rows={buildComparisonRows(data.tur.operator, data.tur.audit)} />
          <DirectionTable title="Retur" rows={buildComparisonRows(data.retur.operator, data.retur.audit)} />
        </>
      )}

      {data.routeType === 'suburban' && data.suburbanGroups && data.suburbanGroups.map(g => (
        <DirectionTable
          key={`${g.scheduleId}-${g.cycleNumber}-${g.direction}`}
          title={`${g.direction.toUpperCase()} — schedule ${g.scheduleId}, ciclu ${g.cycleNumber}`}
          rows={buildComparisonRows(g.operator, g.audit)}
        />
      ))}
    </div>
  );
}

function TotalsCard({ totals }: { totals: AuditComparison['totals'] }) {
  const opTotal = (totals.operatorTur ?? 0) + (totals.operatorRetur ?? 0);
  const auTotal = (totals.auditTur ?? 0) + (totals.auditRetur ?? 0);
  const delta = auTotal - opTotal;
  return (
    <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      <div><span className="text-muted">Operator (Tur+Retur):</span> <strong>{opTotal} lei</strong></div>
      <div><span className="text-muted">Audit (Tur+Retur):</span> <strong>{auTotal} lei</strong></div>
      <div>
        <span className="text-muted">Δ:</span>{' '}
        <strong style={{ color: delta === 0 ? 'var(--success)' : 'var(--warning)' }}>
          {delta >= 0 ? '+' : ''}{delta} lei
        </strong>
      </div>
    </div>
  );
}

function DirectionTable({ title, rows }: { title: string; rows: ComparisonRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <table className="table" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th>Nr</th>
            <th>Stație</th>
            <th>Op. Total</th>
            <th>Au. Total</th>
            <th>Δ Total</th>
            <th>Op. Cob.</th>
            <th>Au. Cob.</th>
            <th>Op. Scurți</th>
            <th>Au. Scurți</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.stopOrder} style={r.hasDiff ? { background: 'rgba(217, 119, 6, 0.08)' } : undefined}>
              <td>{r.stopOrder}</td>
              <td>{r.stopNameRo}</td>
              <td>{r.operatorTotal ?? '—'}</td>
              <td>{r.auditTotal ?? '—'}</td>
              <td style={{ color: r.deltaTotal === 0 ? 'var(--text-muted)' : 'var(--warning)', fontWeight: r.deltaTotal === 0 ? 400 : 600 }}>
                {r.deltaTotal != null ? (r.deltaTotal >= 0 ? `+${r.deltaTotal}` : r.deltaTotal) : '—'}
              </td>
              <td>{r.operatorAlighted ?? '—'}</td>
              <td>{r.auditAlighted ?? '—'}</td>
              <td>{r.operatorShort ?? '—'}</td>
              <td>{r.auditShort ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
