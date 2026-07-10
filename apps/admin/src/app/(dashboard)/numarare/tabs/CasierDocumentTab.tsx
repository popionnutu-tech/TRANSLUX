'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  PusLa: string;             // timestamptz ISO, read-only — când s-a introdus foaia
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
    PusLa: c.pus_la || '',
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

// Ora introducerii foii, mereu în ora Chișinăului (nu a browserului).
const pusLaFormatter = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
  timeZone: 'Europe/Chisinau',
});

function formatPusLa(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return pusLaFormatter.format(d).replace(',', '');
}

// ─── Sortare pe cap de tabel ───
// 'N' = ordinea de încărcare (SQL: după ora cursei). Celelalte: alfabetic/cronologic.
type SortKey = 'N' | 'Ruta' | 'Sofer' | 'DataFoaie' | 'PusLa';
type SortDir = 'asc' | 'desc';

function isEmptyFor(r: EditableRow, key: SortKey): boolean {
  if (key === 'N') return false;
  if (key === 'PusLa') return !r.PusLa || Number.isNaN(new Date(r.PusLa).getTime());
  return !r[key];
}

function compareCore(a: EditableRow, b: EditableRow, key: SortKey): number {
  if (key === 'N') return a.N - b.N;
  if (key === 'PusLa') return new Date(a.PusLa).getTime() - new Date(b.PusLa).getTime();
  // DataFoaie e ISO (YYYY-MM-DD) → comparația de șir e deja cronologică.
  return key === 'DataFoaie'
    ? a.DataFoaie.localeCompare(b.DataFoaie)
    : a[key].localeCompare(b[key], 'ro');
}

function sortRows(rows: EditableRow[], key: SortKey, dir: SortDir): EditableRow[] {
  return [...rows].sort((a, b) => {
    // Rândurile fără valoare (foaie fără /grafic) rămân la sfârșit în ambele direcții.
    const ea = isEmptyFor(a, key);
    const eb = isEmptyFor(b, key);
    if (ea && eb) return a.N - b.N;
    if (ea) return 1;
    if (eb) return -1;
    const c = compareCore(a, b, key);
    if (c !== 0) return dir === 'asc' ? c : -c;
    return a.N - b.N;  // egalitate → păstrează ordinea inițială
  });
}

