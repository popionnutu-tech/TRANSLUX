'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User, UserRole, PointEnum } from '@translux/db';
import { POINT_LABELS } from '@translux/db';
import { getOperatorName } from '@/lib/operators';
import {
  updateUserRole,
  toggleUser,
  deleteUser,
  createInvite,
  deleteInvite,
} from './actions';
import type { InviteWithAdmin } from './actions';

export default function UsersClient({
  initialUsers,
  initialInvites,
}: {
  initialUsers: User[];
  initialInvites: InviteWithAdmin[];
}) {
  const [error, setError] = useState('');
  const [point, setPoint] = useState<PointEnum>('CHISINAU');
  const [lastLink, setLastLink] = useState('');
  const [invLoading, setInvLoading] = useState(false);
  const router = useRouter();

  // ── User actions ──────────────────────────────────

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

  // ── Invite actions ────────────────────────────────

  async function handleCreateInvite() {
    setError('');
    setInvLoading(true);
    try {
      const result = await createInvite(point);
      setLastLink(result.botLink);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInvLoading(false);
    }
  }

  async function handleDeleteInvite(token: string) {
    if (!confirm('Sigur vrei să ștergi această invitație?')) return;
    await deleteInvite(token);
    router.refresh();
  }

  function copyLink() {
    navigator.clipboard.writeText(lastLink);
  }

  function getInviteStatus(invite: InviteWithAdmin): { label: string; cls: string } {
    if (invite.used_at) return { label: 'Utilizat', cls: 'badge-ok' };
    if (new Date(invite.expires_at) < new Date()) return { label: 'Expirat', cls: 'badge-cancelled' };
    return { label: 'Activ', cls: 'badge-absent' };
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau' });

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

      {/* ── Users Table ── */}
      <div className="card mb-4">
        <table>
          <thead>
            <tr>
              <th>Nume</th>
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
                <td style={{ fontWeight: 600 }}>{getOperatorName(user.telegram_id, null)}</td>
                <td>{user.username ? `@${user.username}` : '—'}</td>
                <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user.telegram_id || '—'}</td>
                <td>{user.point ? POINT_LABELS[user.point] : '—'}</td>
                <td>
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 8,
                      border: '1px solid var(--border-accent)',
                      fontSize: 13,
                      background: user.role === 'ADMIN' ? 'var(--primary-dim)' : 'var(--bg-elevated)',
                      color: user.role === 'ADMIN' ? 'var(--primary)' : 'var(--text)',
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
                <td colSpan={7} className="text-center text-muted">
                  Nu există utilizatori.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Invite Section ── */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Invitații</h2>

      <div className="card mb-4">
        <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Punct</label>
            <select value={point} onChange={(e) => setPoint(e.target.value as PointEnum)}>
              <option value="CHISINAU">{POINT_LABELS.CHISINAU}</option>
              <option value="BALTI">{POINT_LABELS.BALTI}</option>
            </select>
          </div>
          <button onClick={handleCreateInvite} className="btn btn-primary" disabled={invLoading}>
            {invLoading ? 'Se generează...' : 'Generează invitație'}
          </button>
        </div>
        {lastLink && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: 'var(--primary-dim)',
              border: '1px solid rgba(0, 212, 255, 0.15)',
              borderRadius: 8,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <code style={{ flex: 1, fontSize: 13, wordBreak: 'break-all' }}>{lastLink}</code>
            <button onClick={copyLink} className="btn btn-outline">
              Copiază
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Punct</th>
              <th>Status</th>
              <th>Creat la</th>
              <th>Expiră la</th>
              <th>Utilizat de</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {initialInvites.map((inv) => {
              const status = getInviteStatus(inv);
              return (
                <tr key={inv.token}>
                  <td>{POINT_LABELS[inv.point]}</td>
                  <td>
                    <span className={`badge ${status.cls}`}>{status.label}</span>
                  </td>
                  <td style={{ fontSize: 13 }}>{formatDate(inv.created_at)}</td>
                  <td style={{ fontSize: 13 }}>{formatDate(inv.expires_at)}</td>
                  <td>
                    {inv.users
                      ? `@${inv.users.username || inv.users.telegram_id}`
                      : '—'}
                  </td>
                  <td>
                    {!inv.used_at && (
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDeleteInvite(inv.token)}
                      >
                        Șterge
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {initialInvites.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted">
                  Nu există invitații.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
