'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getCasierDocument,
  getActiveDriversForPicker,
  getActiveVehiclesForPicker,
  getActiveRoutesForPicker,
  type CasierRow,
  type DriverOption,
  type VehicleOption,
  type RouteOption,
} from './incasareActions';

interface Props {
  ziua: string;            // ziua selectată (din shapă-le părinte)
  operatorName: string;     // numele utilizatorului logat (pentru antet)
}

// Fiecare rând în starea locală (cu modificări)
type EditableRow = {
  row_key: string;
  // Read-only / sursă tomberon
  N: number;
  Ora: string;
  // Editabile (text)
  Ruta: string;
  Sofer: string;
  Masina: string;
  NumarFoaie: string;
  DataFoaie: string;
  // Sume — Tomberon, dar editabile (override pentru cazuri speciale)
  Incasare: number;          // suma_numerar (cash)
  Ligotnici: number;         // ligotniki0_suma (lei)
  LigotniciGara: number;     // ligotniki_vokzal_suma
  Diagrame: number;          // diagrama
  Combustibil: number;       // dt_suma
  CheltuieliSupl: number;    // dop_rashodi
  Comentariu: string;
  // Stare
  __pristine: boolean;
  __hasGrafic: boolean;
};

function rowFromCasier(c: CasierRow, idx: number): EditableRow {
  return {
    row_key: c.row_key,
    N: idx + 1,
    Ora: c.time_nord || '',
    Ruta: c.route_name || '',
    Sofer: c.driver_name || '',
    Masina: c.vehicle_plate || '',
    NumarFoaie: c.foaie_nr || '',
    DataFoaie: c.data_foaie || '',  // /grafic ziua, NULL dacă foaia nu e în /grafic
    Incasare: Number(c.incasare_numerar) || 0,
    Ligotnici: Number(c.ligotniki0_suma) || 0,
    LigotniciGara: Number(c.ligotniki_vokzal_suma) || 0,
    Diagrame: Number(c.diagrama) || 0,
    Combustibil: Number(c.dt_suma) || 0,
    CheltuieliSupl: Number(c.dop_rashodi) || 0,
    Comentariu: c.comment || '',
    __pristine: true,
    __hasGrafic: c.has_grafic_match,
  };
}

function docNumberFromDate(date: string): string {
  const digits = date.replace(/\D/g, '');
  return digits.slice(-6).padStart(6, '0');
}

