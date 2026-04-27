'use client';

import { useState, useEffect } from 'react';
import type { DriverOption, DuplicateCandidate } from './incasareActions';
import { getActiveDriversForPicker } from './incasareActions';

interface Props {
  open: boolean;
  receiptNr: string;
  ziua: string;
  candidates?: DuplicateCandidate[] | null;
  onConfirm: (driverId: string, note: string | null) => Promise<void>;
  onClose: () => void;
}

export default function AssignDriverModal({ open, receiptNr, ziua, candidates, onConfirm, onClose }: Props) {
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open && drivers.length === 0) {
      getActiveDriversForPicker().then(setDrivers);
    }
  }, [open, drivers.length]);

  const filtered = drivers.filter(d =>
    d.full_name.toLowerCase().includes(filter.toLowerCase())
  );

  if (!open) return null;

  async function handleConfirm() {
    if (!selectedId) { setErr('Alege un șofer'); return; }
    setBusy(true);
    setErr('');
    try {
      await onConfirm(selectedId, note.trim() || null);
      setSelectedId('');
      setNote('');
      setFilter('');
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div className="card" style={{ background: 'var(--bg)', padding: 20, minWidth: 480, maxWidth: 600, maxHeight: '85vh', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 12px 0' }}>Asignează la șofer</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: '0 0 12px 0' }}>
          Foaia <strong style={{ fontFamily: 'var(--font-mono)' }}>{receiptNr}</strong> · ziua <strong>{ziua}</strong>
        </p>

        {candidates && candidates.length > 0 && (
          <div style={{
            background: 'var(--warning-dim)', padding: 12, borderRadius: 6, marginBottom: 12,
            border: '1px solid var(--warning)',
          }}>
            <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 8px 0' }}>
              ⚠ Foaia apare deja la {candidates.length} șoferi în /grafic. Alege rapid:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {candidates.map(c => (
                <button
                  key={c.driver_id}
                  type="button"
                  onClick={() => setSelectedId(c.driver_id)}
                  className="btn btn-sm"
                  style={{
                    textAlign: 'left',
                    background: selectedId === c.driver_id ? 'var(--success-dim)' : 'transparent',
                    border: '1px solid ' + (selectedId === c.driver_id ? 'var(--success)' : 'var(--border)'),
                  }}
                >
                  {c.driver_name || '—'} <span className="text-muted" style={{ fontSize: 11 }}>({c.ziua})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <input
          type="text"
          placeholder="Caută șofer..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="form-control"
          style={{ width: '100%', marginBottom: 8 }}
        />

        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          size={8}
          className="form-control"
          style={{ width: '100%', marginBottom: 12 }}
        >
          {filtered.map(d => (
            <option key={d.id} value={d.id}>{d.full_name}</option>
          ))}
        </select>

        <textarea
          placeholder="Notă (opțional) — ex: 'recunoscut după sumă și rută'"
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          className="form-control"
          style={{ width: '100%', marginBottom: 12, resize: 'vertical' }}
        />

        {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="btn" disabled={busy}>Anulează</button>
          <button type="button" onClick={handleConfirm} className="btn btn-primary" disabled={busy || !selectedId}>
            {busy ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  );
}
