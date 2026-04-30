'use client';

import type { Anomaly } from './incasareActions';

interface Props {
  anomaly: Anomaly;
  canEdit: boolean;
  onAssignClick: () => void;
  onIgnoreClick: () => void;
}

const CATEGORY_META: Record<Anomaly['category'], { label: string; short: string; color: string; bg: string }> = {
  NO_FOAIE:        { label: 'Foaie absentă în /grafic', short: 'lipsă /grafic', color: 'var(--danger)',  bg: 'var(--danger-dim)' },
  DUPLICATE_FOAIE: { label: 'Foaie duplicată',           short: 'duplicat',      color: 'var(--warning)', bg: 'var(--warning-dim)' },
  INVALID_FORMAT:  { label: 'Format atipic',             short: 'format',        color: '#9b27b0',        bg: 'rgba(155,39,176,0.1)' },
};

export default function AnomalyCard({ anomaly, canEdit, onAssignClick, onIgnoreClick }: Props) {
  const meta = CATEGORY_META[anomaly.category];
  const b = anomaly.breakdown;

  return (
    <div style={{
      padding: '6px 10px',
      borderLeft: `3px solid ${meta.color}`,
      background: meta.bg,
      borderRadius: 4,
      marginBottom: 3,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 12,
      flexWrap: 'wrap',
    }}>
      {/* Foaie + status + dată */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 180 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700 }}>{anomaly.receipt_nr}</span>
        <span style={{ color: meta.color, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>{meta.short}</span>
        <span className="text-muted" style={{ fontSize: 11 }}>{anomaly.ziua.slice(5)}</span>
      </div>

      {/* Cifre — doar valori non-zero */}
      <div style={{ flex: 1, display: 'flex', gap: 10, fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
        <span><span className="text-muted">Inc</span> <strong>{Math.round(b.numerar)}</strong></span>
        {b.ligotniki0_suma > 0 && <span><span className="text-muted">Lg</span> <strong>{Math.round(b.ligotniki0_suma)}</strong></span>}
        {b.diagrama > 0 && <span><span className="text-muted">Dg</span> <strong>{Math.round(b.diagrama)}</strong></span>}
        {b.ligotniki_vokzal_suma > 0 && <span><span className="text-muted">Vk</span> <strong>{Math.round(b.ligotniki_vokzal_suma)}</strong></span>}
        {b.dt_suma > 0 && <span><span className="text-muted">DT</span> <strong>{Math.round(b.dt_suma)}</strong></span>}
        {b.dop_rashodi > 0 && <span><span className="text-muted">Rs</span> <strong>{Math.round(b.dop_rashodi)}</strong></span>}
        {b.fiscal_nr && <span className="text-muted" style={{ fontSize: 11 }}>#{b.fiscal_nr}</span>}
        {b.comment && (
          <span style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontFamily: 'inherit' }}>«{b.comment}»</span>
        )}
      </div>

      {/* Butoane */}
      {canEdit && (
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={onAssignClick}
            className="btn btn-primary"
            style={{ padding: '3px 10px', fontSize: 11, height: 'auto', lineHeight: 1.4 }}
          >
            Asignează
          </button>
          <button
            type="button"
            onClick={onIgnoreClick}
            className="btn"
            style={{ padding: '3px 10px', fontSize: 11, height: 'auto', lineHeight: 1.4, background: 'var(--danger)', color: 'white' }}
          >
            Ignoră
          </button>
        </div>
      )}
    </div>
  );
}
