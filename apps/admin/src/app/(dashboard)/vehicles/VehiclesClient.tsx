'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Vehicle } from '@translux/db';
import { createVehicle, toggleVehicle, deleteVehicle, updateVehiclePlate } from './actions';

export default function VehiclesClient({ initialVehicles }: { initialVehicles: Vehicle[] }) {
  const [plate, setPlate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createVehicle(plate);
      setPlate('');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    await toggleVehicle(id, !active);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Sigur vrei să ștergi acest vehicul?')) return;
    try {
      await deleteVehicle(id);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const activeCount = initialVehicles.filter(v => v.active).length;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Mașini</h1>
      </div>

      <div className="card mb-4">
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 180 }}>
            <label>Număr de înmatriculare</label>
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="ex: 001ABC"
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Nomenclator vehicule</h3>
          <span className="text-muted" style={{ fontSize: 14 }}>
            {activeCount} active / {initialVehicles.length} total
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nr. înmatriculare</th>
              <th>Status</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {initialVehicles.map((vehicle) => (
              <VehicleRow
                key={vehicle.id}
                vehicle={vehicle}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
            {initialVehicles.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-muted">
                  Nu există vehicule.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VehicleRow({
  vehicle,
  onToggle,
  onDelete,
}: {
  vehicle: Vehicle;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [plate, setPlate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSavePlate() {
    const trimmed = plate.trim();
    if (!trimmed) return;
    if (trimmed.toUpperCase() === vehicle.plate_number) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateVehiclePlate(vehicle.id, trimmed);
      setEditing(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr style={{ opacity: vehicle.active ? 1 : 0.5 }}>
      <td style={{ fontWeight: 600, letterSpacing: '0.5px' }}>
        {editing ? (
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              value={plate}
              onChange={e => setPlate(e.target.value)}
              placeholder="ex: 001ABC"
              style={{ width: 120, fontSize: 13, padding: '2px 6px', fontWeight: 600, letterSpacing: '0.5px' }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSavePlate(); if (e.key === 'Escape') setEditing(false); }}
            />
            <button onClick={handleSavePlate} disabled={saving} className="btn btn-primary" style={{ fontSize: 11, padding: '2px 8px' }}>
              {saving ? '...' : '✓'}
            </button>
            <button onClick={() => { setEditing(false); setError(''); }} className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px' }}>✕</button>
            {error && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</span>}
          </span>
        ) : (
          <span onClick={() => { setPlate(vehicle.plate_number); setEditing(true); }} style={{ cursor: 'pointer' }}>
            {vehicle.plate_number}
          </span>
        )}
      </td>
      <td>
        <span className={`badge ${vehicle.active ? 'badge-ok' : 'badge-absent'}`}>
          {vehicle.active ? 'Activ' : 'Inactiv'}
        </span>
      </td>
      <td>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={() => onToggle(vehicle.id, vehicle.active)}>
            {vehicle.active ? 'Dezactivează' : 'Activează'}
          </button>
          <button className="btn btn-danger" onClick={() => onDelete(vehicle.id)}>
            Șterge
          </button>
        </div>
      </td>
    </tr>
  );
}
