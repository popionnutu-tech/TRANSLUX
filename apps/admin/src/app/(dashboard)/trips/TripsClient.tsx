'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route, DirectionEnum } from '@translux/db';
import { DIRECTION_LABELS } from '@translux/db';
import { createTrip, toggleTrip, deleteTrip } from './actions';
import type { TripWithRoute } from './actions';

export default function TripsClient({
  initialTrips,
  routes,
}: {
  initialTrips: TripWithRoute[];
  routes: Route[];
}) {
  const [routeId, setRouteId] = useState('');
  const [direction, setDirection] = useState<DirectionEnum>('CHISINAU_BALTI');
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createTrip(routeId, direction, time);
      setTime('');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    await toggleTrip(id, !active);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Sigur vrei să ștergi această cursă?')) return;
    try {
      await deleteTrip(id);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const formatTime = (t: string) => t.slice(0, 5);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Curse</h1>
      </div>

      <div className="card mb-4">
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ minWidth: 200, marginBottom: 0 }}>
            <label>Ruta</label>
            <select value={routeId} onChange={(e) => setRouteId(e.target.value)} required>
              <option value="">Selectează ruta</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 200, marginBottom: 0 }}>
            <label>Direcția</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as DirectionEnum)}
            >
              <option value="CHISINAU_BALTI">{DIRECTION_LABELS.CHISINAU_BALTI}</option>
              <option value="BALTI_CHISINAU">{DIRECTION_LABELS.BALTI_CHISINAU}</option>
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 120, marginBottom: 0 }}>
            <label>Ora plecării</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Se salvează...' : 'Adaugă'}
          </button>
        </form>
        {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginTop: 8 }}>{error}</p>}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Ruta</th>
              <th>Direcția</th>
              <th>Ora</th>
              <th>Status</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {initialTrips.map((trip) => (
              <tr key={trip.id} style={{ opacity: trip.active ? 1 : 0.5 }}>
                <td>{trip.routes?.name || '—'}</td>
                <td>{DIRECTION_LABELS[trip.direction]}</td>
                <td>{formatTime(trip.departure_time)}</td>
                <td>
                  <span className={`badge ${trip.active ? 'badge-ok' : 'badge-absent'}`}>
                    {trip.active ? 'Activ' : 'Inactiv'}
                  </span>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-outline"
                      onClick={() => handleToggle(trip.id, trip.active)}
                    >
                      {trip.active ? 'Dezactivează' : 'Activează'}
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDelete(trip.id)}>
                      Șterge
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {initialTrips.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted">
                  Nu există curse.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