export default function CasierDocumentTab({ ziua, operatorName }: Props) {
  const [docDate, setDocDate] = useState<string>(ziua);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  // Sortare + filtru — afectează DOAR afișarea, niciodată datele din `rows`.
  const [sortKey, setSortKey] = useState<SortKey>('N');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [dateFilter, setDateFilter] = useState<string>('');  // '' = toate zilele

  // Contor pentru rândurile adăugate manual: Date.now() singur poate colida la două
  // apăsări în aceeași milisecundă, iar row_key trebuie să fie unic (e ținta editării).
  const manualSeq = useRef(0);

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
        setDateFilter('');  // altă zi → filtrul vechi ar putea ascunde tot
      })
      .finally(() => setLoading(false));
  }, [docDate]);

  // Zilele distincte prezente în DataFoaie, pentru filtrul din capul coloanei.
  const dateOptions = useMemo(
    () => Array.from(new Set(rows.map(r => r.DataFoaie).filter(Boolean))).sort(),
    [rows],
  );

  // Ce se vede pe ecran: filtrat, apoi sortat. `rows` rămâne sursa de adevăr.
  const displayRows = useMemo(() => {
    const filtered = dateFilter ? rows.filter(r => r.DataFoaie === dateFilter) : rows;
    return sortRows(filtered, sortKey, sortDir);
  }, [rows, dateFilter, sortKey, sortDir]);

  const isFiltered = dateFilter !== '';

  // Totalurile urmăresc ce e AFIȘAT — altfel, cu filtru pus, TOTAL n-ar corespunde rândurilor.
  // Atenție la salvare/printare (Phase 2): totalul PERSISTAT se calculează peste `rows`
  // (ziua întreagă), nu peste `displayRows`, altfel un filtru activ ar salva un total parțial.
  const totals = useMemo(() => {
    const sum = (k: keyof EditableRow) =>
      displayRows.reduce((s, r) => s + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
    return {
      Incasare: sum('Incasare'),
      Ligotnici: sum('Ligotnici'),
      LigotniciGara: sum('LigotniciGara'),
      Diagrame: sum('Diagrame'),
      Combustibil: sum('Combustibil'),
      CheltuieliSupl: sum('CheltuieliSupl'),
    };
  }, [displayRows]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // Editarea țintește rândul după `row_key`, NU după poziție: cu tabelul sortat sau
  // filtrat, indexul afișat nu mai corespunde cu indexul din `rows`.
  function updateCell<K extends keyof EditableRow>(rowKey: string, key: K, value: EditableRow[K]) {
    setRows(prev => prev.map(r =>
      r.row_key === rowKey ? { ...r, [key]: value, __pristine: false } : r,
    ));
    setHasUnsaved(true);
  }

  function addRow() {
    setRows(prev => [
      ...prev,
      {
        row_key: `manual-${Date.now()}-${++manualSeq.current}`,
        N: prev.length + 1,
        Ora: '',
        Ruta: '',
        Sofer: '',
        Masina: '',
        NumarFoaie: '',
        DataFoaie: docDate,
        PusLa: '',
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

  function deleteRow(rowKey: string) {
    setRows(prev => prev.filter(r => r.row_key !== rowKey).map((r, i) => ({ ...r, N: i + 1 })));
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
  // Header pe care se poate da click: coloana activă e evidențiată, săgeata arată direcția.
  const sortableTh = (width: string, key: SortKey): React.CSSProperties => ({
    ...headerCellStyle,
    width,
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'normal',
    overflow: 'visible',
    background: sortKey === key ? '#d6e4f0' : '#e8e8e8',
  });
  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
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
              <th style={sortableTh('2%', 'N')} onClick={() => toggleSort('N')}
                title="Click: revino la ordinea inițială (după ora cursei)">
                N{sortArrow('N')}
              </th>
              <th style={sortableTh('13%', 'Ruta')} onClick={() => toggleSort('Ruta')}
                title="Click: sortează alfabetic după rută">
                Ruta{sortArrow('Ruta')}
              </th>
              <th style={sortableTh('10%', 'Sofer')} onClick={() => toggleSort('Sofer')}
                title="Click: sortează alfabetic după șofer">
                Șoferi{sortArrow('Sofer')}
              </th>
              <th style={{ ...headerCellStyle, width: '6%' }}>Mașina</th>
              <th style={{ ...headerCellStyle, width: '7%' }}>NumărFoaie</th>
              <th style={sortableTh('10%', 'DataFoaie')} onClick={() => toggleSort('DataFoaie')}
                title="Click: sortează cronologic după data foii">
                <div>DataFoaie{sortArrow('DataFoaie')}</div>
                <select
                  value={dateFilter}
                  onClick={e => e.stopPropagation()}
                  onChange={e => { e.stopPropagation(); setDateFilter(e.target.value); }}
                  title="Arată doar o anumită zi"
                  style={{
                    width: '100%', fontSize: 10, fontFamily, marginTop: 2,
                    border: '1px solid #bbb', borderRadius: 2, padding: '0 1px',
                    background: isFiltered ? '#fff3cd' : '#fff',
                    fontWeight: isFiltered ? 600 : 400,
                  }}
                >
                  <option value="">toate zilele</option>
                  {dateOptions.map(d => (
                    <option key={d} value={d}>{d.split('-').reverse().join('.')}</option>
                  ))}
                </select>
              </th>
              <th style={sortableTh('9%', 'PusLa')} onClick={() => toggleSort('PusLa')}
                title="Data și ora la care s-a introdus foaia de parcurs (ora Chișinăului)">
                Pus la{sortArrow('PusLa')}
              </th>
              <th style={{ ...headerCellStyle, width: '6%' }}>Încasare</th>
              <th style={{ ...headerCellStyle, width: '5%' }}>Ligotnici</th>
              <th style={{ ...headerCellStyle, width: '5%' }}>Lig. gară</th>
              <th style={{ ...headerCellStyle, width: '6%' }}>Diagrame</th>
              <th style={{ ...headerCellStyle, width: '6%' }}>Combust.</th>
              <th style={{ ...headerCellStyle, width: '5%' }}>Ch. supl.</th>
              <th style={{ ...headerCellStyle, width: '8%' }}>Comentariu</th>
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
            {!loading && displayRows.map(r => {
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
              const pusLaText = formatPusLa(r.PusLa);
              return (
                <tr key={r.row_key}>
                  <td style={cs({ textAlign: 'center', color: '#888' })}>{r.N}</td>
                  <td style={cs()}>
                    <select
                      value={r.Ruta}
                      onChange={e => {
                        const picked = routes.find(rt => rt.display_name === e.target.value);
                        const value = e.target.value;
                        // Ruta + ora cursei într-o singură actualizare, țintind rândul după cheie.
                        setRows(prev => prev.map(row => row.row_key === r.row_key
                          ? {
                              ...row,
                              Ruta: value,
                              Ora: !row.Ora && picked?.time_nord ? picked.time_nord : row.Ora,
                              __pristine: false,
                            }
                          : row));
                        setHasUnsaved(true);
                      }}
                      style={editInputStyle}
                    >
                      <option value="">— alege rută —</option>
                      {/* Dacă valoarea curentă nu e în nomenclator, o păstrăm ca opțiune temporară */}
                      {r.Ruta && !routes.some(rt => rt.display_name === r.Ruta) && (
                        <option value={r.Ruta}>{r.Ruta} (custom)</option>
                      )}
                      {routes.map(rt => {
                        const departure = rt.time_nord?.split('-')[0].trim();
                        return (
                          <option key={rt.id} value={rt.display_name}>
                            {departure ? `${departure} · ${rt.display_name}` : rt.display_name}
                          </option>
                        );
                      })}
                    </select>
                  </td>
                  <td style={cs()}>
                    <select
                      value={r.Sofer}
                      onChange={e => updateCell(r.row_key, 'Sofer', e.target.value)}
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
                      onChange={e => updateCell(r.row_key, 'Masina', e.target.value)}
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
                      onChange={e => updateCell(r.row_key, 'NumarFoaie', e.target.value)} />
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
                      onChange={e => updateCell(r.row_key, 'DataFoaie', e.target.value)}
                      title={r.DataFoaie && r.DataFoaie !== docDate
                        ? `Foaia e introdusă în /grafic pe ${r.DataFoaie}, plata făcută pe ${docDate}`
                        : ''}
                    />
                  </td>
                  <td style={cs({ textAlign: 'center', color: pusLaText ? '#555' : '#bbb' })}
                    title={pusLaText
                      ? `Foaia a fost introdusă la ${pusLaText} (ora Chișinăului)`
                      : 'Foaia nu are corespondent în /grafic — nu se știe când a fost introdusă'}>
                    {pusLaText || '—'}
                  </td>
                  <td style={ns()}>{Math.round(r.Incasare)}</td>
                  <td style={ns()}>
                    <input type="number" min={0} style={editNumStyle} value={r.Ligotnici || ''}
                      onChange={e => updateCell(r.row_key, 'Ligotnici', Number(e.target.value) || 0)} />
                  </td>
                  <td style={ns()}>
                    <input type="number" min={0} style={editNumStyle} value={r.LigotniciGara || ''}
                      onChange={e => updateCell(r.row_key, 'LigotniciGara', Number(e.target.value) || 0)} />
                  </td>
                  <td style={ns()}>
                    <input type="number" min={0} step={0.01} style={editNumStyle} value={r.Diagrame || ''}
                      onChange={e => updateCell(r.row_key, 'Diagrame', Number(e.target.value) || 0)} />
                  </td>
                  <td style={ns()}>
                    <input type="number" min={0} step={0.01} style={editNumStyle} value={r.Combustibil || ''}
                      onChange={e => updateCell(r.row_key, 'Combustibil', Number(e.target.value) || 0)} />
                  </td>
                  <td style={ns()}>
                    <input type="number" min={0} step={0.01} style={editNumStyle} value={r.CheltuieliSupl || ''}
                      onChange={e => updateCell(r.row_key, 'CheltuieliSupl', Number(e.target.value) || 0)} />
                  </td>
                  <td style={cs()}>
                    <input style={editInputStyle} value={r.Comentariu}
                      onChange={e => updateCell(r.row_key, 'Comentariu', e.target.value)} />
                  </td>
                  <td style={cs({ textAlign: 'center' })}>
                    <button type="button" onClick={() => deleteRow(r.row_key)} title="Șterge rând"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c00', fontSize: 14 }}>×</button>
                  </td>
                </tr>
              );
            })}
            {!loading && displayRows.length === 0 && (
              <tr>
                <td colSpan={15} style={{ ...cellStyle, textAlign: 'center', padding: 20, color: '#888' }}>
                  {isFiltered
                    ? 'Niciun rând pentru ziua aleasă în filtru. Alege „toate zilele" în capul coloanei DataFoaie.'
                    : 'Nicio plată în Tomberon pentru această zi.'}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} style={{ ...headerCellStyle, textAlign: 'right' }}>
                {isFiltered ? 'TOTAL (doar ziua filtrată)' : 'TOTAL'}
              </td>
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
            {isFiltered && (
              <> · <span style={{ color: '#f57c00', fontWeight: 600 }}>{displayRows.length} afișate (filtru pe {dateFilter.split('-').reverse().join('.')})</span></>
            )}
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
        Click pe <b>Ruta</b>, <b>Șoferi</b>, <b>DataFoaie</b> sau <b>Pus la</b> sortează (al doilea click inversează);
        click pe <b>N</b> revine la ordinea inițială. <b>Pus la</b> = când s-a introdus foaia de parcurs (ora Chișinăului) —
        poate fi în altă zi decât DataFoaie, fiindcă foaia se pune adesea din ajun.
        Phase 1: doar interfața vizuală + editare locală + totaluri.
      </p>
    </div>
  );
}
