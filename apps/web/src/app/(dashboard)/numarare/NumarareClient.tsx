'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getRoutesForDate,
  getRoutesForPeriod,
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
  type RouteForPeriod,
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
  const [dateTo, setDateTo] = useState(todayChisinau);
  const [routes, setRoutes] = useState<RouteForCounting[]>([]);
  const [periodRoutes, setPeriodRoutes] = useState<RouteForPeriod[]>([]);
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

  const isPeriod = dateTo > date;

  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
    getActiveDrivers().then(setDrivers);
    getActiveVehicles().then(setVehicles);
  }, []);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (dateTo > date) {
        const result = await getRoutesForPeriod(date, dateTo);
        if (result.error) setError(result.error);
        else {
          setPeriodRoutes(result.data || []);
          setRoutes([]);
        }
      } else {
        const result = await getRoutesForDate(date);
        if (result.error) setError(result.error);
        else {
          setRoutes(result.data || []);
          setPeriodRoutes([]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Eroare');
    } finally {
      setLoading(false);
    }
  }, [date, dateTo]);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-muted" style={{ fontSize: 13 }}>De la</span>
          <input
            type="date"
            value={date}
            onChange={e => {
              const v = e.target.value;
              setDate(v);
              if (v > dateTo) setDateTo(v);
              setOpenRouteId(null);
            }}
            className="form-control"
            style={{ width: 160 }}
          />
          <span className="text-muted" style={{ fontSize: 13 }}>până la</span>
          <input
            type="date"
            value={dateTo}
            min={date}
            onChange={e => { setDateTo(e.target.value); setOpenRouteId(null); }}
            className="form-control"
            style={{ width: 160 }}
          />
        </div>
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
            sessionStatus={openRoute.session_status || 'new'}
            savedTur={savedTur}
            savedRetur={savedRetur}
            onSaved={handleSaved}
            canSeeSums={canSeeSums}
          />
        </>
      ) : loading ? (
        <p className="text-muted">Se încarcă...</p>
      ) : isPeriod ? (
        <table className="table">
          <thead>
            <tr>
              <th>Tur</th>
              <th>Destinația</th>
              <th>Retur</th>
              <th>Curse</th>
              {canSeeSums && <th>Sumă (2 tarife)</th>}
              {canSeeSums && <th>Dacă 1 tarif</th>}
              {canSeeSums && <th>Δ</th>}
            </tr>
          </thead>
          <tbody>
            {periodRoutes.map(route => {
              const dualTotal = (Number(route.tur_total_lei) || 0) + (Number(route.retur_total_lei) || 0);
              const singleTotal = (Number(route.tur_single_lei) || 0) + (Number(route.retur_single_lei) || 0);
              const diff = dualTotal - singleTotal;
              const hasSums = dualTotal > 0 || singleTotal > 0;
              return (
                <tr key={route.crm_route_id}>
                  <td>{route.time_nord?.split(' - ')[0]}</td>
                  <td><strong>{route.dest_to_ro}</strong></td>
                  <td>{route.time_chisinau?.split(' - ')[0]}</td>
                  <td>{route.sessions_count}</td>
                  {canSeeSums && <td>{hasSums ? `${Math.round(dualTotal)} lei` : '—'}</td>}
                  {canSeeSums && <td>{hasSums ? `${Math.round(singleTotal)} lei` : '—'}</td>}
                  {canSeeSums && (
                    <td style={{ color: hasSums && diff > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                      {hasSums ? `${diff >= 0 ? '+' : ''}${Math.round(diff)} lei` : '—'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {canSeeSums && periodRoutes.length > 0 && (() => {
            const totalDual = periodRoutes.reduce((s, r) => s + (Number(r.tur_total_lei) || 0) + (Number(r.retur_total_lei) || 0), 0);
            const totalSingle = periodRoutes.reduce((s, r) => s + (Number(r.tur_single_lei) || 0) + (Number(r.retur_single_lei) || 0), 0);
            const totalDiff = totalDual - totalSingle;
            const totalSessions = periodRoutes.reduce((s, r) => s + r.sessions_count, 0);
            return (
              <tfoot>
                <tr>
                  <td colSpan={3}><strong>Total perioada</strong></td>
                  <td><strong>{totalSessions}</strong></td>
                  <td><strong>{Math.round(totalDual)} lei</strong></td>
                  <td><strong>{Math.round(totalSingle)} lei</strong></td>
                  <td style={{ color: totalDiff > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    <strong>{totalDiff >= 0 ? '+' : ''}{Math.round(totalDiff)} lei</strong>
                  </td>
                </tr>
              </tfoot>
            );
          })()}
        </table>
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
              {canSeeSums && <th>Sumă (2 tarife)</th>}
              {canSeeSums && <th>Dacă 1 tarif</th>}
              {canSeeSums && <th>Δ</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {routes.map(route => {
              const completed = route.session_status === 'completed';
              const ownedByOther = route.operator_id && route.operator_id !== currentUserId;
              const hasSums = route.tur_total_lei != null || route.retur_total_lei != null;
              const dualTotal = (Number(route.tur_total_lei) || 0) + (Number(route.retur_total_lei) || 0);
              const hasSingle = route.tur_single_lei != null || route.retur_single_lei != null;
              const singleTotal = (Number(route.tur_single_lei) || 0) + (Number(route.retur_single_lei) || 0);
              const diff = dualTotal - singleTotal;
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
                    <td>{hasSums ? `${Math.round(dualTotal)} lei` : '—'}</td>
                  )}
                  {canSeeSums && (
                    <td>{hasSingle ? `${Math.round(singleTotal)} lei` : '—'}</td>
                  )}
                  {canSeeSums && (
                    <td style={{ color: hasSingle && diff > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                      {hasSingle ? `${diff >= 0 ? '+' : ''}${Math.round(diff)} lei` : '—'}
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
          {canSeeSums && routes.length > 0 && (() => {
            const totalDual = routes.reduce((s, r) => s + (Number(r.tur_total_lei) || 0) + (Number(r.retur_total_lei) || 0), 0);
            const totalSingle = routes.reduce((s, r) => s + (Number(r.tur_single_lei) || 0) + (Number(r.retur_single_lei) || 0), 0);
            const totalDiff = totalDual - totalSingle;
            return (
              <tfoot>
                <tr>
                  <td colSpan={6}><strong>Total ziua</strong></td>
                  <td><strong>{Math.round(totalDual)} lei</strong></td>
                  <td><strong>{Math.round(totalSingle)} lei</strong></td>
                  <td style={{ color: totalDiff > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    <strong>{totalDiff >= 0 ? '+' : ''}{Math.round(totalDiff)} lei</strong>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            );
          })()}
        </table>
      )}
    </div>
  );
}
