'use client';

import { useState } from 'react';

export interface DirOption { value: string; label: string; }

// Мульти-выбор направлений (interurban/suburban/узины) чипами. Сохраняет на каждый тап.
export default function DirectionChips({ value, options, onSave }: {
  value: string[];
  options: DirOption[];
  onSave: (dirs: string[]) => Promise<void>;
}) {
  const [sel, setSel] = useState<string[]>(value ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function toggle(v: string) {
    const next = sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v];
    const prev = sel;
    setSel(next); setBusy(true); setErr(false);
    try {
      await onSave(next);
    } catch {
      setSel(prev); setErr(true); // откат при ошибке
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', opacity: busy ? 0.55 : 1 }}>
      {options.map((o) => {
        const on = sel.includes(o.value);
        return (
          <button key={o.value} type="button" onClick={() => toggle(o.value)} disabled={busy}
            style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
              border: `1px solid ${on ? '#9B1B30' : 'var(--border, #d9d9d9)'}`,
              background: on ? '#9B1B30' : 'transparent',
              color: on ? '#fff' : 'var(--text-muted, #777)',
              fontWeight: on ? 700 : 400,
            }}>
            {o.label}
          </button>
        );
      })}
      {err && <span style={{ color: 'var(--danger, #c0392b)', fontSize: 11 }}>eroare</span>}
    </div>
  );
}
