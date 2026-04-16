'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getRoutesForDate,
  getCurrentUserId,
  lockRoute,
  unlockRoute,
  getRouteStops,
  getTariffConfig,
  loadSavedEntries,
  getActiveDrivers,
  getActiveVehicles,
  updateSessionDriverVehicle,
  type RouteForCounting,
  type RouteStop,
  type TariffConfig,
  type SavedEntry,
  type DriverOption,
  type VehicleOption,
} from './actions';
import CountingForm from './CountingForm';
import type { AdminRole } from '@translux/db';

function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

const selectStyle: React.CSSProperties = {
  padding: '4px 6px',
  border: '1px solid rgba(155,27,48,0.12)',
  borderRadius: 6,
  fontSize: 12,
  fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
  fontStyle: 'italic',
  background: 'rgba(255,255,255,0.9)',
  color: '#333',
  maxWidth: 140,
  cursor: 'pointer',
};

export default function NumarareClient({ role }: { role: AdminRole }) {
  const canSeeSums = role === 'ADMIN' || role === 'ADMIN_CAMERE';
  const [date, setDate] = useState(todayChisinau);
  const [routes, setRoutes] = useState<RouteForCounting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openRouteId, setOpenRouteId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [tariff, setTariff] = useState<TariffConfig | null>(null);
  const [savedTur, setSavedTur] = useState<SavedEntry[]>([]);
  const [savedRetur, setSavedRetur] = useState<SavedEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);

  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
    getActiveDrivers().then(setDrivers);
    getActiveVehicles().then(setVehicles);
  }, []);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getRoutesForDate(date);
      if (result.error) setError(result.error);
      else setRoutes(result.data || []);
    } catch (err: any) {
      setError(err.message || 'Eroare');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadRoutes();
    getTariffConfig(date).then(setTariff);
  }, [loadRoutes, date]);

  async function handleDriverChange(route: RouteForCounting, driverId: string) {
    const driver = drivers.find(d => d.id === driverId);
    setRoutes(prev => prev.map(r =>
      r.crm_route_id === route.crm_route_id
        ? { ...r, driver_id: driverId || null, driver_name: driver?.full_name || null }
        : r
    ));
    if (route.session_id) {
      await updateSessionDriverVehicle(route.session_id, driverId || null, route.vehicle_id);
    }
  }

  async function handleVehicleChange(route: RouteForCounting, vehicleId: string) {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    setRoutes(prev => prev.map(r =>
      r.crm_route_id === route.crm_route_id
        ? { ...r, vehicle_id: vehicleId || null, vehicle_plate: vehicle?.plate_number || null }
        : r
    ));
    if (route.session_id) {
      await updateSessionDriverVehicle(route.session_id, route.driver_id, vehicleId || null);
    }
  }

  async function handleOpen(route: RouteForCounting) {
    const result = await lockRoute(route.crm_route_id, date, route.driver_id, route.vehicle_id);
    if (result.error) {
      setError(result.error);
      return;
    }

    const routeStops = await getRouteStops(route.crm_route_id, 'tur');
    const sTur = result.sessionId ? await loadSavedEntries(result.sessionId, 'tur') : [];
    const sRetur = result.sessionId ? await loadSavedEntries(result.sessionId, 'retur') : [];

    setSessionId(result.sessionId || null);
    setStops(routeStops);
    setSavedTur(sTur);
    setSavedRetur(sRetur);
    setOpenRouteId(route.crm_route_id);
  }

  async function handleClose() {
    if (sessionId) {
      await unlockRoute(sessionId);
    }
    setOpenRouteId(null);
    setSessionId(null);
    setStops([]);
    setSavedTur([]);
    setSavedRetur([]);
    await loadRoutes();
  }

  function handleSaved() {
    loadRoutes();
  }

  function statusBadge(route: RouteForCounting) {
    if (!route.session_status) return <span className="text-muted">Neprocesat</span>;
    if (route.session_status === 'completed') return <span style={{ color: 'var(--success)' }}>Finalizat</span>;
    if (route.locked_by_email) return <span style={{ color: 'var(--warning)' }}>🔒 {route.locked_by_email}</span>;
    if (route.operator_id && route.operator_id !== currentUserId) {
      return <span style={{ color: 'var(--warning)' }}>🔒 {route.operator_email}</span>;
    }
    if (route.session_status === 'tur_done') return <span style={{ color: 'var(--primary)' }}>Tur gata</span>;
    return <span className="text-muted">Nou</span>;
  }

  const openRoute = routes.find(r => r.crm_route_id === openRouteId);

  return (
    <div>
      <div className="page-header">
        <h1>Numărare pasageri</h1>
        <input
          type="date"
          value={date}
          onChange={e => { setDate(e.target.value); setOpenRouteId(null); }}
          className="form-control"
          style={{ width: 180 }}
        />
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {openRoute && sessionId && tariff ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={handleClose}>← Înapoi</button>
            <strong>{openRoute.dest_to_ro}</strong>
            <select
              value={openRoute.driver_id || ''}
              onChange={e => handleDriverChange(openRoute, e.target.value)}
              disabled={openRoute.session_status === 'completed'}
              style={selectStyle}
            >
              <option value="">— Șofer —</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
            <select
              value={openRoute.vehicle_id || ''}
              onChange={e => handleVehicleChange(openRoute, e.target.value)}
              disabled={openRoute.session_status === 'completed'}
              style={selectStyle}
            >
              <option value="">— Mașina —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
            </select>
          </div>
          <CountingForm
            sessionId={sessionId}
            crmRouteId={openRoute.crm_route_id}
            stops={stops}
            tariff={tariff}
            doubleTariff={openRoute.double_tariff}
            sessionStatus={openRoute.session_status || 'new'}
            savedTur={savedTur}
            savedRetur={savedRetur}
            onSaved={handleSaved}
            canSeeSums={canSeeSums}
          />
        </>
      ) : loading ? (
        <p className="text-muted">Se încarcă...</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Tur</th>
              <th>Destinația</th>
              <th>Retur</th>
              <th>Șofer</th>
              <th>Mașina</th>
              <th>Status</th>
              {canSeeSums && <th>Sumă</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {routes.map(route => {
              const completed = route.session_status === 'completed';
              const ownedByOther = route.operator_id && route.operator_id !== currentUserId;
              return (
                <tr key={route.crm_route_id}>
                  <td>{route.time_nord?.split(' - ')[0]}</td>
                  <td><strong>{route.dest_to_ro}</strong></td>
                  <td>{route.time_chisinau?.split(' - ')[0]}</td>
                  <td>
                    <select
                      value={route.driver_id || ''}
                      onChange={e => handleDriverChange(route, e.target.value)}
                      disabled={completed}
                      style={selectStyle}
                    >
                      <option value="">—</option>
                      {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select
                      value={route.vehicle_id || ''}
                      onChange={e => handleVehicleChange(route, e.target.value)}
                      disabled={completed}
                      style={selectStyle}
                    >
                      <option value="">—</option>
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
                    </select>
                  </td>
                  <td>{statusBadge(route)}</td>
                  {canSeeSums && (
                    <td>
                      {route.tur_total_lei != null || route.retur_total_lei != null
                        ? `${(route.tur_total_lei || 0) + (route.retur_total_lei || 0)} lei`
                        : '—'}
                    </td>
                  )}
                  <td>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleOpen(route)}
                      disabled={completed || !!ownedByOther}
                    >
                      Deschide
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
