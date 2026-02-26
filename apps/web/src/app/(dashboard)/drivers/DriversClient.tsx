'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Driver } from '@translux/db';
import { createDriver, toggleDriver, deleteDriver } from './actions';

export default function DriversClient({ initialDrivers }: { initialDrivers: Driver[] }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createDriver(name);
      setName('');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    await toggleDriver(id, !active);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Sigur vrei să ștergi acest șofer?')) return;
    try {
      await deleteDriver(id);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Șoferi</h1>
      </div>

      <div className="card mb-4">
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>Numele complet</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Moldovan Ion"
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
              <th>Nume complet</th>
              <th>Status</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {initialDrivers.map((driver) => (
              <tr key={driver.id} style={{ opacity: driver.active ? 1 : 0.5 }}>
                <td>{driver.full_name}</td>
                <td>
                  <span className={`badge ${driver.active ? 'badge-ok' : 'badge-absent'}`}>
                    {driver.active ? 'Activ' : 'Inactiv'}
                  </span>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-outline"
                      onClick={() => handleToggle(driver.id, driver.active)}
                    >
                      {driver.active ? 'Dezactivează' : 'Activează'}
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDelete(driver.id)}>
                      Șterge
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {initialDrivers.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-muted">
                  Nu există șoferi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
