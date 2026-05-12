'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from '@translux/db';
import { createRoute, toggleRoute, deleteRoute } from './actions';

export default function RoutesClient({ initialRoutes }: { initialRoutes: Route[] }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createRoute(name);
      setName('');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    await toggleRoute(id, !active);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Sigur vrei să ștergi această rută?')) return;
    try {
      await deleteRoute(id);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Rute</h1>
      </div>

      <div className="card mb-4">
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>Numele rutei</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Chișinău - Bălți"
              required
            />
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
              <th>Nume</th>
              <th>Status</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {initialRoutes.map((route) => (
              <tr key={route.id} style={{ opacity: route.active ? 1 : 0.5 }}>
                <td>{route.name}</td>
                <td>
                  <span className={`badge ${route.active ? 'badge-ok' : 'badge-absent'}`}>
                    {route.active ? 'Activ' : 'Inactiv'}
                  </span>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-outline"
                      onClick={() => handleToggle(route.id, route.active)}
                    >
                      {route.active ? 'Dezactivează' : 'Activează'}
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDelete(route.id)}>
                      Șterge
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {initialRoutes.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-muted">
                  Nu există rute.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
