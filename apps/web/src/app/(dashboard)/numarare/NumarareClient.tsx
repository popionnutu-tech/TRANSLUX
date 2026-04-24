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
import SuburbanCountingForm from './SuburbanCountingForm';
import { lockAudit, unlockAudit, resetAudit, loadAuditEntries } from './auditActions';
import AuditComparisonView from './AuditComparisonView';
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
  const [routeTypeFilter, setRouteTypeFilter] = useState<'interurban' | 'suburban'>('interurban');
  const [auditMode, setAuditMode] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [showComparison, setShowComparison] = useState<string | null>(null); // sessionId

  const canAudit = role === 'ADMIN' || role === 'ADMIN_CAMERE';

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

    setViewOnly(!!result.readOnly);

    if (route.route_type === 'suburban') {
      setSessionId(result.sessionId || null);
      setStops([]);
      setSavedTur([]);
      setSavedRetur([]);
      setOpenRouteId(route.crm_route_id);
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

  async function handleOpenAudit(route: RouteForCounting) {
    if (!route.session_id) return;
    const lock = await lockAudit(route.session_id);
    if (lock.error) { setError(lock.error); return; }

    if (route.route_type === 'suburban') {
      setSessionId(route.session_id);
      setAuditMode(true);
      setOpenRouteId(route.crm_route_id);
      return;
    }

    const routeStops = await getRouteStops(route.crm_route_id, 'tur');
    const sTur = await loadAuditEntries(route.session_id, 'tur');
    const sRetur = await loadAuditEntries(route.session_id, 'retur');

    setSessionId(route.session_id);
    setStops(routeStops);
    setSavedTur(sTur);
    setSavedRetur(sRetur);
    setAuditMode(true);
    setOpenRouteId(route.crm_route_id);
  }

  async function handleClose() {
    if (sessionId) {
      if (auditMode) await unlockAudit(sessionId);
      else if (!viewOnly) await unlockRoute(sessionId);
    }
    setOpenRouteId(null);
    setSessionId(null);
    setStops([]);
    setSavedTur([]);
    setSavedRetur([]);
    setAuditMode(false);
    setViewOnly(false);
    await loadRoutes();
  }

  async function handleSaved(direction: 'tur' | 'retur') {
    if (auditMode && direction === 'retur' && sessionId) {
      setShowComparison(sessionId);
      setOpenRouteId(null);
      setSessionId(null);
      setAuditMode(false);
      await loadRoutes();
      return;
    }
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

  if (showComparison) {
    return (
      <div>
        <AuditComparisonView
          sessionId={showComparison}
          onClose={() => setShowComparison(null)}
        />
      </div>
    );
  }

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

      {!openRoute && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            className={`btn ${routeTypeFilter === 'interurban' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setRouteTypeFilter('interurban')}
          >
            Interurban
          </button>
          <button
            className={`btn ${routeTypeFilter === 'suburban' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setRouteTypeFilter('suburban')}
          >
            Suburban
          </button>
        </div>
      )}

      {openRoute && sessionId && tariff ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={handleClose}>← Înapoi</button>
            <strong>{openRoute.dest_to_ro}</strong>
            {viewOnly && (
              <span style={{
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 6,
                background: 'rgba(155,27,48,0.08)',
                color: '#9B1B30',
                fontWeight: 600,
              }}>
                👁 Doar vizualizare — cursa aparține altui operator
              </span>
            )}
            <select
              value={openRoute.driver_id || ''}
              onChange={e => handleDriverChange(openRoute, e.target.value)}
              disabled={viewOnly || openRoute.session_status === 'completed'}
              style={selectStyle}
            >
              <option value="">— Șofer —</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
            <select
              value={openRoute.vehicle_id || ''}
              onChange={e => handleVehicleChange(openRoute, e.target.value)}
              disabled={viewOnly || openRoute.session_status === 'completed'}
              style={selectStyle}
            >
              <option value="">— Mașina —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
            </select>
          </div>
          {openRoute.route_type === 'suburban' ? (
            <SuburbanCountingForm
              sessionId={sessionId}
              crmRouteId={openRoute.crm_route_id}
              date={date}
              tariff={tariff}
              canSeeSums={canSeeSums}
              onSaved={handleSaved}
              drivers={drivers}
              vehicles={vehicles}
              mode={auditMode ? 'audit' : 'normal'}
              viewOnly={viewOnly}
            />
          ) : (
            <CountingForm
              sessionId={sessionId}
              crmRouteId={openRoute.crm_route_id}
              stops={stops}
              tariff={tariff}
              sessionStatus={auditMode ? (openRoute.audit_status || 'new') : (openRoute.session_status || 'new')}
              savedTur={savedTur}
              savedRetur={savedRetur}
              onSaved={handleSaved}
              canSeeSums={canSeeSums}
              mode={auditMode ? 'audit' : 'normal'}
              viewOnly={viewOnly}
            />
          )}
        </>
      ) : loading ? (
        <p className="text-muted">Se încarcă...</p>
      ) : isPeriod ? (
        <>
        {(() => { const filteredPeriodRoutes = periodRoutes.filter(r => r.route_type === routeTypeFilter); const isSuburban = routeTypeFilter === 'suburban'; return (<>
        {canSeeSums && filteredPeriodRoutes.length > 0 && (() => {
          const totalDual = filteredPeriodRoutes.reduce((s, r) => s + (Number(r.tur_total_lei) || 0) + (Number(r.retur_total_lei) || 0), 0);
          const totalSingle = filteredPeriodRoutes.reduce((s, r) => s + (Number(r.tur_single_lei) || 0) + (Number(r.retur_single_lei) || 0), 0);
          const totalDiff = totalDual - totalSingle;
          const totalSessions = filteredPeriodRoutes.reduce((s, r) => s + r.sessions_count, 0);
          return (
            <div className="card" style={{ display: 'flex', gap: 24, padding: 14, marginBottom: 12, flexWrap: 'wrap' }}>
              <div><span className="text-muted">Total perioada</span></div>
              <div><span className="text-muted">Curse:</span> <strong>{totalSessions}</strong></div>
              <div><span className="text-muted">{isSuburban ? 'Sumă:' : 'Sumă (2 tarife):'}</span> <strong>{Math.round(totalDual)} lei</strong></div>
              {!isSuburban && (<>
                <div><span className="text-muted">Dacă 1 tarif:</span> <strong>{Math.round(totalSingle)} lei</strong></div>
                <div>
                  <span className="text-muted">Δ:</span>{' '}
                  <strong style={{ color: totalDiff > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    {totalDiff >= 0 ? '+' : ''}{Math.round(totalDiff)} lei
                  </strong>
                </div>
              </>)}
            </div>
          );
        })()}
        <table className="table">
          <thead>
            <tr>
              <th>{isSuburban ? 'De la' : 'Tur'}</th>
              <th>Destinația</th>
              {!isSuburban && <th>Retur</th>}
              <th>Curse</th>
              {canSeeSums && <th>{isSuburban ? 'Sumă' : 'Sumă (2 tarife)'}</th>}
              {canSeeSums && !isSuburban && <th>Dacă 1 tarif</th>}
              {canSeeSums && !isSuburban && <th>Δ</th>}
            </tr>
          </thead>
          <tbody>
            {filteredPeriodRoutes.map(route => {
              const dualTotal = (Number(route.tur_total_lei) || 0) + (Number(route.retur_total_lei) || 0);
              const singleTotal = (Number(route.tur_single_lei) || 0) + (Number(route.retur_single_lei) || 0);
              const diff = dualTotal - singleTotal;
              const hasSums = dualTotal > 0 || singleTotal > 0;
              const auditTotal = (Number(route.audit_tur_total_lei) || 0) + (Number(route.audit_retur_total_lei) || 0);
              const hasAudit = route.audit_sessions_count > 0;
              const destinationLabel = route.route_type === 'suburban'
                ? `${route.dest_to_ro} - ${route.dest_from_ro}`
                : route.dest_to_ro;
              return (
                <tr key={route.crm_route_id}>
                  <td>{route.route_type === 'suburban' ? route.dest_from_ro : route.time_nord?.split(' - ')[0]}</td>
                  <td><strong>{destinationLabel}</strong></td>
                  {!isSuburban && <td>{route.time_chisinau?.split(' - ')[0]}</td>}
                  <td>{route.sessions_count}</td>
                  {canSeeSums && (
                    <td>
                      {hasSums ? `${Math.round(dualTotal)} lei` : '—'}
                      {hasAudit && (
                        <>
                          <br />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {Math.round(auditTotal)} lei (audit, {route.audit_sessions_count})
                          </span>
                        </>
                      )}
                    </td>
                  )}
                  {canSeeSums && !isSuburban && <td>{hasSums ? `${Math.round(singleTotal)} lei` : '—'}</td>}
                  {canSeeSums && !isSuburban && (
                    <td style={{ color: hasSums && diff > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                      {hasSums ? `${diff >= 0 ? '+' : ''}${Math.round(diff)} lei` : '—'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </>); })()}
        </>
      ) : (
        <>
        {(() => { const filteredRoutes = routes.filter(r => r.route_type === routeTypeFilter); return (<>
        {canSeeSums && filteredRoutes.length > 0 && (() => {
          const totalDual = filteredRoutes.reduce((s, r) => s + (Number(r.tur_total_lei) || 0) + (Number(r.retur_total_lei) || 0), 0);
          const totalSingle = filteredRoutes.reduce((s, r) => s + (Number(r.tur_single_lei) || 0) + (Number(r.retur_single_lei) || 0), 0);
          const totalDiff = totalDual - totalSingle;
          return (
            <div className="card" style={{ display: 'flex', gap: 24, padding: 14, marginBottom: 12, flexWrap: 'wrap' }}>
              <div><span className="text-muted">Total ziua</span></div>
              <div><span className="text-muted">{routeTypeFilter === 'suburban' ? 'Sumă:' : 'Sumă (2 tarife):'}</span> <strong>{Math.round(totalDual)} lei</strong></div>
              {routeTypeFilter !== 'suburban' && (<>
                <div><span className="text-muted">Dacă 1 tarif:</span> <strong>{Math.round(totalSingle)} lei</strong></div>
                <div>
                  <span className="text-muted">Δ:</span>{' '}
                  <strong style={{ color: totalDiff > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    {totalDiff >= 0 ? '+' : ''}{Math.round(totalDiff)} lei
                  </strong>
                </div>
              </>)}
            </div>
          );
        })()}
        <table className="table">
          <thead>
            <tr>
              <th>{routeTypeFilter === 'suburban' ? 'De la' : 'Tur'}</th>
              <th>Destinația</th>
              <th>{routeTypeFilter === 'suburban' ? 'Tip' : 'Retur'}</th>
              <th>Șofer</th>
              <th>Mașina</th>
              <th>Status</th>
              {canSeeSums && <th>{routeTypeFilter === 'suburban' ? 'Sumă' : 'Sumă (2 tarife)'}</th>}
              {canSeeSums && routeTypeFilter !== 'suburban' && <th>Dacă 1 tarif</th>}
              {canSeeSums && routeTypeFilter !== 'suburban' && <th>Δ</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredRoutes.map(route => {
              const completed = route.session_status === 'completed';
              const auditable = completed || (route.route_type === 'suburban' && route.session_status === 'tur_done');
              const ownedByOther = route.operator_id && route.operator_id !== currentUserId;
              const hasSums = route.tur_total_lei != null || route.retur_total_lei != null;
              const dualTotal = (Number(route.tur_total_lei) || 0) + (Number(route.retur_total_lei) || 0);
              const hasSingle = route.tur_single_lei != null || route.retur_single_lei != null;
              const singleTotal = (Number(route.tur_single_lei) || 0) + (Number(route.retur_single_lei) || 0);
              const diff = dualTotal - singleTotal;
              return (
                <tr key={route.crm_route_id}>
                  <td>{route.route_type === 'suburban' ? route.dest_from_ro : route.time_nord?.split(' - ')[0]}</td>
                  <td><strong>{route.route_type === 'suburban' ? `${route.dest_to_ro} - ${route.dest_from_ro}` : route.dest_to_ro}</strong></td>
                  <td>{route.route_type === 'suburban' ? 'suburban' : route.time_chisinau?.split(' - ')[0]}</td>
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
                      {hasSums ? `${Math.round(dualTotal)} lei` : '—'}
                      {route.audit_status === 'completed' && (
                        <>
                          <br />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {Math.round((Number(route.audit_tur_total_lei) || 0) + (Number(route.audit_retur_total_lei) || 0))} lei (audit)
                          </span>
                        </>
                      )}
                    </td>
                  )}
                  {canSeeSums && routeTypeFilter !== 'suburban' && (
                    <td>{hasSingle ? `${Math.round(singleTotal)} lei` : '—'}</td>
                  )}
                  {canSeeSums && routeTypeFilter !== 'suburban' && (
                    <td style={{ color: hasSingle && diff > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                      {hasSingle ? `${diff >= 0 ? '+' : ''}${Math.round(diff)} lei` : '—'}
                    </td>
                  )}
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleOpen(route)}
                        disabled={completed}
                        title={ownedByOther ? 'Deschidere doar pentru vizualizare' : undefined}
                      >
                        {ownedByOther ? 'Vezi' : 'Deschide'}
                      </button>
                      {canAudit && auditable && (!route.audit_locked_by_id || route.audit_locked_by_id === currentUserId) && (
                        <button
                          className="btn btn-outline"
                          onClick={async () => {
                            if (route.audit_status === 'completed') {
                              const ok = confirm('Ștergi auditul existent și începi unul nou?');
                              if (!ok) return;
                              if (route.session_id) {
                                const r = await resetAudit(route.session_id);
                                if (r.error) { setError(r.error); return; }
                              }
                            }
                            handleOpenAudit(route);
                          }}
                          style={{ fontSize: 12 }}
                        >
                          {route.audit_status === 'completed' ? '🔍 Refă audit' :
                            route.audit_status === 'tur_done' ? '🔍 Continuă audit' : '🔍 Audit'}
                        </button>
                      )}
                      {canAudit && route.audit_status === 'completed' && route.session_id && (
                        <button
                          className="btn btn-outline"
                          onClick={() => setShowComparison(route.session_id!)}
                          style={{ fontSize: 12 }}
                          title="Vezi comparația"
                        >
                          📊
                        </button>
                      )}
                      {canAudit && route.audit_locked_by_id && route.audit_locked_by_id !== currentUserId && (
                        <span style={{ fontSize: 11, color: 'var(--warning)' }}>🔒 {route.audit_locked_by_email}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </>); })()}
        </>
      )}
    </div>
  );
}
