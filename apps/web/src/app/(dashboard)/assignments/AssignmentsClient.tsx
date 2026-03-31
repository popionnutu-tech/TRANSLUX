'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getAssignmentsForDate,
  upsertAssignment,
  deleteAssignment,
  copyAssignments,
  type AssignmentRow,
  type DriverOption,
  type VehicleOption,
  type ScheduleDirection,
} from './actions';

function formatTimeRange(display: string) {
  // "18:55 - 00:01" → "18:55"
  const match = display.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : display;
}

const DIRECTION_LABELS: Record<ScheduleDirection, string> = {
  CHISINAU_NORD: 'Chișinău → Nord',
  NORD_CHISINAU: 'Nord → Chișinău',
};

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

function formatTime(t: string) {
  return t.slice(0, 5);
}

export default function AssignmentsClient({
  drivers,
  vehicles,
}: {
  drivers: DriverOption[];
  vehicles: VehicleOption[];
}) {
  const [date, setDate] = useState(todayStr);
  const [direction, setDirection] = useState<ScheduleDirection>('CHISINAU_NORD');
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAssignmentsForDate(date, direction);
      setRows(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date, direction]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSave(crmRouteId: number, driverId: string, vehicleId: string | null) {
    if (!driverId) return;
    setSaving((p) => ({ ...p, [crmRouteId]: true }));
    setError('');
    try {
      await upsertAssignment(crmRouteId, date, direction, driverId, vehicleId);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving((p) => ({ ...p, [crmRouteId]: false }));
    }
  }

  async function handleDelete(assignmentId: string) {
    setError('');
    try {
      await deleteAssignment(assignmentId);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCopy() {
    setCopying(true);
    setError('');
    try {
      await copyAssignments(yesterdayStr(date), date, direction);
      await loadData();
    } catch (err: any) {
      setError(err.message);
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
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Direcția</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as ScheduleDirection)}
            >
              <option value="CHISINAU_NORD">{DIRECTION_LABELS.CHISINAU_NORD}</option>
              <option value="NORD_CHISINAU">{DIRECTION_LABELS.NORD_CHISINAU}</option>
            </select>
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
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3>{DIRECTION_LABELS[direction]}</h3>
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
                <th style={{ width: 70 }}>Ora</th>
                <th>Destinația</th>
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
                  saving={!!saving[row.crm_route_id]}
                  onSave={handleSave}
                  onDelete={handleDelete}
                />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
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
  saving,
  onSave,
  onDelete,
}: {
  row: AssignmentRow;
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  saving: boolean;
  onSave: (crmRouteId: number, driverId: string, vehicleId: string | null) => void;
  onDelete: (assignmentId: string) => void;
}) {
  const [driverId, setDriverId] = useState(row.driver_id || '');
  const [vehicleId, setVehicleId] = useState(row.vehicle_id || '');

  useEffect(() => {
    setDriverId(row.driver_id || '');
    setVehicleId(row.vehicle_id || '');
  }, [row.driver_id, row.vehicle_id]);

  const isDirty = driverId !== (row.driver_id || '') || vehicleId !== (row.vehicle_id || '');

  return (
    <tr>
      <td>{formatTimeRange(row.time_display)}</td>
      <td>{row.dest_to_ro}</td>
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
      </td>
      <td>
        <div className="flex gap-2">
          {driverId && isDirty && (
            <button
              className="btn btn-primary"
              onClick={() => onSave(row.crm_route_id, driverId, vehicleId || null)}
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
