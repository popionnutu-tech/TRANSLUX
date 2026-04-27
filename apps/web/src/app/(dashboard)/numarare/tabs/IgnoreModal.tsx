'use client';

import { useState } from 'react';

interface Props {
  open: boolean;
  receiptNr: string;
  ziua: string;
  onConfirm: (note: string) => Promise<void>;
  onClose: () => void;
}

export default function IgnoreModal({ open, receiptNr, ziua, onConfirm, onClose }: Props) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return null;

  async function handleConfirm() {
    if (!note.trim()) { setErr('Nota e obligatorie'); return; }
    setBusy(true);
    setErr('');
    try {
      await onConfirm(note.trim());
      setNote('');
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
      <div className="card" style={{ background: 'var(--bg)', padding: 20, minWidth: 420, maxWidth: 520 }}>
        <h3 style={{ margin: '0 0 12px 0' }}>Marchează ca eroare casă</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: '0 0 12px 0' }}>
          Foaia <strong style={{ fontFamily: 'var(--font-mono)' }}>{receiptNr}</strong> · ziua <strong>{ziua}</strong> va fi <strong>exclusă</strong> din raport.
        </p>
        <textarea
          placeholder="Motiv (obligatoriu) — ex: 'voucher test', 'eroare casa pe X.YZ'"
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          className="form-control"
          style={{ width: '100%', marginBottom: 12, resize: 'vertical' }}
          autoFocus
        />
        {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="btn" disabled={busy}>Anulează</button>
          <button type="button" onClick={handleConfirm} className="btn" disabled={busy} style={{ background: 'var(--danger)', color: 'white' }}>
            {busy ? 'Se salvează...' : 'Marchează ignorat'}
          </button>
        </div>
      </div>
    </div>
  );
}
