'use client';

import { useEffect, useMemo, useState } from 'react';
import { C, api, type PickerVehicle } from './ui';

// Bottom-sheet de alegere a mașinii — un tap = selecție. Ordinea: default-ul
// (șablon) primul, apoi mașinile direcției, apoi restul; căutare după număr.

export default function VehiclePicker({
  direction, defaultVehicleId, currentVehicleId, onPick, onClose,
}: {
  direction: string;
  defaultVehicleId?: string | null;
  currentVehicleId?: string | null;
  onPick: (vehicleId: string | null) => void;
  onClose: () => void;
}) {
  const [vehicles, setVehicles] = useState<PickerVehicle[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api(`/vehicule?dir=${encodeURIComponent(direction)}`)
      .then(async (r) => setVehicles(r.ok ? (await r.json()).vehicles : []))
      .catch(() => setVehicles([]));
  }, [direction]);

  const list = useMemo(() => {
    if (!vehicles) return [];
    const needle = q.trim().toUpperCase();
    const filtered = needle ? vehicles.filter((v) => v.plate.includes(needle)) : vehicles;
    // default-ul din șablon primul
    return [...filtered].sort((a, b) =>
      Number(b.id === defaultVehicleId) - Number(a.id === defaultVehicleId));
  }, [vehicles, q, defaultVehicleId]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg, width: '100%', maxHeight: '75vh', borderRadius: '16px 16px 0 0',
          padding: '12px 14px 24px', overflowY: 'auto',
        }}
      >
        <input
          autoFocus={false}
          placeholder="Caută numărul…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 16,
            border: `1px solid ${C.border}`, background: C.panel, marginBottom: 10, boxSizing: 'border-box',
          }}
        />
        {!vehicles && <div style={{ color: C.muted, padding: 10 }}>Se încarcă…</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {currentVehicleId && (
            <button
              onClick={() => onPick(null)}
              style={{
                padding: '10px 14px', borderRadius: 10, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${C.border}`, background: C.panel2, color: C.bad,
              }}
            >✕ scoate mașina</button>
          )}
          {list.map((v) => {
            const isDefault = v.id === defaultVehicleId;
            const isCurrent = v.id === currentVehicleId;
            return (
              <button
                key={v.id}
                onClick={() => onPick(v.id)}
                style={{
                  padding: '10px 14px', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'ui-monospace, monospace',
                  border: `2px solid ${isCurrent ? C.accent : isDefault ? C.ok : v.inDirection ? C.border : '#f0eaea'}`,
                  background: isCurrent ? C.accent : C.panel,
                  color: isCurrent ? '#fff' : v.inDirection ? C.text : C.muted,
                }}
              >
                {v.plate}{isDefault ? ' ★' : ''}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
