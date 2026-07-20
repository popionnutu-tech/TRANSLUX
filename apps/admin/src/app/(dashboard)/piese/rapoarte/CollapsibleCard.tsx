'use client';

import { useEffect, useState, type ReactNode } from 'react';

// Card pliabil pentru Rapoarte: antet clicabil + buton „−/+" care restrânge tabelul, ca ecranul să fie compact.
// Reține starea (deschis/închis) în localStorage per `storageKey`, ca alegerea să se păstreze între vizite.
export default function CollapsibleCard({ title, storageKey, defaultOpen = true, children }: {
  title: ReactNode; storageKey?: string; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Citim preferința salvată DUPĂ montare (evită neconcordanța de hidratare server↔client).
  useEffect(() => {
    if (!storageKey) return;
    try {
      const v = localStorage.getItem(`rap-collapse:${storageKey}`);
      if (v !== null) setOpen(v === '1');
    } catch { /* localStorage indisponibil — rămâne pe default */ }
  }, [storageKey]);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (storageKey) { try { localStorage.setItem(`rap-collapse:${storageKey}`, next ? '1' : '0'); } catch { /* ignoră */ } }
      return next;
    });
  }

  return (
    <div className="card">
      <div
        onClick={toggle}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
        title={open ? 'Restrânge' : 'Extinde'}
      >
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button
          type="button"
          className="btn btn-outline"
          style={{ padding: '2px 12px', lineHeight: 1.4, fontWeight: 700 }}
          aria-expanded={open}
          aria-label={open ? 'Restrânge tabelul' : 'Extinde tabelul'}
        >
          {open ? '−' : '+'}
        </button>
      </div>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}
