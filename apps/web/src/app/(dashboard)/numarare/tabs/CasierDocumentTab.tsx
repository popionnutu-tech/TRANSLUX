'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GraficRouteRow } from './incasareActions';

interface Props {
  ziua: string;            // ziua selectată
  routes: GraficRouteRow[]; // rutele (deja filtrate pe ziua)
  operatorName: string;     // numele utilizatorului logat (pentru antet)
}

// Fiecare rând în starea locală (cu modificări)
type EditableRow = {
  // Identificator stabil
  row_key: string;
  // Read-only / sursă
  N: number;
  Ora: string;
  // Editabile
  Ruta: string;
  Sofer: string;
  Masina: string;
  NumarFoaie: string;
  DataFoaie: string;
  // Sume (din Tomberon, dar editabile)
  Incasare: number;          // = suma_numerar (read-only de obicei)
  PlataCard: number;         // pentru Phase 2 (split din diagrama)
  Ligotnici: number;         // ligotniki0_suma (lei)
  LigotniciGara: number;     // ligotniki_vokzal_suma
  Diagrame: number;          // diagrama_suma
  Cheltuieli: number;        // NEW
  Combustibil: number;       // dt_suma
  CheltuieliSupl: number;    // dop_rashodi
  Comentariu: string;
  // Sursa
  __pristine: boolean;       // false dacă a fost modificat local
};

function rowFromRoute(r: GraficRouteRow, idx: number, docDate: string): EditableRow {
  const ruta =
    [r.route_name, r.vehicle_plate ? `(${r.vehicle_plate})` : ''].filter(Boolean).join(' ') || '—';
  return {
    row_key: r.row_key,
    N: idx + 1,
    Ora: r.time_nord || '',
    Ruta: r.route_name || '',
    Sofer: r.driver_name || '',
    Masina: r.vehicle_plate || '',
    NumarFoaie: r.foaie_nr || '',
    DataFoaie: r.ziua || docDate,
    Incasare: Number(r.incasare_numerar) || 0,
    PlataCard: 0,                  // Phase 2: split from diagrama
    Ligotnici: Number(r.ligotniki0_suma) || 0,
    LigotniciGara: Number(r.ligotniki_vokzal_suma) || 0,
    Diagrame: Number(r.incasare_diagrama) || 0,
    Cheltuieli: 0,                 // Phase 2: new field
    Combustibil: Number(r.dt_suma) || 0,
    CheltuieliSupl: Number(r.dop_rashodi) || 0,
    Comentariu: r.comment || '',
    __pristine: true,
  };
  void ruta;
}

// Format pentru document №: 6 cifre
function docNumberFromDate(date: string): string {
  // "2026-04-30" -> 20260430 -> ultimele 6 cifre = 260430 (ex.)
  const digits = date.replace(/\D/g, '');
  return digits.slice(-6).padStart(6, '0');
}

function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