export default function CasierDocumentTab({ ziua, operatorName }: Props) {
  const [docDate, setDocDate] = useState<string>(ziua);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  // Nomenclatoare (încărcate o singură dată)
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);

  useEffect(() => {
    Promise.all([
      getActiveDriversForPicker(),
      getActiveVehiclesForPicker(),
      getActiveRoutesForPicker(),
    ]).then(([d, v, r]) => {
      setDrivers(d);
      setVehicles(v);
      setRoutes(r);
    });
  }, []);

  // Sincronizare data părinte → data document
  useEffect(() => {
    setDocDate(ziua);
  }, [ziua]);

  // Încarcă rândurile din Tomberon pentru ziua aleasă
  useEffect(() => {
    if (!docDate) return;
    setLoading(true);
    getCasierDocument(docDate)
      .then(data => {
        setRows(data.map((r, i) => rowFromCasier(r, i)));
        setHasUnsaved(false);
      })
      .finally(() => setLoading(false));
  }, [docDate]);

  const totals = useMemo(() => {
    const sum = (k: keyof EditableRow) =>
      rows.reduce((s, r) => s + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
    return {
      Incasare: sum('Incasare'),
      Ligotnici: sum('Ligotnici'),
      LigotniciGara: sum('LigotniciGara'),
      Diagrame: sum('Diagrame'),
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
        Ligotnici: 0,
        LigotniciGara: 0,
        Diagrame: 0,
        Combustibil: 0,
        CheltuieliSupl: 0,
        Comentariu: '',
        __pristine: false,
        __hasGrafic: false,
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
    // Reset
    setLoading(true);
    getCasierDocument(docDate).then(data => {
      setRows(data.map((r, i) => rowFromCasier(r, i)));
      setHasUnsaved(false);
    }).finally(() => setLoading(false));
  }

  function handleSave() {
    alert('Phase 1: doar interfața.\nSalvarea în BD vine la următorul pas.');
  }

  // Stilurile de bază
  const fontFamily = '"Segoe UI", Tahoma, Arial, sans-serif';
  const cellStyle: React.CSSProperties = {
    border: '1px solid #ccc',
    padding: '1px 4px',
    fontSize: 11,
    fontFamily,
    background: '#fff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
  const editInputStyle: React.CSSProperties = {
    width: '100%', border: 'none', outline: 'none', background: 'transparent',
    fontSize: 11, fontFamily, padding: 0,
  };
  const editNumStyle: React.CSSProperties = {
    ...editInputStyle, textAlign: 'right', fontFamily: 'var(--font-mono)',
  };

  return (
    <div style={{ fontFamily }}>
      <style>{`
        .casier-date-input::-webkit-calendar-picker-indicator {
          display: none;
          -webkit-appearance: none;
        }
        .casier-date-input { appearance: none; -webkit-appearance: none; }
      `}</style>
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
          {hasUnsaved ? '● modificat' : '○ sincronizat cu Tomberon'}
        </span>
      </div>

      {/* Tabel */}
      <div style={{
        border: '1px solid #ccc',
      }}>
        <table style={{
          borderCollapse: 'collapse',
          fontSize: 11,
          fontFamily,
          width: '100%',
          tableLayout: 'fixed',
        }}>
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, width: '2%' }}>N</th>
              <th style={{ ...headerCellStyle, width: '4%' }}>Ora</th>
              <th style={{ ...headerCellStyle, width: '13%' }}>Ruta</th>
              <th style={{ ...headerCellStyle, width: '10%' }}>Șoferi</th>
              <th style={{ ...headerCellStyle, width: '6%' }}>Mașina</th>
              <th style={{ ...headerCellStyle, width: '7%' }}>NumărFoaie</th>
              <th style={{ ...headerCellStyle, width: '10%' }}>DataFoaie</th>
              <th style={{ ...headerCellStyle, width: '6%' }}>Încasare</th>
              <th style={{ ...headerCellStyle, width: '5%' }}>Ligotnici</th>
              <th style={{ ...headerCellStyle, width: '5%' }}>Lig. gară</th>
              <th style={{ ...headerCellStyle, width: '6%' }}>Diagrame</th>
              <th style={{ ...headerCellStyle, width: '6%' }}>Combust.</th>
              <th style={{ ...headerCellStyle, width: '5%' }}>Ch. supl.</th>
              <th style={{ ...headerCellStyle, width: '13%' }}>Comentariu</th>
              <th style={{ ...headerCellStyle, width: '2%' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={15} style={{ ...cellStyle, textAlign: 'center', padding: 20, color: '#888' }}>
                  Se încarcă din Tomberon...
                </td>
              </tr>
            )}
            {!loading && rows.map((r, i) => {
              // Roșu deschis = fără match în /grafic (foaie necunoscut)
              // Galben deschis = modificat local
              // Alb = sincronizat
              const rowBg = !r.__pristine
                ? '#fffbe6'
                : !r.__hasGrafic
                ? '#fdecea'
                : '#fff';
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
                    <select
                      value={r.Ruta}
                      onChange={e => {
                        const picked = routes.find(rt => rt.display_name === e.target.value);
                        updateCell(i, 'Ruta', e.target.value);
                        // Auto-fill Ora din ruta dacă nu e setat
                        if (picked?.time_nord && !r.Ora) {
                          // hint via the full row edit
                          setRows(prev => {
                            const next = [...prev];
                            next[i] = { ...next[i], Ora: picked.time_nord || '', __pristine: false };
                            return next;
                          });
                        }
                      }}
                      style={editInputStyle}
                    >
                      <option value="">— alege rută —</option>
                      {/* Dacă valoarea curentă nu e în nomenclator, o păstrăm ca opțiune temporară */}
                      {r.Ruta && !routes.some(rt => rt.display_name === r.Ruta) && (
                        <option value={r.Ruta}>{r.Ruta} (custom)</option>
                      )}
                      {routes.map(rt => (
                        <option key={rt.id} value={rt.display_name}>
                          {rt.time_nord ? `${rt.time_nord} · ${rt.display_name}` : rt.display_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={cs()}>
                    <select
                      value={r.Sofer}
                      onChange={e => updateCell(i, 'Sofer', e.target.value)}
                      style={editInputStyle}
                    >
                      <option value="">— alege șofer —</option>
                      {r.Sofer && !drivers.some(d => d.full_name === r.Sofer) && (
                        <option value={r.Sofer}>{r.Sofer}</option>
                      )}
                      {drivers.map(d => (
                        <option key={d.id} value={d.full_name}>{d.full_name}</option>
                      ))}
                    </select>
                  </td>
                  <td style={cs({ fontFamily: 'var(--font-mono)' })}>
                    <select
                      value={r.Masina}
                      onChange={e => updateCell(i, 'Masina', e.target.value)}
                      style={{ ...editInputStyle, fontFamily: 'var(--font-mono)' }}
                    >
                      <option value="">—</option>
                      {r.Masina && !vehicles.some(v => v.plate_number === r.Masina) && (
                        <option value={r.Masina}>{r.Masina} (custom)</option>
                      )}
                      {vehicles.map(v => (
                        <option key={v.id} value={v.plate_number}>{v.plate_number}</option>
                      ))}
                    </select>
                  </td>
                  <td style={cs({ fontFamily: 'var(--font-mono)' })}>
                    <input style={{ ...editInputStyle, fontFamily: 'var(--font-mono)' }} value={r.NumarFoaie}
                      onChange={e => updateCell(i, 'NumarFoaie', e.target.value)} />
                  </td>
                  <td style={cs()}>
                    <input
                      type="date"
                      className="casier-date-input"
                      style={{
                        ...editInputStyle,
                        // Highlight când diferă de ziua documentului
                        color: r.DataFoaie && r.DataFoaie !== docDate ? '#f57c00' : 'inherit',
                        fontWeight: r.DataFoaie && r.DataFoaie !== docDate ? 600 : 400,
                      }}
                      value={r.DataFoaie}
                      onChange={e => updateCell(i, 'DataFoaie', e.target.value)}
                      title={r.DataFoaie && r.DataFoaie !== docDate
                        ? `Foaia e introdusă în /grafic pe ${r.DataFoaie}, plata făcută pe ${docDate}`
                        : ''}
                    />
                  </td>
                  <td style={ns()}>{Math.round(r.Incasare)}</td>
                  <td style={ns()}>
                    <input type="number" min={0} style={editNumStyle} value={r.Ligotnici || ''}
                      onChange={e => updateCell(i, 'Ligotnici', Number(e.target.value) || 0)} />
                  </td>
                  <td style={ns()}>
                    <input type="number" min={0} style={editNumStyle} value={r.LigotniciGara || ''}
                      onChange={e => updateCell(i, 'LigotniciGara', Number(e.target.value) || 0)} />
                  </td>
                  <td style={ns()}>
                    <input type="number" min={0} step={0.01} style={editNumStyle} value={r.Diagrame || ''}
                      onChange={e => updateCell(i, 'Diagrame', Number(e.target.value) || 0)} />
                  </td>
                  <td style={ns()}>
                    <input type="number" min={0} step={0.01} style={editNumStyle} value={r.Combustibil || ''}
                      onChange={e => updateCell(i, 'Combustibil', Number(e.target.value) || 0)} />
                  </td>
                  <td style={ns()}>
                    <input type="number" min={0} step={0.01} style={editNumStyle} value={r.CheltuieliSupl || ''}
                      onChange={e => updateCell(i, 'CheltuieliSupl', Number(e.target.value) || 0)} />
                  </td>
                  <td style={cs()}>
                    <input style={editInputStyle} value={r.Comentariu}
                      onChange={e => updateCell(i, 'Comentariu', e.target.value)} />
                  </td>
                  <td style={cs({ textAlign: 'center' })}>
                    <button type="button" onClick={() => deleteRow(i)} title="Șterge rând"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c00', fontSize: 14 }}>×</button>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={15} style={{ ...cellStyle, textAlign: 'center', padding: 20, color: '#888' }}>
                  Nicio plată în Tomberon pentru această zi.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} style={{ ...headerCellStyle, textAlign: 'right' }}>TOTAL</td>
              <td style={{ ...headerCellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(totals.Incasare)}</td>
              <td style={{ ...headerCellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(totals.Ligotnici)}</td>
              <td style={{ ...headerCellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(totals.LigotniciGara)}</td>
              <td style={{ ...headerCellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(totals.Diagrame)}</td>
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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" onClick={addRow} className="btn btn-sm" style={{ fontFamily }}>
            + Adaugă rând
          </button>
          <span style={{ fontSize: 11, color: '#888' }}>
            {rows.length} plăți din Tomberon
            {rows.length > 0 && (
              <> · <span style={{ color: '#c00' }}>{rows.filter(r => !r.__hasGrafic).length} fără /grafic</span></>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={handleClose} className="btn" style={{ fontFamily }}>Închide</button>
          <button type="button" onClick={handleSave} className="btn btn-primary" style={{ fontFamily }}
            disabled={!hasUnsaved}
            title={!hasUnsaved ? 'Nimic de salvat' : 'Salvează modificările'}>
            OK (salvează)
          </button>
        </div>
      </div>

      <p className="text-muted" style={{ fontSize: 11, marginTop: 8, fontFamily }}>
        ⓘ Sursa: Tomberon (casa automată). Datele despre șofer/rută/mașină se trag din /grafic
        când foaia se potrivește. Rândurile <span style={{ background: '#fdecea', padding: '0 4px' }}>roșu deschis</span> n-au /grafic.
        Phase 1: doar interfața vizuală + editare locală + totaluri.
      </p>
    </div>
  );
}
