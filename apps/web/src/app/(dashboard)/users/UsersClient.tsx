'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User, UserRole } from '@translux/db';
import { POINT_LABELS } from '@translux/db';
import { updateUserRole, toggleUser, deleteUser } from './actions';

export default function UsersClient({ initialUsers }: { initialUsers: User[] }) {
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleRoleChange(id: string, role: UserRole) {
    setError('');
    try {
      await updateUserRole(id, role);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    await toggleUser(id, !active);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Sigur vrei să ștergi acest utilizator?')) return;
    try {
      await deleteUser(id);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Utilizatori</h1>
      </div>

      {error && (
        <div className="card mb-4">
          <p style={{ color: 'var(--danger)', fontSize: 14, margin: 0 }}>{error}</p>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Telegram ID</th>
              <th>Punct</th>
              <th>Rol</th>
              <th>Status</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {initialUsers.map((user) => (
              <tr key={user.id} style={{ opacity: user.active ? 1 : 0.5 }}>
                <td>{user.username ? `@${user.username}` : '—'}</td>
                <td style={{ fontSize: 13, color: '#64748b' }}>{user.telegram_id || '—'}</td>
                <td>{user.point ? POINT_LABELS[user.point] : '—'}</td>
                <td>
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: '1px solid #d1d5db',
                      fontSize: 13,
                      background: user.role === 'ADMIN' ? '#dbeafe' : '#fff',
                      fontWeight: user.role === 'ADMIN' ? 600 : 400,
                    }}
                  >
                    <option value="CONTROLLER">Controller</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td>
                  <span className={`badge ${user.active ? 'badge-ok' : 'badge-absent'}`}>
                    {user.active ? 'Activ' : 'Inactiv'}
                  </span>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-outline"
                      onClick={() => handleToggle(user.id, user.active)}
                    >
                      {user.active ? 'Dezactivează' : 'Activează'}
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDelete(user.id)}>
                      Șterge
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {initialUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted">
                  Nu există utilizatori.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
