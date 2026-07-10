'use client';

import { useState, useEffect } from 'react';
import { loadPartLocation, savePartLocation } from '@/app/(dashboard)/piese/part-actions';

// Editează locația unei piese ÎNTR-UN depozit (piese_part_locations, o locație per piesă+depozit).
// Alimentează Harta („unde se află piesa"). Gol = fără locație. Per depozit, deci are selector de depozit.
export default function PartLocationEditor({ partId, warehouses }: { partId: number; warehouses: { id: number; label: string }[] }) {
  const [wid, setWid] = useState<number>(warehouses[0]?.id || 0);
  const [label, setLabel] = useState('');
  const [minQty, setMinQty] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // La schimbarea piesei/depozitului, încarcă locația curentă (cu gardă `alive` contra race-urilor).
  useEffect(() => {
    if (!wid || !partId) return;
    let alive = true;
    setLoading(true); setMsg(''); setError('');
    loadPartLocation(partId, wid)
      .then((loc) => { if (alive) { setLabel(loc?.location_label || ''); setMinQty(loc?.min_qty != null ? String(loc.min_qty) : ''); } })
      .catch(() => { if (alive) { setLabel(''); setMinQty(''); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [partId, wid]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');
    try {
      await savePartLocation(partId, wid, { location_label: label, min_qty: minQty });
      setMsg('✓ Locație salvată');
    } catch (err: any) { setError(err?.message || 'Eroare la salvare'); }
    finally { setSaving(false); }
  }

  if (warehouses.length === 0) return null;

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--pline, #eee)', paddingTop: 14 }}>
      <h3 style={{ margin: '0 0 4px' }}>Locație în depozit</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Cod SECȚIE-RAFT-POLIȚĂ (ex: A-05-3) — apare pe Hartă. Gol = fără locație.</p>
      <form onSubmit={save} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
          <label>Depozit</label>
          <select value={wid} onChange={(e) => setWid(Number(e.target.value))}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
          <label>Locație</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A-05-3" disabled={loading} />
        </div>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 110 }}>
          <label>Stoc minim</label>
          <input type="number" min={0} step="1" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="0" disabled={loading} />
        </div>
        <button type="submit" className="btn" disabled={saving || loading}>{saving ? 'Se salvează…' : 'Salvează locația'}</button>
        {msg && <span style={{ color: 'var(--success, #16a34a)', fontSize: 14 }}>{msg}</span>}
        {error && <span style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</span>}
      </form>
    </div>
  );
}
