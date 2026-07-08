'use client';

import { useState, useRef, useEffect } from 'react';

export interface SSOption { id: number; label: string }

// Combobox cu căutare la tastare. Două moduri:
//  • local  — se dă `options` (listă mică deja încărcată: furnizori, clienți); filtrează în memorie după label.
//  • async  — se dă `searchFn` (caută pe server, debounce) + `selectedLabel` (eticheta valorii curente, ca s-o afișeze).
// Scop: înlocuiește <select>-urile mari (mii de piese) cu „scrii câteva litere → apar doar potrivirile".
interface Props {
  value: number | '';
  onSelect: (opt: SSOption | null) => void;
  placeholder?: string;
  maxShown?: number;
  options?: SSOption[];
  searchFn?: (q: string) => Promise<SSOption[]>;
  selectedLabel?: string;
  minChars?: number;
}

export default function SearchSelect({ value, onSelect, placeholder = '— caută —', maxShown = 50, options, searchFn, selectedLabel, minChars = 1 }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const [asyncResults, setAsyncResults] = useState<SSOption[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const isAsync = !!searchFn;
  const currentLabel = isAsync ? (selectedLabel || '') : (options?.find((o) => o.id === value)?.label || '');

  const q = query.trim().toLowerCase();
  const localResults = (options || []).filter((o) => o.label.toLowerCase().includes(q)).slice(0, maxShown);
  const results = isAsync ? asyncResults : localResults;

  // Căutare server-side, debounce ~250ms (doar în modul async, cât e deschis).
  // Flag `alive`: un răspuns întârziat de la o căutare veche NU mai suprascrie rezultatul curent (race la tastare rapidă).
  useEffect(() => {
    if (!isAsync || !open) return;
    const term = query.trim();
    if (term.length < minChars) { setAsyncResults([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const r = await searchFn!(term); if (alive) setAsyncResults(r.slice(0, maxShown)); }
      catch { if (alive) setAsyncResults([]); }
      finally { if (alive) setLoading(false); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [query, open, isAsync, minChars, maxShown]);

  useEffect(() => { setHi(0); }, [query, asyncResults.length]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function pick(o: SSOption) { onSelect(o); setQuery(''); setOpen(false); setAsyncResults([]); }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        style={{ width: '100%', paddingRight: value !== '' ? 26 : undefined }}
        value={open ? query : currentLabel}
        placeholder={currentLabel || placeholder}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (results[hi]) pick(results[hi]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
      />
      {value !== '' && !open && (
        <button type="button" onMouseDown={(e) => { e.preventDefault(); onSelect(null); setQuery(''); }} aria-label="Șterge"
          style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#999', fontSize: 16, lineHeight: 1, padding: 4 }}>×</button>
      )}
      {open && (
        <div style={{ position: 'absolute', zIndex: 40, top: 'calc(100% + 2px)', left: 0, right: 0, maxHeight: 260, overflowY: 'auto', background: '#fff', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 6px 20px rgba(0,0,0,0.12)' }}>
          {loading ? (
            <div style={{ padding: '10px 12px', color: '#999', fontSize: 13 }}>Se caută…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: '10px 12px', color: '#999', fontSize: 13 }}>{isAsync && query.trim().length < minChars ? 'Scrie ca să cauți…' : 'Nimic găsit'}</div>
          ) : results.map((o, idx) => (
            <div key={o.id} onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setHi(idx)}
              style={{ padding: '8px 12px', cursor: 'pointer', background: idx === hi ? 'rgba(155,27,48,0.08)' : 'transparent', fontSize: 13, borderBottom: '1px solid #f2f2f2' }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
