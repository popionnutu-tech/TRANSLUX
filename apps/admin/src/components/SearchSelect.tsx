'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

export interface SSOption { id: number; label: string }

// Aceeași referință de fiecare dată, ca `setAsyncResults(EMPTY)` să nu producă o randare inutilă:
// un `[]` proaspăt e mereu „alt" array pentru React.
const EMPTY: SSOption[] = [];
Object.freeze(EMPTY);

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
  autoFocus?: boolean; // focus pe input la montare (ex. rândul nou auto-adăugat la inventar/prihod)
  onFocused?: () => void; // s-a luat focusul — apelantul poate uita care rând era „nou"
}

export default function SearchSelect({ value, onSelect, placeholder = '— caută —', maxShown = 50, options, searchFn, selectedLabel, minChars = 1, autoFocus = false, onFocused }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const [asyncResults, setAsyncResults] = useState<SSOption[]>(EMPTY);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus la montare doar dacă e cerut (rând nou auto-adăugat) → pune cursorul gata de scanat/tastat.
  // Focus-ul declanșează onFocus → lista se deschide („Scrie ca să cauți…"), ceea ce e dorit pentru scanare rapidă.
  //
  // Efectul se declanșează la montare cu `autoFocus` deja `true` (calea obișnuită: rândul nou se montează
  // marcat) și pe frontul crescător al lui `autoFocus`. `onFocused` stă într-un ref, nu în dependențe:
  // apelanții îl scriu inline, deci identitatea lui s-ar schimba la fiecare randare, iar efectul ar refura
  // cursorul din câmpul în care omul tocmai a trecut.
  const onFocusedRef = useRef(onFocused);
  useEffect(() => { onFocusedRef.current = onFocused; });
  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    onFocusedRef.current?.();
  }, [autoFocus]);

  const isAsync = !!searchFn;
  const currentLabel = useMemo(
    () => (isAsync ? (selectedLabel || '') : (options?.find((o) => o.id === value)?.label || '')),
    [isAsync, selectedLabel, options, value],
  );

  const q = query.trim().toLowerCase();
  // Filtrul local se calcula la FIECARE randare a FIECĂRUI rând, chiar cu lista închisă — două treceri peste
  // catalog plus un `toLowerCase()` alocat per piesă. La magazin `options` are până la o mie de piese, iar un
  // bon poate avea zeci de poziții: zeci de mii de alocări de string per pas de randare, degeaba, fiindcă
  // rezultatul nu se folosește când dropdown-ul e închis — adică aproape mereu.
  const localResults = useMemo(
    () => (!open || isAsync ? EMPTY : (options || []).filter((o) => o.label.toLowerCase().includes(q)).slice(0, maxShown)),
    [open, isAsync, options, q, maxShown],
  );
  const results = isAsync ? asyncResults : localResults;

  // Căutare server-side, debounce ~250ms (doar în modul async, cât e deschis).
  // Flag `alive`: un răspuns întârziat de la o căutare veche NU mai suprascrie rezultatul curent (race la tastare rapidă).
  useEffect(() => {
    if (!isAsync || !open) return;
    const term = query.trim();
    if (term.length < minChars) { setAsyncResults(EMPTY); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const r = await searchFn!(term); if (alive) setAsyncResults(r.slice(0, maxShown)); }
      catch { if (alive) setAsyncResults(EMPTY); }
      finally { if (alive) setLoading(false); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [query, open, isAsync, minChars, maxShown]);

  useEffect(() => { setHi(0); }, [query, open, asyncResults.length]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function pick(o: SSOption) { onSelect(o); setQuery(''); setOpen(false); setAsyncResults(EMPTY); }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        style={{ width: '100%', paddingRight: value !== '' ? 26 : undefined }}
        value={open ? query : currentLabel}
        placeholder={currentLabel || placeholder}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
        onKeyDown={(e) => {
          // `Math.max(0, …)`: cu lista închisă `results` e goală, iar `results.length - 1` dă −1 — adică
          // niciun rând evidențiat și Enter care nu alege nimic. Prima săgeată în jos trebuie să deschidă
          // lista cu primul rând marcat, nu să lase câmpul într-o stare din care doar a doua săgeată iese.
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.max(0, Math.min(h + 1, results.length - 1))); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (results[hi]) pick(results[hi]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
      />
      {value !== '' && (
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
