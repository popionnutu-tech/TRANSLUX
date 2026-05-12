'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getActiveDriversForPicker,
  getRoutesForAssign,
  type DriverOption,
  type RouteForAssign,
} from './incasareActions';

interface Props {
  open: boolean;
  receiptNr: string;
  ziua: string;
  onConfirm: (driverId: string, ziua: string) => Promise<void>;
  onClose: () => void;
}

export default function RouteAssignModal({ open, receiptNr, ziua, onConfirm, onClose }: Props) {
  const [date, setDate] = useState<string>(ziua);
  const [routes, setRoutes] = useState<RouteForAssign[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Reset state când deschizi modalul
  useEffect(() => {
    if (!open) return;
    setDate(ziua);
    setSelectedRouteId(null);
    setSelectedDriverId('');
    setFilter('');
    setErr('');
  }, [open, ziua]);

  // Încarcă rutele când se schimbă data
  useEffect(() => {
    if (!open || !date) return;
    setLoading(true);
    getRoutesForAssign(date)
      .then(setRoutes)
      .finally(() => setLoading(false));
  }, [open, date]);

  // Încarcă lista completă de șoferi (pentru schimbare manuală)
  useEffect(() => {
    if (open && drivers.length === 0) {
      getActiveDriversForPicker().then(setDrivers);
    }
  }, [open, drivers.length]);

  const selectedRoute = useMemo(
    () => routes.find(r => r.crm_route_id === selectedRouteId) || null,
    [routes, selectedRouteId],
  );

  // Când e aleasă o rută, auto-completăm șoferul (dacă e atribuit în /grafic)
  useEffect(() => {
    if (selectedRoute && selectedRoute.driver_id) {
      setSelectedDriverId(selectedRoute.driver_id);
    }
  }, [selectedRoute]);

  const filteredDrivers = useMemo(
    () => drivers.filter(d => d.full_name.toLowerCase().includes(filter.toLowerCase())),
    [drivers, filter],
  );

  if (!open) return null;

  async function handleSubmit() {
    if (!selectedDriverId) { setErr('Alege un șofer'); return; }
    setBusy(true); setErr('');
    try {
      await onConfirm(selectedDriverId, date);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Eroare');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div className="card" style={{
        background: 'var(--bg)', padding: 20, minWidth: 560, maxWidth: 720,
        maxHeight: '85vh', overflow: 'auto',
      }}>
        <h3 style={{ margin: '0 0 4px 0' }}>Atribuie foaia la o rută</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: '0 0 14px 0' }}>
          Foaia <strong style={{ fontFamily: 'var(--font-mono)' }}>#{receiptNr}</strong>
          {' · plata din casă pe '}<strong>{ziua}</strong>
        </p>

        {/* Selector dată */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ziua/grafic:</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="form-control"
            style={{ width: 160 }}
          />
          {date !== ziua && (
            <span className="text-muted" style={{ fontSize: 11 }}>
              (diferit de ziua plății — atribuim pe altă zi)
            </span>
          )}
        </div>

        {/* Lista de rute */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            Rută din /grafic ({routes.length})
          </label>
          {loading ? (
            <p className="text-muted" style={{ fontSize: 12, textAlign: 'center', padding: 12 }}>Se încarcă...</p>
          ) : routes.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 12, textAlign: 'center', padding: 12 }}>
              Nicio rută în /grafic pe această zi.
            </p>
          ) : (
            <div style={{
              maxHeight: 240, overflow: 'auto',
              border: '1px solid var(--border)', borderRadius: 4,
            }}>
              {routes.map(r => (
                <button
                  key={r.crm_route_id}
                  type="button"
                  onClick={() => setSelectedRouteId(r.crm_route_id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1fr 1fr 80px',
                    gap: 8,
                    padding: '6px 10px',
                    width: '100%',
                    textAlign: 'left',
                    fontSize: 12,
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: selectedRouteId === r.crm_route_id ? 'var(--primary-dim)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{r.time_nord || '—'}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.route_name}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.driver_name || <span className="text-muted">—</span>}
                  </span>
                  <span className="text-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {r.vehicle_plate || '—'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Driver picker (auto-completat din rută, dar editabil) */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            Șofer
            {selectedRoute && selectedRoute.driver_id === selectedDriverId && (
              <span className="text-muted" style={{ fontSize: 11, marginLeft: 8 }}>
                (auto-completat din rută — poți schimba)
              </span>
            )}
          </label>
          <input
            type="text"
            placeholder="Caută șofer pentru a schimba..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="form-control"
            style={{ width: '100%', marginBottom: 6, fontSize: 13 }}
          />
          <select
            value={selectedDriverId}
            onChange={e => setSelectedDriverId(e.target.value)}
            size={6}
            className="form-control"
            style={{ width: '100%', fontSize: 13 }}
          >
            <option value="">— alege șofer —</option>
            {filteredDrivers.map(d => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </select>
        </div>

        {err && (
          <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{err}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="btn" disabled={busy}>Anulează</button>
          <button type="button" onClick={handleSubmit} className="btn btn-primary" disabled={busy || !selectedDriverId}>
            {busy ? 'Se salvează...' : 'Atribuie'}
          </button>
        </div>
      </div>
    </div>
  );
}
