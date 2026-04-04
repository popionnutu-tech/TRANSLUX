'use client';

import { useState, useRef, useEffect } from 'react';
import { getEligibleBoardingStops, type ShortPassengerGroup } from './calculation';
import type { RouteStop } from './actions';

interface Props {
  exitStopOrder: number;
  exitStopNameRo: string;
  exitKm: number;
  totalShort: number;
  allStops: RouteStop[];
  maxKm: number;
  onConfirm: (groups: ShortPassengerGroup[]) => void;
  onCancel: () => void;
}

export default function ShortPassengerPopup({
  exitStopOrder, exitStopNameRo, exitKm, totalShort, allStops, maxKm, onConfirm, onCancel,
}: Props) {
  const eligible = getEligibleBoardingStops(
    allStops.map(s => ({ stopOrder: s.stopOrder, stopNameRo: s.nameRo, kmFromStart: s.kmFromStart })),
    exitStopOrder,
    exitKm,
    maxKm,
  );

  const [counts, setCounts] = useState<Record<number, string>>({});
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const distributed = Object.values(counts).reduce((sum, v) => sum + (parseInt(v) || 0), 0);
  const remaining = totalShort - distributed;

  function handleConfirm() {
    const groups: ShortPassengerGroup[] = [];
    for (const stop of eligible) {
      const count = parseInt(counts[stop.stopOrder] || '0') || 0;
      if (count > 0) {
        groups.push({
          boardedStopOrder: stop.stopOrder,
          boardedStopNameRo: stop.stopNameRo,
          kmDistance: stop.kmDistance,
          passengerCount: count,
        });
      }
    }
    onConfirm(groups);
  }

  function handleKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (remaining === 0) {
        handleConfirm();
      }
    }
  }

  if (eligible.length === 0) {
    // Нет подходящих остановок ≤ 50 км — автоматически закрываем
    onCancel();
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        className="card"
        style={{ padding: 20, minWidth: 340, maxWidth: 450, background: '#fff' }}
        onClick={e => e.stopPropagation()}
      >
        <h4 style={{ marginBottom: 4 }}>
          Scurți: {totalShort} pasageri
        </h4>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Au ieșit la <strong>{exitStopNameRo}</strong>. De unde s-au urcat?
        </p>

        <table style={{ width: '100%', fontSize: 13 }}>
          <tbody>
            {eligible.map((stop, idx) => (
              <tr key={stop.stopOrder}>
                <td style={{ padding: '4px 8px' }}>{stop.stopNameRo}</td>
                <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>{Math.round(stop.kmDistance)} km</td>
                <td style={{ padding: '4px 0', width: 60 }}>
                  <input
                    ref={idx === 0 ? firstRef : undefined}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={counts[stop.stopOrder] || ''}
                    onChange={e => setCounts({ ...counts, [stop.stopOrder]: e.target.value.replace(/\D/g, '') })}
                    onKeyDown={e => handleKeyDown(e, idx)}
                    placeholder="0"
                    style={{ width: 55, textAlign: 'center' }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: remaining > 0 ? 'var(--warning)' : 'var(--success)' }}>
            Rămas: {remaining}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={onCancel}>Anulează</button>
            <button
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={remaining !== 0}
            >
              Confirmă
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
