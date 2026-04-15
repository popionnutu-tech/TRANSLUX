'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getGraficData,
  getAssignmentDates,
  upsertAssignment,
  deleteAssignment,
  copyAssignments,
  updateReturRoute,
  type GraficRow,
  type DriverOption,
  type VehicleOption,
  type ReturRouteOption,
  type DateEntry,
} from './actions';

function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

function yesterdayOf(date: string): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

interface PopupState {
  row: GraficRow;
}

const DAY_NAMES_RO = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

export default function GraficClient({
  drivers,
  vehicles,
  returRoutes,
  dates: initialDates,
  readOnly = false,
}: {
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  returRoutes: ReturRouteOption[];
  dates: DateEntry[];
  readOnly?: boolean;
}) {
  const [date, setDate] = useState(todayChisinau);
  const [page, setPage] = useState<1 | 2>(1);
  const [rows, setRows] = useState<GraficRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');
  const tableRef = useRef<HTMLDivElement>(null);

  const [popDriverId, setPopDriverId] = useState('');
  const [popVehicleId, setPopVehicleId] = useState('');
  const [popVehicleRetId, setPopVehicleRetId] = useState('');
  const [returPopup, setReturPopup] = useState<GraficRow | null>(null);
  const [popReturRouteId, setPopReturRouteId] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadingEdinet, setDownloadingEdinet] = useState(false);
  const [dateEntries, setDateEntries] = useState<DateEntry[]>(initialDates);
  const [allData, setAllData] = useState<{ page1: GraficRow[]; page2: GraficRow[] } | null>(null);

  const refreshDates = useCallback(async () => {
    try { setDateEntries(await getAssignmentDates()); } catch {}
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getGraficData(date);
      setAllData(data);
      setRows(page === 1 ? data.page1 : data.page2);
    } catch (err: any) {
      setError(err.message || 'Eroare');
    } finally {
      setLoading(false);
    }
  }, [date, page]);

  useEffect(() => { loadData(); }, [loadData]);

  function openPopup(row: GraficRow) {
    setPopDriverId(row.driver_id || '');
    setPopVehicleId(row.vehicle_id || '');
    setPopVehicleRetId(row.vehicle_id_retur || '');
    setPopup({ row });
  }

  async function handleSave() {
    if (!popup || !popDriverId) return;
    setSaving(true);
    const res = await upsertAssignment(popup.row.crm_route_id, date, popDriverId, popVehicleId || null, popVehicleRetId || null);
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setPopup(null);
    loadData();
    refreshDates();
  }

  async function handleDelete() {
    if (!popup?.row.assignment_id) return;
    setSaving(true);
    const res = await deleteAssignment(popup.row.assignment_id);
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setPopup(null);
    loadData();
    refreshDates();
  }

  function openReturPopup(row: GraficRow) {
    if (!row.assignment_id) return; // can't set retur without assignment
    setPopReturRouteId(row.retur_route_id ? String(row.retur_route_id) : '');
    setReturPopup(row);
  }

  async function handleSaveRetur() {
    if (!returPopup?.assignment_id) return;
    setSaving(true);
    const res = await updateReturRoute(returPopup.assignment_id, popReturRouteId ? Number(popReturRouteId) : null, date);
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setReturPopup(null);
    loadData();
    refreshDates();
  }

  async function handleCopy() {
    setCopying(true);
    setError('');
    const res = await copyAssignments(yesterdayOf(date), date);
    setCopying(false);
    if (res.error) { setError(res.error); return; }
    loadData();
    refreshDates();
  }

  async function handleDownload() {
    if (!allData) return;

    const assignedP1 = allData.page1.filter(r => r.driver_id);
    const assignedP2 = allData.page2.filter(r => r.driver_id);
    const totalAssigned = assignedP1.length + assignedP2.length;
    const shouldMerge = totalAssigned < 14;

    setDownloading(true);
    try {
      const params = new URLSearchParams({ date });
      if (shouldMerge) {
        params.set('merge', '1');
      } else {
        params.set('page', String(page));
      }

      const res = await fetch(`/api/schedule-image?${params}`);
      if (!res.ok) throw new Error('Eroare la generare imagine');

      const blob = await res.blob();
      const link = document.createElement('a');
      link.download = shouldMerge
        ? `grafic-${formatDate(date)}.png`
        : `grafic-${formatDate(date)}-p${page}.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err: any) {
      setError(err.message || 'Eroare la descărcare');
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadEdinet() {
    setDownloadingEdinet(true);
    setError('');
    try {
      const params = new URLSearchParams({ date, type: 'edinet' });
      const res = await fetch(`/api/schedule-image?${params}`);
      if (!res.ok) throw new Error('Eroare la generare imagine');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.download = `grafic-edinet-${formatDate(date)}.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err: any) {
      setError(err.message || 'Eroare la descărcare');
    } finally {
      setDownloadingEdinet(false);
    }
  }

  /* ── Styles ── */
  const maroon = '#9B1B30';
  const maroonDark = '#6b1221';
  const maroonLight = '#f9f0f2';
  const rowBg1 = '#fdf6f0';
  const rowBg2 = '#f5ebe3';

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1>Grafic Zilnic</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {!readOnly && (
            <button className="btn btn-outline" onClick={handleCopy} disabled={copying}>
              {copying ? 'Se copiază...' : 'Copiază de ieri'}
            </button>
          )}
          <button className="btn btn-primary" onClick={handleDownload} disabled={downloading}>
            {downloading ? 'Se generează...' : 'Descarcă PNG'}
          </button>
          <button className="btn btn-primary" onClick={handleDownloadEdinet} disabled={downloadingEdinet}>
            {downloadingEdinet ? 'Se generează...' : 'Descarcă Edineț-Chișinău'}
          </button>
        </div>
      </div>

      {/* Page tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {([1, 2] as const).map((p) => (
          <button key={p} className={`btn ${page === p ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPage(p)}>
            Pagina {p} ({p === 1 ? '1-14' : '15-28'})
          </button>
        ))}
      </div>

      {/* ── Dates overview table ── */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 16,
        overflowX: 'auto',
      }}>
        {dateEntries.map((entry) => {
          const d = new Date(entry.date + 'T12:00:00');
          const dayName = DAY_NAMES_RO[d.getDay()];
          const dayNum = d.getDate();
          const mon = String(d.getMonth() + 1).padStart(2, '0');
          const isSelected = entry.date === date;
          const hasData = entry.count > 0;
          const isToday = entry.date === todayChisinau();

          return (
            <button
              key={entry.date}
              onClick={() => setDate(entry.date)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '6px 10px',
                borderRadius: 8,
                border: isSelected ? `2px solid ${maroon}` : '1px solid #e0e0e0',
                background: isSelected ? maroonLight : hasData ? '#e8f5e9' : '#fafafa',
                cursor: 'pointer',
                minWidth: 56,
                fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                transition: 'all 0.15s',
              }}
            >
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: isToday ? maroon : '#888',
                textTransform: 'uppercase',
              }}>
                {dayName}
              </span>
              <span style={{
                fontSize: 16,
                fontWeight: 700,
                color: isSelected ? maroon : '#333',
              }}>
                {dayNum}.{mon}
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: hasData ? '#2e7d32' : '#ccc',
                marginTop: 2,
              }}>
                {hasData ? `${entry.count} rute` : '—'}
              </span>
            </button>
          );
        })}
      </div>

      {error && <div style={{ color: '#c00', marginBottom: 8, fontSize: 14 }}>{error}</div>}

      {/* ── Schedule Table ── */}
      <div style={{ overflow: 'auto' }}>
        <div ref={tableRef} style={{ width: 900, padding: 16, background: '#fff', fontFamily: "'Open Sans', sans-serif" }}>

          {/* Table header with logo + date */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
            padding: '8px 0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <img src="/translux-logo-bordo.png" alt="TRANSLUX" style={{ height: 36, marginLeft: 75 }} />
            </div>
            <div style={{
              fontSize: 28,
              fontStyle: 'italic',
              fontWeight: 500,
              color: maroonDark,
              fontFamily: "'Cormorant Garamond', 'Georgia', serif",
              marginRight: 76,
            }}>
              Grafic din: {formatDate(date)}
            </div>
          </div>
          <div style={{
            textAlign: 'center',
            fontSize: 13,
            color: maroon,
            marginBottom: 8,
            fontWeight: 500,
          }}>
            Mai multe detalii: <span style={{ fontWeight: 700 }}>translux.md</span>
          </div>

          {/* Table */}
          <table className="grafic-table" style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: `2px solid ${maroon}`,
            fontSize: 14,
            tableLayout: 'fixed',
          }}>
            <colgroup>
              <col style={{ width: 10 }} />
              <col />
              <col style={{ width: 200 }} />
              <col style={{ width: 220 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="grafic-hdr">&nbsp;</th>
                <th className="grafic-hdr" style={{ textAlign: 'left', paddingLeft: 50 }}>Ruta</th>
                <th className="grafic-hdr" style={{ textAlign: 'center', lineHeight: 1.2 }}>Plecare din<br/>Chișinău</th>
                <th className="grafic-hdr" style={{ textAlign: 'center' }}>Nr. Șofer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.crm_route_id} style={{ background: i % 2 === 0 ? rowBg1 : rowBg2 }}>
                  {/* Row number */}
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, fontSize: 16, color: maroon }}>
                    &nbsp;
                  </td>

                  {/* De la Nord: time + route direction + stops */}
                  <td style={{ ...tdStyle, padding: '6px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: maroonDark, lineHeight: 1 }}>
                        {row.time_nord}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#333' }}>
                        {row.dest_to.replace(/^Chi[sș]in[aă]u\s*[-–]\s*/i, '')} - Chișinău
                      </span>
                    </div>
                    {row.stops && (
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                        {row.stops}
                      </div>
                    )}
                  </td>

                  {/* Plecare din Chișinău — clickable for retur route */}
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'center',
                      fontSize: 20,
                      fontWeight: 600,
                      color: maroonDark,
                      cursor: !readOnly && row.assignment_id ? 'pointer' : 'default',
                      transition: 'background 0.15s',
                    }}
                    onClick={() => !readOnly && row.assignment_id && openReturPopup(row)}
                    onMouseEnter={(e) => !readOnly && row.assignment_id && (e.currentTarget.style.background = maroonLight)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                    title={!readOnly && row.assignment_id ? 'Click pentru a schimba returul' : ''}
                  >
                    {row.time_chisinau}
                  </td>

                  {/* Nr. Șofer — clickable */}
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'center',
                      cursor: readOnly ? 'default' : 'pointer',
                      transition: 'background 0.15s',
                      padding: '4px 8px',
                    }}
                    onClick={() => !readOnly && openPopup(row)}
                    onMouseEnter={(e) => !readOnly && (e.currentTarget.style.background = maroonLight)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    {row.driver_phone ? (
                      <>
                        <div style={{ fontSize: 18, fontWeight: 700, color: maroonDark, lineHeight: 1.2 }}>
                          {row.driver_phone}
                        </div>
                        <div style={{ fontSize: 13, color: '#555' }}>
                          {row.driver_name}
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: 20, color: '#ccc' }}>+</span>
                    )}
                  </td>
                </tr>
              ))}

              {/* Empty rows to fill up to 14 (only when not downloading) */}
              {Array.from({ length: Math.max(0, 14 - rows.length) }).map((_, i) => (
                <tr key={`empty-${i}`} style={{ background: (rows.length + i) % 2 === 0 ? rowBg1 : rowBg2, height: 52 }}>
                  <td style={{ ...tdStyle, textAlign: 'center', color: '#ccc' }}>&nbsp;</td>
                  <td style={tdStyle}>&nbsp;</td>
                  <td style={tdStyle}>&nbsp;</td>
                  <td style={tdStyle}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Assignment popup ── */}
      {popup && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setPopup(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, minWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: maroonDark }}>
              Ruta #{popup.row.seq} — {popup.row.time_nord} {popup.row.dest_to}
            </h3>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#666' }}>Șofer</span>
              <select value={popDriverId} onChange={(e) => setPopDriverId(e.target.value)} style={selectStyle}>
                <option value="">— Selectează —</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </select>
            </label>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#666' }}>Auto (tur)</span>
              <select value={popVehicleId} onChange={(e) => setPopVehicleId(e.target.value)} style={selectStyle}>
                <option value="">— Fără —</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
              </select>
            </label>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: '#666' }}>Auto (retur)</span>
              <select value={popVehicleRetId} onChange={(e) => setPopVehicleRetId(e.target.value)} style={selectStyle}>
                <option value="">— Același —</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
              </select>
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !popDriverId}>
                {saving ? '...' : 'Salvează'}
              </button>
              {popup.row.assignment_id && (
                <button className="btn btn-outline" onClick={handleDelete} disabled={saving} style={{ color: '#c00', borderColor: '#c00' }}>
                  Șterge
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setPopup(null)}>Anulează</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Retur route popup ── */}
      {returPopup && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setReturPopup(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, minWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: maroonDark }}>
              Retur pentru ruta #{returPopup.seq}
            </h3>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: '#666' }}>Ruta de retur (plecare din Chișinău)</span>
              <select value={popReturRouteId} onChange={(e) => setPopReturRouteId(e.target.value)} style={selectStyle}>
                <option value="">— Același retur —</option>
                {returRoutes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSaveRetur} disabled={saving}>
                {saving ? '...' : 'Salvează'}
              </button>
              <button className="btn btn-outline" onClick={() => setReturPopup(null)}>Anulează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared cell styles ── */

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid rgba(155, 27, 48, 0.15)',
  borderRight: '1px solid rgba(155, 27, 48, 0.1)',
  verticalAlign: 'middle',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: 8,
  marginTop: 4,
  borderRadius: 6,
  border: '1px solid #ddd',
  fontSize: 14,
};
