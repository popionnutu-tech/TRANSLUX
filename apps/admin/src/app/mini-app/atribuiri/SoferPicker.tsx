'use client';

import { useEffect, useMemo, useState } from 'react';
import { C, api, type PickerSofer } from './ui';

// Bottom-sheet de alegere a șoferului — întâi cei relevanți direcției, apoi restul.

export default function SoferPicker({
  direction, currentDriverId, allowRemove = true, onPick, onClose,
}: {
  direction: string;
  currentDriverId?: string | null;
  /** false pe cursele din orar — graficul cere mereu un șofer (doar înlocuire) */
  allowRemove?: boolean;
  onPick: (driverId: string | null) => void;
  onClose: () => void;
}) {
  const [soferi, setSoferi] = useState<PickerSofer[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api(`/soferi?dir=${encodeURIComponent(direction)}`)
      .then(async (r) => setSoferi(r.ok ? (await r.json()).soferi : []))
      .catch(() => setSoferi([]));
  }, [direction]);

  const list = useMemo(() => {
    if (!soferi) return [];
    const needle = q.trim().toLowerCase();
    return needle ? soferi.filter((s) => s.name.toLowerCase().includes(needle)) : soferi;
  }, [soferi, q]);

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
          placeholder="Caută șoferul…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 16,
            border: `1px solid ${C.border}`, background: C.panel, marginBottom: 10, boxSizing: 'border-box',
          }}
        />
        {!soferi && <div style={{ color: C.muted, padding: 10 }}>Se încarcă…</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {currentDriverId && allowRemove && (
            <button
              onClick={() => onPick(null)}
              style={{
                padding: '10px 14px', borderRadius: 10, fontSize: 15, cursor: 'pointer', textAlign: 'left',
                border: `1px solid ${C.border}`, background: C.panel2, color: C.bad,
              }}
            >✕ scoate șoferul</button>
          )}
          {list.map((s) => {
            const isCurrent = s.id === currentDriverId;
            return (
              <button
                key={s.id}
                onClick={() => onPick(s.id)}
                style={{
                  padding: '10px 14px', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${isCurrent ? C.accent : s.inDirection ? C.border : '#f0eaea'}`,
                  background: isCurrent ? C.accent : C.panel,
                  color: isCurrent ? '#fff' : s.inDirection ? C.text : C.muted,
                }}
              >{s.name}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
