'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getCasierGraficCandidates,
  type GraficFoaieCandidate,
} from './incasareActions';
import { normFoaie } from '@/lib/norm-foaie';

interface Props {
  /** Ziua documentului de casier — lista pornește de la ea. */
  ziua: string;
  /** Foile deja prezente în documentul Numerar (normalizate) — blocate în listă. */
  foiInDocument: Set<string>;
  /** Cursele deja alese, salvate sau nu — DB-ul nu le știe pe cele nesalvate. */
  assignmentsInDocument: Set<string>;
  onClose: () => void;
  onAdd: (picked: GraficFoaieCandidate[]) => void;
}

const fontFamily = '"Segoe UI", Tahoma, Arial, sans-serif';

function dmy(iso: string): string {
  return iso ? iso.split('-').reverse().join('.') : '';
}

/** Prima oră de plecare din nord — time_nord poate fi interval «HH:MM - HH:MM». */
function departure(timeNord: string | null): string {
  return timeNord?.split(' - ')[0]?.trim() || '';
}

export default function GraficFoiPicker({ ziua, foiInDocument, assignmentsInDocument, onClose, onAdd }: Props) {
  const [date, setDate] = useState(ziua);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<GraficFoaieCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Căutarea se trimite cu întârziere: altfel fiecare tastă = un RPC. Un singur caracter
  // e ignorat oricum de funcția din DB, deci nici nu-l trimitem.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const q = search.trim();
    // Un singur caracter e ignorat oricum de funcția din DB: îl tratăm ca «fără căutare»,
    // ca lista să revină la ziua curentă în loc să rămână blocată pe căutarea anterioară.
    const t = setTimeout(() => setDebouncedSearch(q.length === 1 ? '' : q), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Răspunsurile întârziate ale unei căutări anulate n-au voie să suprascrie ultima listă.
  const reqSeq = useRef(0);
  useEffect(() => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError('');
    getCasierGraficCandidates(date, debouncedSearch)
      .then(res => {
        if (seq !== reqSeq.current) return;
        if (res.error) { setError(res.error); setItems([]); }
        else setItems(res.data || []);
      })
      .finally(() => { if (seq === reqSeq.current) setLoading(false); });
  }, [date, debouncedSearch]);

  // Schimbarea zilei/căutării schimbă lista → bifele vechi n-ar mai avea rânduri.
  useEffect(() => { setChecked(new Set()); }, [date, debouncedSearch]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Deja în document = marcat de DB (rând manual salvat, în orice zi de casă) sau adăugat în
  // sesiunea curentă și încă nesalvat. Cursele fără număr de foaie se recunosc după atribuire.
  function isTaken(c: GraficFoaieCandidate): boolean {
    return !!c.already_added_ziua
      || assignmentsInDocument.has(c.assignment_id)
      || (!!c.foaie_nr && foiInDocument.has(normFoaie(c.foaie_nr)));
  }

  // Unde e deja: ziua din DB dacă o știm, altfel a fost adăugată chiar acum, în acest tabel.
  function takenLabel(c: GraficFoaieCandidate): string {
    if (c.already_added_ziua) return `Este deja în documentul de casier din ${dmy(c.already_added_ziua)}`;
    return 'Tocmai a fost adăugată în tabel (încă nesalvată)';
  }

  const selectable = useMemo(
    () => items.filter(c => !isTaken(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, foiInDocument, assignmentsInDocument],
  );

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setChecked(prev =>
      prev.size === selectable.length
        ? new Set()
        : new Set(selectable.map(c => c.assignment_id)),
    );
  }

  function handleAdd() {
    const picked = items.filter(c => checked.has(c.assignment_id) && !isTaken(c));
    if (!picked.length) return;
    onAdd(picked);
    onClose();
  }

  const cell: React.CSSProperties = {
    border: '1px solid #ddd', padding: '3px 6px', fontSize: 11.5, fontFamily,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  };
  const th: React.CSSProperties = { ...cell, background: '#e8e8e8', fontWeight: 600, textAlign: 'left' };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 6, width: 'min(920px, 94vw)',
          maxHeight: '86vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)', fontFamily,
        }}
      >
        {/* Antet */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #ddd' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
              Foi de parcurs neîntoarse (din /grafic)
            </h3>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              Ziua cursei:
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ fontSize: 12, fontFamily }} />
            </label>
            <button type="button" onClick={onClose}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888' }}>
              ×
            </button>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Caută după numărul foii sau numele șoferului (ultimele 60 de zile)…"
            autoFocus
            style={{
              marginTop: 10, width: '100%', fontSize: 12, fontFamily,
              padding: '5px 8px', border: '1px solid #bbb', borderRadius: 3,
            }}
          />
          <p style={{ margin: '6px 0 0 0', fontSize: 11, color: '#888' }}>
            {search
              ? 'Căutare pe număr de foaie / șofer — arată doar cursele fără plată la terminal.'
              : `Cursele din ${dmy(date)} pentru care nu a venit nicio plată de la terminal.`}
          </p>
        </div>

        {/* Listă */}
        <div style={{ overflow: 'auto', padding: '0 16px', flex: 1 }}>
          {loading && <p style={{ fontSize: 12, color: '#888', padding: '16px 0' }}>Se încarcă…</p>}
          {error && <p style={{ fontSize: 12, color: '#c00', padding: '16px 0' }}>{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p style={{ fontSize: 12, color: '#888', padding: '16px 0' }}>
              {search
                ? 'Nicio foaie găsită. Verifică numărul sau schimbă ziua.'
                : 'Toate cursele acestei zile au primit plată la terminal — nu e nimic de introdus manual.'}
            </p>
          )}
          {!loading && !error && items.length > 0 && (
            <table style={{ borderCollapse: 'collapse', width: '100%', margin: '12px 0', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 34, textAlign: 'center' }}>
                    <input type="checkbox" checked={selectable.length > 0 && checked.size === selectable.length}
                      onChange={toggleAll} disabled={selectable.length === 0}
                      title="Bifează / debifează tot" />
                  </th>
                  <th style={{ ...th, width: 58 }}>Ora</th>
                  <th style={{ ...th, width: '30%' }}>Ruta</th>
                  <th style={{ ...th, width: '24%' }}>Șofer</th>
                  <th style={{ ...th, width: 92 }}>Mașina</th>
                  <th style={{ ...th, width: 90 }}>Nr. foaie</th>
                  <th style={{ ...th, width: 84 }}>Data foii</th>
                </tr>
              </thead>
              <tbody>
                {items.map(c => {
                  const taken = isTaken(c);
                  const bg = taken ? '#f2f2f2' : (checked.has(c.assignment_id) ? '#e6f0ff' : '#fff');
                  return (
                    <tr key={c.assignment_id}
                      onClick={() => !taken && toggle(c.assignment_id)}
                      style={{ cursor: taken ? 'default' : 'pointer', color: taken ? '#999' : 'inherit' }}
                      title={taken ? takenLabel(c) : ''}>
                      <td style={{ ...cell, background: bg, textAlign: 'center' }}>
                        <input type="checkbox" checked={checked.has(c.assignment_id)} disabled={taken}
                          onChange={() => toggle(c.assignment_id)} onClick={e => e.stopPropagation()} />
                      </td>
                      <td style={{ ...cell, background: bg, fontFamily: 'var(--font-mono)' }}>{departure(c.time_nord) || '—'}</td>
                      <td style={{ ...cell, background: bg }} title={c.route_name}>{c.route_name}</td>
                      <td style={{ ...cell, background: bg }} title={c.driver_name || ''}>{c.driver_name || '— fără șofer —'}</td>
                      <td style={{ ...cell, background: bg, fontFamily: 'var(--font-mono)' }}>{c.vehicle_plate || '—'}</td>
                      <td style={{ ...cell, background: bg, fontFamily: 'var(--font-mono)' }}>
                        {c.foaie_nr || <span style={{ color: '#f57c00' }}>fără nr.</span>}
                      </td>
                      <td style={{ ...cell, background: bg, fontFamily: 'var(--font-mono)' }}>{dmy(c.data_foaie)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Subsol */}
        <div style={{
          padding: '10px 16px', borderTop: '1px solid #ddd',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, color: '#888' }}>
            {items.length} curse · {items.length - selectable.length} deja în document
            {items.length === 200 && (
              <> · <span style={{ color: '#f57c00', fontWeight: 600 }}>
                listă limitată la 200 — restrânge căutarea
              </span></>
            )}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} className="btn btn-sm" style={{ fontFamily }}>Anulează</button>
            <button type="button" onClick={handleAdd} className="btn btn-primary btn-sm" style={{ fontFamily }}
              disabled={checked.size === 0}>
              Adaugă {checked.size || ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
