'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getRoutesForDate,
  lockRoute,
  unlockRoute,
  getRouteStops,
  getTariffConfig,
  loadSavedEntries,
  type RouteForCounting,
  type RouteStop,
  type TariffConfig,
  type SavedEntry,
} from './actions';
import CountingForm from './CountingForm';

function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

export default function NumarareClient() {
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
    getTariffConfig().then(setTariff);
  }, [loadRoutes]);

  async function handleOpen(crmRouteId: number) {
    const result = await lockRoute(crmRouteId, date);
    if (result.error) {
      setError(result.error);
      return;
    }

    const routeStops = await getRouteStops(crmRouteId, 'tur');
    const sTur = result.sessionId ? await loadSavedEntries(result.sessionId, 'tur') : [];
    const sRetur = result.sessionId ? await loadSavedEntries(result.sessionId, 'retur') : [];

    setSessionId(result.sessionId || null);
    setStops(routeStops);
    setSavedTur(sTur);
    setSavedRetur(sRetur);
    setOpenRouteId(crmRouteId);
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
    if (route.locked_by_email) return <span style={{ color: 'var(--warning)' }}>🔒 {route.locked_by_email}</span>;
    if (route.session_status === 'tur_done') return <span style={{ color: 'var(--primary)' }}>Tur gata</span>;
    if (route.session_status === 'completed') return <span style={{ color: 'var(--success)' }}>✅ Finalizat</span>;
    return <span className="text-muted">Nou</span>;
  }

  const openRoute = routes.find(r => r.crm_route_id === openRouteId);

  return (
    <div className="page">
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

      {loading ? (
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
              <th>Sumă</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {routes.map(route => (
              <>
                <tr key={route.crm_route_id}>
                  <td>{route.time_chisinau}</td>
                  <td><strong>{route.dest_to_ro}</strong></td>
                  <td>{route.time_nord}</td>
                  <td>{route.driver_name || '—'}</td>
                  <td>{route.vehicle_plate || '—'}</td>
                  <td>{statusBadge(route)}</td>
                  <td>
                    {route.tur_total_lei != null || route.retur_total_lei != null
                      ? `${(route.tur_total_lei || 0) + (route.retur_total_lei || 0)} lei`
                      : '—'}
                  </td>
                  <td>
                    {openRouteId === route.crm_route_id ? (
                      <button className="btn btn-outline" onClick={handleClose}>Închide</button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        onClick={() => handleOpen(route.crm_route_id)}
                        disabled={route.session_status === 'completed'}
                      >
                        Deschide
                      </button>
                    )}
                  </td>
                </tr>
                {openRouteId === route.crm_route_id && sessionId && tariff && (
                  <tr key={`${route.crm_route_id}-form`}>
                    <td colSpan={8} style={{ padding: 0 }}>
                      <CountingForm
                        sessionId={sessionId}
                        crmRouteId={route.crm_route_id}
                        stops={stops}
                        tariff={tariff}
                        doubleTariff={route.double_tariff}
                        sessionStatus={route.session_status || 'new'}
                        savedTur={savedTur}
                        savedRetur={savedRetur}
                        onSaved={handleSaved}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
