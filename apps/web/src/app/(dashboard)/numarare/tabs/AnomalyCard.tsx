'use client';

import type { Anomaly } from './incasareActions';

interface Props {
  anomaly: Anomaly;
  canEdit: boolean;
  onAssignClick: () => void;
  onIgnoreClick: () => void;
}

const CATEGORY_META: Record<Anomaly['category'], { short: string; color: string; bg: string }> = {
  NO_FOAIE:        { short: 'lipsă /grafic', color: 'var(--danger)',  bg: 'var(--danger-dim)' },
  DUPLICATE_FOAIE: { short: 'duplicat',      color: 'var(--warning)', bg: 'var(--warning-dim)' },
  INVALID_FORMAT:  { short: 'format',        color: '#9b27b0',        bg: 'rgba(155,39,176,0.1)' },
};

// Grid pe care îl folosesc atât header-ul, cât și fiecare rând.
export const ANOMALY_GRID =
  '92px 100px 48px 60px 48px 56px 44px 44px 44px 78px minmax(120px, 1fr) auto';

export function AnomalyHeader({ canEdit }: { canEdit: boolean }) {
  const cell = (label: string, align: 'left' | 'right' = 'left') => (
    <div className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: align }}>
      {label}
    </div>
  );
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: ANOMALY_GRID,
      gap: 8,
      padding: '4px 10px',
      borderBottom: '1px solid var(--border)',
      marginBottom: 4,
    }}>
      {cell('Foaie')}
      {cell('Status')}
      {cell('Data')}
      {cell('Inc', 'right')}
      {cell('Lg', 'right')}
      {cell('Dg', 'right')}
      {cell('Vk', 'right')}
      {cell('DT', 'right')}
      {cell('Rs', 'right')}
      {cell('Fiscal')}
      {cell('Comentariu')}
      {canEdit ? cell('') : null}
    </div>
  );
}

function num(v: number) {
  if (!v || v <= 0) return <span className="text-muted">—</span>;
  return <strong>{Math.round(v)}</strong>;
}

function shortDate(iso: string) {
  // "2026-04-25" -> "04-25"
  return iso.length >= 10 ? iso.slice(5, 10) : iso;
}

function lastName(full: string | null): string {
  if (!full) return '—';
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] || full;
}

export default function AnomalyCard({ anomaly, canEdit, onAssignClick, onIgnoreClick }: Props) {
  const meta = CATEGORY_META[anomaly.category];
  const b = anomaly.breakdown;
  // Filtrăm intrările kiosk de pe ziua curentă a alertei (sunt redundante: e exact alerta însăși)
  const allHistory = anomaly.foaie_history || [];
  const history = allHistory.filter(h => !(h.source === 'kiosk' && h.ziua === anomaly.ziua));
  const showHistory = history.length > 0;

  return (
    <div style={{ marginBottom: 2, borderLeft: `3px solid ${meta.color}`, background: meta.bg, borderRadius: 3 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: ANOMALY_GRID,
        gap: 8,
        alignItems: 'center',
        padding: '5px 10px',
        fontSize: 12,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>{anomaly.receipt_nr}</span>
        <span style={{ color: meta.color, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>{meta.short}</span>
        <span className="text-muted" style={{ fontSize: 11 }}>{shortDate(anomaly.ziua)}</span>

        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{num(b.numerar)}</span>
        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{num(b.ligotniki0_suma)}</span>
        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{num(b.diagrama)}</span>
        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{num(b.ligotniki_vokzal_suma)}</span>
        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{num(b.dt_suma)}</span>
        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{num(b.dop_rashodi)}</span>

        <span className="text-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {b.fiscal_nr ? `#${b.fiscal_nr}` : '—'}
        </span>

        <span style={{
          fontStyle: 'italic',
          color: 'var(--text-muted)',
          fontSize: 11,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {b.comment ? `«${b.comment}»` : ''}
        </span>

        {canEdit ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={onAssignClick}
              className="btn btn-primary"
              style={{ padding: '3px 8px', fontSize: 11, height: 'auto', lineHeight: 1.4 }}
            >
              Asignează
            </button>
            <button
              type="button"
              onClick={onIgnoreClick}
              className="btn"
              style={{ padding: '3px 8px', fontSize: 11, height: 'auto', lineHeight: 1.4, background: 'var(--danger)', color: 'white' }}
            >
              Ignoră
            </button>
          </div>
        ) : null}
      </div>

      {/* Sub-rândul de context: istoricul complet al foii (grafic + override + kiosk) */}
      {showHistory && (
        <div style={{
          padding: '2px 10px 4px 28px',
          fontSize: 11,
          color: 'var(--text-muted)',
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'baseline',
        }}>
          <span style={{ textTransform: 'uppercase', letterSpacing: 0.4, fontSize: 10, opacity: 0.7 }}>
            ↳ istoric:
          </span>
          {history.map((h, idx) => {
            const isSameDay = h.ziua === anomaly.ziua;
            const sourceColor =
              h.source === 'grafic'   ? 'var(--text)' :
              h.source === 'override' ? '#9b27b0' :
                                        'var(--text-muted)';
            const driverLabel = h.driver_name ? lastName(h.driver_name) : '?';
            return (
              <span key={`${h.source}-${h.ziua}-${h.driver_id}-${idx}`}
                    style={{ fontFamily: 'var(--font-mono)' }}>
                <strong style={{ color: isSameDay ? 'var(--warning)' : sourceColor }}>
                  {shortDate(h.ziua)}
                </strong>{' '}
                <span style={{ fontFamily: 'inherit', color: sourceColor }}>{driverLabel}</span>
                <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 3, textTransform: 'uppercase' }}>
                  {h.source === 'grafic' ? '' : `· ${h.source}`}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
