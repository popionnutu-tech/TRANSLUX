'use client';

import type { Anomaly } from './incasareActions';

interface Props {
  anomaly: Anomaly;
  canEdit: boolean;
  onAssignClick: () => void;
  onIgnoreClick: () => void;
}

const CATEGORY_META: Record<Anomaly['category'], { label: string; color: string; bg: string }> = {
  NO_FOAIE: { label: 'Foaie absentă în /grafic', color: 'var(--danger)', bg: 'var(--danger-dim)' },
  DUPLICATE_FOAIE: { label: 'Foaie duplicată', color: 'var(--warning)', bg: 'var(--warning-dim)' },
  INVALID_FORMAT: { label: 'Format atipic', color: '#9b27b0', bg: 'rgba(155,39,176,0.1)' },
};

export default function AnomalyCard({ anomaly, canEdit, onAssignClick, onIgnoreClick }: Props) {
  const meta = CATEGORY_META[anomaly.category];
  const b = anomaly.breakdown;

  return (
    <div className="card" style={{
      padding: 14,
      borderLeft: `4px solid ${meta.color}`,
      background: meta.bg,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700 }}>{anomaly.receipt_nr}</span>
            <span style={{ color: meta.color, fontSize: 12, fontWeight: 600 }}>{meta.label}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>· {anomaly.ziua}</span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 6, fontSize: 12, marginTop: 6,
          }}>
            <div><span className="text-muted">Numerar:</span> <strong>{Math.round(b.numerar)} lei</strong></div>
            <div><span className="text-muted">Card:</span> <strong>{Math.round(b.card)} lei</strong></div>
            <div><span className="text-muted">Lgotnici:</span> <strong>{b.lgotnici_count} ({Math.round(b.lgotnici_suma)} lei)</strong></div>
            <div><span className="text-muted">Dop. rashodi:</span> <strong>{Math.round(b.dop_rashodi)} lei</strong></div>
            {b.fiscal_nr && <div><span className="text-muted">Fiscal:</span> <span style={{ fontFamily: 'var(--font-mono)' }}>{b.fiscal_nr}</span></div>}
            {b.comment && <div style={{ gridColumn: '1 / -1' }}><span className="text-muted">Comentariu:</span> <em>{b.comment}</em></div>}
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
            <button type="button" onClick={onAssignClick} className="btn btn-primary btn-sm">
              Asignează la șofer
            </button>
            <button type="button" onClick={onIgnoreClick} className="btn btn-sm" style={{ background: 'var(--danger)', color: 'white' }}>
              Marchează ignorat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
