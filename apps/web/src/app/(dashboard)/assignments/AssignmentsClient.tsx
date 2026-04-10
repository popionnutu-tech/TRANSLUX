'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getAssignmentsForDate,
  upsertAssignment,
  deleteAssignment,
  copyAssignments,
  updateDriverPhone,
  getDaysCoverage,
  type AssignmentRow,
  type DriverOption,
  type VehicleOption,
  type ReturRouteOption,
} from './actions';

function formatTimeRange(display: string) {
  // "18:55 - 00:01" → "18:55"
  const match = display.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : display;
}

function todayStr() {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' })
  )
    .toISOString()
    .slice(0, 10);
}

function yesterdayStr(date: string) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function AssignmentsClient({
  drivers,
  vehicles,
  returRoutes,
}: {
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  returRoutes: ReturRouteOption[];
}) {
  const [date, setDate] = useState(todayStr);
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');
  const [coverage, setCoverage] = useState<{ date: string; count: number }[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getAssignmentsForDate(date);
      if (result.error) {
        setError(result.error);
      } else {
        setRows(result.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Eroare necunoscută');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadData();
    getDaysCoverage().then(setCoverage).catch(() => {});
  }, [loadData]);

  async function handleSave(crmRouteId: number, driverId: string, vehicleId: string | null, vehicleIdRetur?: string | null, returRouteId?: number | null) {
    if (!driverId) return;
    setSaving((p) => ({ ...p, [crmRouteId]: true }));
    setError('');
    try {
      const result = await upsertAssignment(crmRouteId, date, driverId, vehicleId, vehicleIdRetur, returRouteId);
      if (result.error) {
        setError(result.error);
      } else {
        await loadData();
      }
    } catch (err: any) {
      setError(err.message || 'Eroare necunoscută');
    } finally {
      setSaving((p) => ({ ...p, [crmRouteId]: false }));
    }
  }

  async function handleDelete(assignmentId: string) {
    setError('');
    try {
      const result = await deleteAssignment(assignmentId);
      if (result.error) {
        setError(result.error);
      } else {
        await loadData();
      }
    } catch (err: any) {
      setError(err.message || 'Eroare necunoscută');
    }
  }

  async function handleCopy() {
    setCopying(true);
    setError('');
    try {
      const result = await copyAssignments(yesterdayStr(date), date);
      if (result.error) {
        setError(result.error);
      } else {
        await loadData();
      }
    } catch (err: any) {
      setError(err.message || 'Eroare necunoscută');
    } finally {
      setCopying(false);
    }
  }

  const assignedCount = rows.filter((r) => r.driver_id).length;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Programare zilnică</h1>
      </div>

      <div className="card mb-4">
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <button
            className="btn btn-outline"
            onClick={handleCopy}
            disabled={copying || loading}
          >
            {copying ? 'Se copiază...' : 'Copiază de ieri'}
          </button>
        </div>
        {error && (
          <p style={{ color: 'var(--danger)', fontSize: 14, marginTop: 8 }}>{error}</p>
        )}
        {coverage.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {coverage.map(c => {
              const d = new Date(c.date + 'T12:00:00');
              const label = d.toLocaleDateString('ro', { weekday: 'short', day: 'numeric', month: 'short' });
              const ok = c.count > 0;
              return (
                <button
                  key={c.date}
                  onClick={() => setDate(c.date)}
                  style={{
                    padding: '4px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                    border: c.date === date ? '2px solid #9B1B30' : '1px solid rgba(155,27,48,0.06)',
                    background: ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)',
                    color: ok ? '#16a34a' : '#dc2626',
                    fontWeight: c.date === date ? 700 : 400,
                  }}
                >
                  {label} {ok ? `(${c.count})` : '—'}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!loading && assignedCount === 0 && rows.length > 0 && (
        <div className="card mb-4" style={{
          background: 'rgba(155,27,48,0.04)',
          border: '1px solid rgba(155,27,48,0.15)',
          textAlign: 'center',
          padding: '20px 16px',
        }}>
          <p style={{ margin: '0 0 12px', color: '#666', fontSize: 14 }}>
            Nu există programări pentru această zi.
          </p>
          <button
            className="btn btn-primary"
            onClick={handleCopy}
            disabled={copying}
            style={{ fontSize: 15, padding: '10px 28px' }}
          >
            {copying ? 'Se copiază...' : 'Copiază programarea de ieri'}
          </button>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3>Tur-retur</h3>
          <span className="text-muted" style={{ fontSize: 14 }}>
            {assignedCount} / {rows.length} programate
          </span>
        </div>

        {loading ? (
          <p className="text-muted text-center">Se încarcă...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Tur</th>
                <th>Destinația</th>
                <th style={{ width: 150 }}>Retur</th>
                <th>Șofer</th>
                <th>Auto</th>
                <th style={{ width: 140 }}>Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <AssignmentRowEditor
                  key={row.crm_route_id}
                  row={row}
                  drivers={drivers}
                  vehicles={vehicles}
                  returRoutes={returRoutes}
                  rows={rows}
                  saving={!!saving[row.crm_route_id]}
                  onSave={handleSave}
                  onDelete={handleDelete}
                />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted">
                    Nu există rute în orar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AssignmentRowEditor({
  row,
  drivers,
  vehicles,
  returRoutes,
  rows,
  saving,
  onSave,
  onDelete,
}: {
  row: AssignmentRow;
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  returRoutes: ReturRouteOption[];
  rows: AssignmentRow[];
  saving: boolean;
  onSave: (crmRouteId: number, driverId: string, vehicleId: string | null, vehicleIdRetur?: string | null, returRouteId?: number | null) => void;
  onDelete: (assignmentId: string) => void;
}) {
  const [driverId, setDriverId] = useState(row.driver_id || '');
  const [vehicleId, setVehicleId] = useState(row.vehicle_id || '');
  const [vehicleIdRetur, setVehicleIdRetur] = useState(row.vehicle_id_retur || '');
  const [showReturVehicle, setShowReturVehicle] = useState(!!row.vehicle_id_retur);
  const [returRouteId, setReturRouteId] = useState<number | null>(row.retur_route_id);
  const [showReturRoute, setShowReturRoute] = useState(!!row.retur_route_id);
  const [editPhone, setEditPhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  useEffect(() => {
    setDriverId(row.driver_id || '');
    setVehicleId(row.vehicle_id || '');
    setVehicleIdRetur(row.vehicle_id_retur || '');
    setShowReturVehicle(!!row.vehicle_id_retur);
    setReturRouteId(row.retur_route_id);
    setShowReturRoute(!!row.retur_route_id);
  }, [row.driver_id, row.vehicle_id, row.vehicle_id_retur, row.retur_route_id]);

  const selectedDriver = drivers.find(d => d.id === driverId);
  const isDirty = driverId !== (row.driver_id || '') || vehicleId !== (row.vehicle_id || '') || vehicleIdRetur !== (row.vehicle_id_retur || '') || (returRouteId ?? null) !== (row.retur_route_id ?? null);

  // Check for retur conflicts: another row already claims the same retur
  const hasReturConflict = returRouteId && rows.some(
    r => r.crm_route_id !== row.crm_route_id && r.retur_route_id === returRouteId
  );

  const router = useRouter();

  async function handlePhoneSave() {
    if (!driverId || !phone.trim()) return;
    setSavingPhone(true);
    try {
      const result = await updateDriverPhone(driverId, phone);
      if (result.error) {
        alert(result.error);
      } else {
        setEditPhone(false);
        router.refresh();
      }
    } catch (err: any) {
      alert(err.message || 'Eroare necunoscută');
    } finally {
      setSavingPhone(false);
    }
  }

  return (
    <tr>
      <td>{formatTimeRange(row.time_chisinau)}</td>
      <td>{row.dest_to_ro}</td>
      <td style={returRouteId ? { background: 'rgba(155, 27, 48, 0.06)' } : undefined}>
        <span>{formatTimeRange(row.time_nord)}</span>
        {showReturRoute ? (
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#9B1B30', fontWeight: 600 }}>Alt:</span>
            <select
              value={returRouteId ?? ''}
              onChange={(e) => setReturRouteId(e.target.value ? Number(e.target.value) : null)}
              style={{ minWidth: 120, fontSize: 12 }}
            >
              <option value="">— Același</option>
              {returRoutes
                .filter(r => r.id !== row.crm_route_id)
                .map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
            </select>
            <button
              onClick={() => { setShowReturRoute(false); setReturRouteId(null); }}
              style={{ fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', color: '#999' }}
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowReturRoute(true)}
            style={{ display: 'block', marginTop: 2, fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', color: '#9B1B30', padding: 0 }}
          >
            + Alt retur
          </button>
        )}
        {hasReturConflict && (
          <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>
            ⚠ Conflict retur
          </div>
        )}
      </td>
      <td>
        <select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          style={{ minWidth: 160 }}
        >
          <option value="">— Fără șofer</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
        {driverId && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {selectedDriver?.phone ? (
              <span>📞 {selectedDriver.phone}</span>
            ) : editPhone ? (
              <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="069XXXXXX"
                  style={{ width: 100, fontSize: 11, padding: '2px 4px' }}
                />
                <button onClick={handlePhoneSave} disabled={savingPhone} style={{ fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', color: '#16a34a' }}>
                  {savingPhone ? '...' : '✓'}
                </button>
                <button onClick={() => setEditPhone(false)} style={{ fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', color: '#999' }}>✕</button>
              </span>
            ) : (
              <button onClick={() => setEditPhone(true)} style={{ fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626', textDecoration: 'underline' }}>
                + Adaugă telefon
              </button>
            )}
          </div>
        )}
      </td>
      <td>
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          style={{ minWidth: 120 }}
        >
          <option value="">— Fără auto</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate_number}
            </option>
          ))}
        </select>
        {showReturVehicle ? (
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#888' }}>Retur:</span>
            <select
              value={vehicleIdRetur}
              onChange={(e) => setVehicleIdRetur(e.target.value)}
              style={{ minWidth: 100, fontSize: 12 }}
            >
              <option value="">— Același</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number}
                </option>
              ))}
            </select>
            <button
              onClick={() => { setShowReturVehicle(false); setVehicleIdRetur(''); }}
              style={{ fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', color: '#999' }}
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowReturVehicle(true)}
            style={{ display: 'block', marginTop: 2, fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', color: '#9B1B30', padding: 0 }}
          >
            + Alt auto retur
          </button>
        )}
      </td>
      <td>
        <div className="flex gap-2">
          {driverId && isDirty && (
            <button
              className="btn btn-primary"
              onClick={() => onSave(row.crm_route_id, driverId, vehicleId || null, vehicleIdRetur || null, returRouteId)}
              disabled={saving}
              style={{ fontSize: 13, padding: '4px 10px' }}
            >
              {saving ? '...' : 'Salvează'}
            </button>
          )}
          {row.id && (
            <button
              className="btn btn-danger"
              onClick={() => onDelete(row.id!)}
              style={{ fontSize: 13, padding: '4px 10px' }}
            >
              Șterge
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
