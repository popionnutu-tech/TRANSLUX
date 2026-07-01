'use client';

// Pagină «Audit» pentru operatori: a doua numărare ORB (nu vezi prima numărare).
// Reutilizează formularele și acțiunile existente. Comparația (diferența) rămâne doar la admin (în GO).
import { useState, useEffect, useCallback } from 'react';
import { TableSkeleton } from '@/components/Skeleton';
import {
  getRoutesForDate,
  getCurrentUserId,
  getRouteStops,
  getRouteStartDistrict,
  getTariffConfig,
  getActiveDrivers,
  getActiveVehicles,
  type RouteForCounting,
  type RouteStop,
  type TariffConfig,
  type SavedEntry,
  type DriverOption,
  type VehicleOption,
} from '../actions';
import CountingForm from '../CountingForm';
import SuburbanCountingForm from '../SuburbanCountingForm';
import { lockAudit, unlockAudit, loadAuditEntries } from '../auditActions';

function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

export default function AuditTab() {
  const [date, setDate] = useState(todayChisinau);
  const [routes, setRoutes] = useState<RouteForCounting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [openRouteId, setOpenRouteId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [startDistrict, setStartDistrict] = useState<string | null>(null);
  const [tariff, setTariff] = useState<TariffConfig | null>(null);
  const [savedTur, setSavedTur] = useState<SavedEntry[]>([]);
  const [savedRetur, setSavedRetur] = useState<SavedEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [routeTypeFilter, setRouteTypeFilter] = useState<'interurban' | 'suburban'>('interurban');

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

  async function handleOpenAudit(route: RouteForCounting) {
    if (!route.session_id) return;
    setInfo('');
    setError('');
    const lock = await lockAudit(route.session_id);
    if (lock.error) { setError(lock.error); return; }

    if (route.route_type === 'suburban') {
      setSessionId(route.session_id);
      setStops([]);
      setSavedTur([]);
      setSavedRetur([]);
      setOpenRouteId(route.crm_route_id);
      return;
    }

    const [routeStops, sd] = await Promise.all([
      getRouteStops(route.crm_route_id, 'tur'),
      getRouteStartDistrict(route.crm_route_id),
    ]);
    // Încarcă DOAR entries de audit (a doua numărare) — niciodată prima numărare a operatorului.
    const sTur = await loadAuditEntries(route.session_id, 'tur');
    const sRetur = await loadAuditEntries(route.session_id, 'retur');

    setSessionId(route.session_id);
    setStops(routeStops);
    setStartDistrict(sd);
    setSavedTur(sTur);
    setSavedRetur(sRetur);
    setOpenRouteId(route.crm_route_id);
  }

  async function handleClose() {
    if (sessionId) await unlockAudit(sessionId);
    setOpenRouteId(null);
    setSessionId(null);
    setStops([]);
    setSavedTur([]);
    setSavedRetur([]);
    await loadRoutes();
  }

  async function handleSaved(direction: 'tur' | 'retur') {
    // Operatorul NU vede comparația (diferența). La retur = audit complet → închide și revine la listă.
    if (direction === 'retur') {
      setInfo('Audit salvat ✅');
      setOpenRouteId(null);
      setSessionId(null);
      setStops([]);
      setSavedTur([]);
      setSavedRetur([]);
      await loadRoutes();
      return;
    }
    // tur salvat — rămâne în formă pentru retur; reîmprospătăm lista în fundal.
    await loadRoutes();
  }

  const openRoute = routes.find(r => r.crm_route_id === openRouteId);

  return (
    <div>
      <div className="page-header">
        <h1>Audit</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-muted" style={{ fontSize: 13 }}>Data</span>
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setOpenRouteId(null); }}
            className="form-control"
            style={{ width: 160 }}
          />
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {info && !openRoute && <div className="alert alert-success">{info}</div>}

      {openRoute && sessionId && tariff ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={handleClose}>← Înapoi</button>
            <strong>{openRoute.route_type === 'suburban' ? `${openRoute.dest_to_ro} - ${openRoute.dest_from_ro}` : openRoute.dest_to_ro}</strong>
            <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: 'rgba(155,27,48,0.08)', color: '#9B1B30', fontWeight: 600 }}>
              🔍 Audit orb — nu vezi prima numărare
            </span>
          </div>
          {openRoute.route_type === 'suburban' ? (
            <SuburbanCountingForm
              sessionId={sessionId}
              crmRouteId={openRoute.crm_route_id}
              date={date}
              tariff={tariff}
              canSeeSums={false}
              onSaved={handleSaved}
              drivers={drivers}
              vehicles={vehicles}
              mode="audit"
              viewOnly={false}
            />
          ) : (
            <CountingForm
              sessionId={sessionId}
              crmRouteId={openRoute.crm_route_id}
              stops={stops}
              tariff={tariff}
              sessionStatus={openRoute.audit_status || 'new'}
              savedTur={savedTur}
              savedRetur={savedRetur}
              onSaved={handleSaved}
              canSeeSums={false}
              mode="audit"
              viewOnly={false}
              startDistrict={startDistrict}
              canEditCompleted={true}
            />
          )}
        </>
      ) : loading ? (
        <TableSkeleton rows={8} cols={4} />
      ) : (
        <>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Reverificare oarbă: introdu din nou numărătoarea, fără să vezi prima numărare. Administratorul compară diferența.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className={`btn ${routeTypeFilter === 'interurban' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setRouteTypeFilter('interurban')}>Interurban</button>
            <button className={`btn ${routeTypeFilter === 'suburban' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setRouteTypeFilter('suburban')}>Suburban</button>
          </div>
          {(() => {
            const isSuburban = routeTypeFilter === 'suburban';
            const auditableRoutes = routes.filter(r =>
              r.route_type === routeTypeFilter &&
              (r.session_status === 'completed' || (r.route_type === 'suburban' && r.session_status === 'tur_done'))
            );
            if (auditableRoutes.length === 0) {
              return <p className="text-muted">Nicio cursă numărată disponibilă pentru audit la această dată.</p>;
            }
            return (
              <table className="table">
                <thead>
                  <tr>
                    <th>{isSuburban ? 'De la' : 'Tur'}</th>
                    <th>Destinația</th>
                    <th>{isSuburban ? 'Tip' : 'Retur'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {auditableRoutes.map(route => {
                    const lockedByOther = route.audit_locked_by_id && route.audit_locked_by_id !== currentUserId;
                    return (
                      <tr key={route.crm_route_id}>
                        <td>{route.route_type === 'suburban' ? route.dest_from_ro : route.time_nord?.split(' - ')[0]}</td>
                        <td><strong>{route.route_type === 'suburban' ? `${route.dest_to_ro} - ${route.dest_from_ro}` : route.dest_to_ro}</strong></td>
                        <td>{route.route_type === 'suburban' ? 'suburban' : route.time_chisinau?.split(' - ')[0]}</td>
                        <td>
                          {lockedByOther ? (
                            <span style={{ fontSize: 11, color: 'var(--warning)' }}>🔒 în audit</span>
                          ) : (
                            <button className="btn btn-outline" onClick={() => handleOpenAudit(route)} style={{ fontSize: 12 }}>
                              🔍 Audit orb
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </>
      )}
    </div>
  );
}
