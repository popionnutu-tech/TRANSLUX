'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Driver } from '@translux/db';
import { createDriver, toggleDriver, deleteDriver, updateDriverPhone, updateDriverName } from './actions';

function formatDriverName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const familyName = parts[0];
  const initials = parts.slice(1).map((p) => p.charAt(0).toUpperCase() + '.').join('');
  return `${familyName} ${initials}`;
}

export default function DriversClient({ initialDrivers }: { initialDrivers: Driver[] }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createDriver(name, phone || undefined);
      setName('');
      setPhone('');
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
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 180 }}>
            <label>Numele complet</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Moldovan Ion"
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 130 }}>
            <label>Telefon</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="069XXXXXX"
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
              <th>Telefon</th>
              <th>Status</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {initialDrivers.map((driver) => (
              <DriverRow
                key={driver.id}
                driver={driver}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
            {initialDrivers.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted">
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

function DriverRow({
  driver,
  onToggle,
  onDelete,
}: {
  driver: Driver;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [editingPhone, setEditingPhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const router = useRouter();

  async function handleSavePhone() {
    if (!phone.trim()) return;
    setSavingPhone(true);
    try {
      await updateDriverPhone(driver.id, phone);
      setEditingPhone(false);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingPhone(false);
    }
  }

  async function handleSaveName() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed === driver.full_name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await updateDriverName(driver.id, trimmed);
      setEditingName(false);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingName(false);
    }
  }

  const driverPhone = driver.phone;

  return (
    <tr style={{ opacity: driver.active ? 1 : 0.5 }}>
      <td>
        {editingName ? (
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nume Prenume"
              style={{ width: 160, fontSize: 13, padding: '2px 6px' }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
            />
            <button onClick={handleSaveName} disabled={savingName} className="btn btn-primary" style={{ fontSize: 11, padding: '2px 8px' }}>
              {savingName ? '...' : '✓'}
            </button>
            <button onClick={() => setEditingName(false)} className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px' }}>✕</button>
          </span>
        ) : (
          <span onClick={() => { setNewName(driver.full_name); setEditingName(true); }} style={{ cursor: 'pointer' }}>
            {driver.full_name}
          </span>
        )}
      </td>
      <td>
        {editingPhone ? (
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="069XXXXXX"
              style={{ width: 110, fontSize: 13, padding: '2px 6px' }}
              autoFocus
            />
            <button onClick={handleSavePhone} disabled={savingPhone} className="btn btn-primary" style={{ fontSize: 11, padding: '2px 8px' }}>
              {savingPhone ? '...' : '✓'}
            </button>
            <button onClick={() => setEditingPhone(false)} className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px' }}>✕</button>
          </span>
        ) : driverPhone ? (
          <span onClick={() => { setPhone(driverPhone); setEditingPhone(true); }} style={{ cursor: 'pointer' }}>
            {driverPhone}
          </span>
        ) : (
          <button onClick={() => setEditingPhone(true)} style={{ fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626', textDecoration: 'underline' }}>
            + Adaugă
          </button>
        )}
      </td>
      <td>
        <span className={`badge ${driver.active ? 'badge-ok' : 'badge-absent'}`}>
          {driver.active ? 'Activ' : 'Inactiv'}
        </span>
      </td>
      <td>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={() => onToggle(driver.id, driver.active)}>
            {driver.active ? 'Dezactivează' : 'Activează'}
          </button>
          <button className="btn btn-danger" onClick={() => onDelete(driver.id)}>
            Șterge
          </button>
        </div>
      </td>
    </tr>
  );
}