export default function CasierDocumentTab({ ziua, routes, operatorName }: Props) {
  const [docDate, setDocDate] = useState<string>(ziua || todayChisinau());
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  // Sincronizare cu rutele primite
  useEffect(() => {
    setRows(routes.map((r, i) => rowFromRoute(r, i, docDate)));
    setHasUnsaved(false);
  }, [routes, docDate]);

  const totals = useMemo(() => {
    const sum = (k: keyof EditableRow) =>
      rows.reduce((s, r) => s + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
    return {
      Incasare: sum('Incasare'),
      PlataCard: sum('PlataCard'),
      Ligotnici: sum('Ligotnici'),
      LigotniciGara: sum('LigotniciGara'),
      Diagrame: sum('Diagrame'),
      Cheltuieli: sum('Cheltuieli'),
      Combustibil: sum('Combustibil'),
      CheltuieliSupl: sum('CheltuieliSupl'),
    };
  }, [rows]);

  function updateCell<K extends keyof EditableRow>(idx: number, key: K, value: EditableRow[K]) {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value, __pristine: false };
      return next;
    });
    setHasUnsaved(true);
  }

  function addRow() {
    setRows(prev => [
      ...prev,
      {
        row_key: `manual-${Date.now()}`,
        N: prev.length + 1,
        Ora: '',
        Ruta: '',
        Sofer: '',
        Masina: '',
        NumarFoaie: '',
        DataFoaie: docDate,
        Incasare: 0,
        PlataCard: 0,
        Ligotnici: 0,
        LigotniciGara: 0,
        Diagrame: 0,
        Cheltuieli: 0,
        Combustibil: 0,
        CheltuieliSupl: 0,
        Comentariu: '',
        __pristine: false,
      },
    ]);
    setHasUnsaved(true);
  }

  function deleteRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, N: i + 1 })));
    setHasUnsaved(true);
  }

  function handleClose() {
    if (hasUnsaved && !confirm('Sunt modificări nesalvate. Sigur închizi?')) return;
    // For Phase 1, just reset the form
    setRows(routes.map((r, i) => rowFromRoute(r, i, docDate)));
    setHasUnsaved(false);
  }

  function handleSave() {
    // Phase 2: persist to DB
    alert('Phase 1: doar interfața.\nSalvarea în BD vine la următorul pas.');
  }

  // Stilurile de bază (Windows-business / Tahoma)
  const fontFamily = '"Segoe UI", Tahoma, Arial, sans-serif';
  const cellStyle: React.CSSProperties = {
    border: '1px solid #ccc',
    padding: '2px 6px',
    fontSize: 12,
    fontFamily,
    background: '#fff',
  };
  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    background: '#e8e8e8',
    fontWeight: 600,
    textAlign: 'center',
  };
  const numCellStyle: React.CSSProperties = {
    ...cellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)',
  };

  // Editable input style: să arate ca o celulă normală până la focus
  const editInputStyle: React.CSSProperties = {
    width: '100%', border: 'none', outline: 'none', background: 'transparent',
    fontSize: 12, fontFamily, padding: 0,
  };
  const editNumStyle: React.CSSProperties = {
    ...editInputStyle, textAlign: 'right', fontFamily: 'var(--font-mono)',
  };

  return (
    <div style={{ fontFamily }}>
      {/* Antet */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        gap: 16,
        alignItems: 'center',
        marginBottom: 12,
        padding: '10px 14px',
        background: '#f5f5f5',
        border: '1px solid #ddd',
        borderRadius: 4,
      }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Document de casier №{' '}
          <span style={{ fontFamily: 'var(--font-mono)', color: '#9B1B30' }}>
            {docNumberFromDate(docDate)}
          </span>
        </h3>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          Data:
          <input
            type="date"
            value={docDate}
            onChange={e => setDocDate(e.target.value)}
            style={{ fontSize: 12, fontFamily }}
          />
        </label>
        <span style={{ fontSize: 12 }}>
          Operator: <strong>{operatorName}</strong>
        </span>
        <span style={{ fontSize: 11, color: hasUnsaved ? '#f57c00' : '#888' }}>
          {hasUnsaved ? '● modificat' : '○ nemodificat'}
        </span>
      </div>

      {/* Tabel */}
      <div style={{
        maxHeight: '60vh', overflow: 'auto',
        border: '1px solid #ccc',
      }}>
        <table style={{
          borderCollapse: 'collapse',
          fontSize: 12,
          fontFamily,
          width: '100%',
          minWidth: 1400,
        }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th style={{ ...headerCellStyle, width: 32 }}>N</th>
              <th style={{ ...headerCellStyle, width: 56 }}>Ora</th>
              <th style={{ ...headerCellStyle, minWidth: 200 }}>Ruta</th>
              <th style={{ ...headerCellStyle, minWidth: 140 }}>Șoferi</th>
              <th style={{ ...headerCellStyle, width: 90 }}>Mașina</th>
              <th style={{ ...headerCellStyle, width: 90 }}>NumărFoaie</th>
              <th style={{ ...headerCellStyle, width: 100 }}>DataFoaie</th>
              <th style={{ ...headerCellStyle, width: 80 }}>Încasare</th>
              <th style={{ ...headerCellStyle, width: 70 }}>Plată card</th>
              <th style={{ ...headerCellStyle, width: 70 }}>Ligotnici</th>
              <th style={{ ...headerCellStyle, width: 70 }}>Lig. gară</th>
              <th style={{ ...headerCellStyle, width: 70 }}>Diagrame</th>
              <th style={{ ...headerCellStyle, width: 70 }}>Cheltuieli</th>
              <th style={{ ...headerCellStyle, width: 70 }}>Combustibil</th>
              <th style={{ ...headerCellStyle, width: 70 }}>Chelt. supl.</th>
              <th style={{ ...headerCellStyle, minWidth: 200 }}>Comentariu</th>
              <th style={{ ...headerCellStyle, width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const rowBg = r.__pristine ? '#fff' : '#fffbe6';  // galben deschis
              const cs = (overrides: React.CSSProperties = {}): React.CSSProperties => ({
                ...cellStyle, background: rowBg, ...overrides,
              });
              const ns = (overrides: React.CSSProperties = {}): React.CSSProperties => ({
                ...numCellStyle, background: rowBg, ...overrides,
              });
              return (
                <tr key={r.row_key}>
                  <td style={cs({ textAlign: 'center', color: '#888' })}>{r.N}</td>
                  <td style={cs({ textAlign: 'center' })}>{r.Ora || '—'}</td>
                  <td style={cs()}>
                    <input
                      style={editInputStyle}
                      value={r.Ruta}
                      onChange={e => updateCell(i, 'Ruta', e.target.value)}
                    />
                  </td>
                  <td style={cs()}>
                    <input
                      style={editInputStyle}
                      value={r.Sofer}
                      onChange={e => updateCell(i, 'Sofer', e.target.value)}
                    />
                  </td>
                  <td style={cs({ fontFamily: 'var(--font-mono)' })}>
                    <input
                      style={{ ...editInputStyle, fontFamily: 'var(--font-mono)' }}
                      value={r.Masina}
                      onChange={e => updateCell(i, 'Masina', e.target.value)}
                    />
                  </td>
                  <td style={cs({ fontFamily: 'var(--font-mono)' })}>
                    <input
                      style={{ ...editInputStyle, fontFamily: 'var(--font-mono)' }}
                      value={r.NumarFoaie}
                      onChange={e => updateCell(i, 'NumarFoaie', e.target.value)}
                    />
                  </td>
                  <td style={cs()}>
                    <input
                      type="date"
                      style={editInputStyle}
                      value={r.DataFoaie}
                      onChange={e => updateCell(i, 'DataFoaie', e.target.value)}
                    />
                  </td>
                  <td style={ns()}>{Math.round(r.Incasare)}</td>
                  <td style={ns()}>
                    <input
                      type="number" min={0} step={0.01}
                      style={editNumStyle}
                      value={r.PlataCard || ''}
                      onChange={e => updateCell(i, 'PlataCard', Number(e.target.value) || 0)}
                    />
                  </td>
                  <td style={ns()}>
                    <input
                      type="number" min={0}
                      style={editNumStyle}
                      value={r.Ligotnici || ''}
                      onChange={e => updateCell(i, 'Ligotnici', Number(e.target.value) || 0)}
                    />
                  </td>
                  <td style={ns()}>
                    <input
                      type="number" min={0}
                      style={editNumStyle}
                      value={r.LigotniciGara || ''}
                      onChange={e => updateCell(i, 'LigotniciGara', Number(e.target.value) || 0)}
                    />
                  </td>
                  <td style={ns()}>
                    <input
                      type="number" min={0} step={0.01}
                      style={editNumStyle}
                      value={r.Diagrame || ''}
                      onChange={e => updateCell(i, 'Diagrame', Number(e.target.value) || 0)}
                    />
                  </td>
                  <td style={ns()}>
                    <input
                      type="number" min={0} step={0.01}
                      style={editNumStyle}
                      value={r.Cheltuieli || ''}
                      onChange={e => updateCell(i, 'Cheltuieli', Number(e.target.value) || 0)}
                    />
                  </td>
                  <td style={ns()}>
                    <input
                      type="number" min={0} step={0.01}
                      style={editNumStyle}
                      value={r.Combustibil || ''}
                      onChange={e => updateCell(i, 'Combustibil', Number(e.target.value) || 0)}
                    />
                  </td>
                  <td style={ns()}>
                    <input
                      type="number" min={0} step={0.01}
                      style={editNumStyle}
                      value={r.CheltuieliSupl || ''}
                      onChange={e => updateCell(i, 'CheltuieliSupl', Number(e.target.value) || 0)}
                    />
                  </td>
                  <td style={cs()}>
                    <input
                      style={editInputStyle}
                      value={r.Comentariu}
                      onChange={e => updateCell(i, 'Comentariu', e.target.value)}
                    />
                  </td>
                  <td style={cs({ textAlign: 'center' })}>
                    <button
                      type="button"
                      onClick={() => deleteRow(i)}
                      title="Șterge rând"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c00', fontSize: 14 }}
                    >×</button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={17} style={{ ...cellStyle, textAlign: 'center', padding: 20, color: '#888' }}>
                  Nicio rută în această zi. Adaugă rând manual cu butonul de mai jos.
                </td>
              </tr>
            )}
          </tbody>
          {/* Total */}
          <tfoot>
            <tr>
              <td colSpan={7} style={{ ...headerCellStyle, textAlign: 'right' }}>TOTAL</td>
              <td style={{ ...headerCellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(totals.Incasare)}</td>
              <td style={{ ...headerCellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(totals.PlataCard)}</td>
              <td style={{ ...headerCellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(totals.Ligotnici)}</td>
              <td style={{ ...headerCellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(totals.LigotniciGara)}</td>
              <td style={{ ...headerCellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(totals.Diagrame)}</td>
              <td style={{ ...headerCellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(totals.Cheltuieli)}</td>
              <td style={{ ...headerCellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(totals.Combustibil)}</td>
              <td style={{ ...headerCellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(totals.CheltuieliSupl)}</td>
              <td colSpan={2} style={{ ...headerCellStyle }}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Subsol: butoane */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 12, padding: '8px 0',
        gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={addRow}
            className="btn btn-sm"
            style={{ fontFamily }}
          >
            + Adaugă rând
          </button>
          <span style={{ fontSize: 11, color: '#888', alignSelf: 'center', marginLeft: 4 }}>
            {rows.length} rând{rows.length !== 1 ? 'uri' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={handleClose} className="btn" style={{ fontFamily }}>Închide</button>
          <button
            type="button"
            onClick={handleSave}
            className="btn btn-primary"
            style={{ fontFamily }}
            disabled={!hasUnsaved}
            title={!hasUnsaved ? 'Nimic de salvat' : 'Salvează modificările'}
          >
            OK (salvează)
          </button>
        </div>
      </div>

      <p className="text-muted" style={{ fontSize: 11, marginTop: 8, fontFamily }}>
        ⓘ Phase 1: doar interfața vizuală + editare locală + totaluri. Salvarea în BD se adaugă în Phase 2.
      </p>
    </div>
  );
}
