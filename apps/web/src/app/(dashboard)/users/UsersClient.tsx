'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User, UserRole, PointEnum } from '@translux/db';
import { POINT_LABELS } from '@translux/db';
import { getOperatorName } from '@/lib/operators';
import {
  updateUserRole,
  updateUserPoint,
  toggleUser,
  deleteUser,
  createInvite,
  deleteInvite,
} from './actions';
import type { InviteWithAdmin, AdminAccountInfo } from './actions';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  DISPATCHER: 'Dispecer',
  GRAFIC: 'Grafic',
  OPERATOR_CAMERE: 'Operator camere',
  ADMIN_CAMERE: 'Admin camere',
  EVALUATOR_INCASARI: 'Evaluator încasări',
};

export default function UsersClient({
  initialUsers,
  initialInvites,
  initialAdmins = [],
  accountPasswords = {},
}: {
  initialUsers: User[];
  initialInvites: InviteWithAdmin[];
  initialAdmins?: AdminAccountInfo[];
  accountPasswords?: Record<string, string>;
}) {
  const [error, setError] = useState('');
  const [point, setPoint] = useState<PointEnum>('CHISINAU');
  const [lastLink, setLastLink] = useState('');
  const [invLoading, setInvLoading] = useState(false);
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

  async function handlePointChange(id: string, point: PointEnum | null) {
    setError('');
    try {
      await updateUserPoint(id, point);
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
    if (invite.used_at) return { label: 'Utilizat', cls: 'u-status-used' };
    if (new Date(invite.expires_at) < new Date()) return { label: 'Expirat', cls: 'u-status-expired' };
    return { label: 'Activ', cls: 'u-status-active' };
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('ro-RO', {
      timeZone: 'Europe/Chisinau',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const activeCount = initialUsers.filter((u) => u.active).length;
  const adminCount = initialUsers.filter((u) => u.role === 'ADMIN').length;
  const pendingInvites = initialInvites.filter(
    (inv) => !inv.used_at && new Date(inv.expires_at) >= new Date()
  ).length;

  return (
    <div className="u-page" style={{ fontFamily: "var(--font-opensans), 'Open Sans', sans-serif" }}>
      <style>{`
        .u-page {
          padding: 28px 36px;
          max-width: 1000px;
          margin: 0 auto;
        }
        .u-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 28px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .u-title {
          font-size: 28px;
          font-weight: 400;
          color: #9B1B30;
          font-style: italic;
          font-family: var(--font-opensans), 'Open Sans', sans-serif;
          letter-spacing: 0.5px;
        }
        .u-stats {
          display: flex;
          gap: 8px;
        }
        .u-stat {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 10px;
          background: rgba(255,255,255,0.6);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(155,27,48,0.08);
          font-size: 12px;
          color: #6E0E14;
          font-weight: 500;
        }
        .u-stat-val {
          font-weight: 700;
          font-size: 15px;
          color: #9B1B30;
        }
        .u-card {
          background: rgba(255,255,255,0.6);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.5);
          border-radius: 24px;
          padding: 28px 32px;
          margin-bottom: 24px;
          box-shadow: 0 8px 40px rgba(155,27,48,0.06), 0 1px 3px rgba(0,0,0,0.04);
        }
        .u-section {
          font-size: 17px;
          font-weight: 400;
          font-style: italic;
          color: #9B1B30;
          margin-bottom: 20px;
          letter-spacing: 0.5px;
          font-family: var(--font-opensans), 'Open Sans', sans-serif;
        }
        .u-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .u-table th {
          text-align: left;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(155,27,48,0.08);
          color: rgba(155,27,48,0.45);
          font-weight: 600;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-family: var(--font-opensans), 'Open Sans', sans-serif;
        }
        .u-table td {
          padding: 11px 12px;
          border-bottom: 1px solid rgba(155,27,48,0.04);
          color: #333;
        }
        .u-table tr:last-child td {
          border-bottom: none;
        }
        .u-table tbody tr {
          transition: background 0.15s;
        }
        .u-table tbody tr:hover {
          background: rgba(155,27,48,0.03);
        }
        .u-name {
          font-weight: 600;
          color: #333;
          font-size: 13px;
        }
        .u-username {
          color: rgba(155,27,48,0.4);
          font-size: 12px;
          margin-left: 6px;
          font-style: italic;
        }
        .u-tg-id {
          font-size: 11px;
          color: #bbb;
          font-variant-numeric: tabular-nums;
        }
        .u-point {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .u-point-CHISINAU {
          background: rgba(155,27,48,0.06);
          color: #9B1B30;
        }
        .u-point-BALTI {
          background: rgba(110,14,20,0.06);
          color: #6E0E14;
        }
        .u-select {
          padding: 6px 10px;
          border-radius: 10px;
          border: 1px solid rgba(155,27,48,0.1);
          font-size: 12px;
          background: rgba(255,255,255,0.85);
          color: #6E0E14;
          cursor: pointer;
          font-family: var(--font-opensans), 'Open Sans', sans-serif;
          font-style: italic;
          transition: all 0.2s ease;
          outline: none;
          appearance: none;
        }
        .u-select:hover {
          border-color: rgba(155,27,48,0.2);
        }
        .u-select:focus {
          border-color: rgba(155,27,48,0.3);
          box-shadow: 0 0 0 2px rgba(155,27,48,0.1);
        }
        .u-btn {
          padding: 6px 16px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid rgba(155,27,48,0.15);
          background: transparent;
          color: #9B1B30;
          font-family: var(--font-opensans), 'Open Sans', sans-serif;
          font-style: italic;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .u-btn:hover {
          background: rgba(155,27,48,0.06);
          border-color: rgba(155,27,48,0.25);
        }
        .u-btn-danger {
          color: #b91c1c;
          border-color: rgba(185,28,28,0.15);
        }
        .u-btn-danger:hover {
          background: rgba(185,28,28,0.06);
          border-color: rgba(185,28,28,0.25);
        }
        .u-btn-primary {
          background: #9B1B30;
          color: #fff;
          border: 1px solid #9B1B30;
          font-style: italic;
          padding: 9px 24px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(155,27,48,0.2);
        }
        .u-btn-primary:hover {
          background: #7a1526;
          box-shadow: 0 4px 16px rgba(155,27,48,0.3);
          transform: translateY(-1px);
        }
        .u-btn-primary:active {
          transform: translateY(0);
        }
        .u-btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .u-status-dot {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 500;
        }
        .u-status-dot::before {
          content: '';
          width: 7px;
          height: 7px;
          border-radius: 50%;
        }
        .u-dot-active { color: #16a34a; }
        .u-dot-active::before { background: #16a34a; }
        .u-dot-inactive { color: #d97706; }
        .u-dot-inactive::before { background: #d97706; }
        .u-inactive { opacity: 0.4; }
        .u-invite-form {
          display: flex;
          gap: 14px;
          align-items: flex-end;
        }
        .u-form-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .u-form-label {
          font-size: 10px;
          font-weight: 600;
          color: rgba(155,27,48,0.4);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-family: var(--font-opensans), 'Open Sans', sans-serif;
        }
        .u-form-select {
          padding: 9px 14px;
          border: 1px solid rgba(155,27,48,0.1);
          border-radius: 12px;
          font-size: 14px;
          background: rgba(255,255,255,0.85);
          color: #6E0E14;
          font-family: var(--font-opensans), 'Open Sans', sans-serif;
          font-style: italic;
          min-width: 170px;
          cursor: pointer;
          outline: none;
          appearance: none;
          transition: all 0.2s ease;
        }
        .u-form-select:focus {
          box-shadow: 0 0 0 2px rgba(155,27,48,0.12);
          border-color: rgba(155,27,48,0.25);
        }
        .u-link-box {
          margin-top: 16px;
          padding: 14px 18px;
          background: rgba(155,27,48,0.03);
          border: 1px solid rgba(155,27,48,0.08);
          border-radius: 14px;
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .u-link-code {
          flex: 1;
          font-size: 12px;
          color: #6E0E14;
          word-break: break-all;
          font-family: 'SF Mono', 'JetBrains Mono', monospace;
        }
        .u-link-copy {
          padding: 7px 16px;
          border-radius: 10px;
          border: 1px solid rgba(155,27,48,0.15);
          background: transparent;
          color: #9B1B30;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          font-family: var(--font-opensans), 'Open Sans', sans-serif;
          font-style: italic;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .u-link-copy:hover {
          background: rgba(155,27,48,0.06);
          border-color: rgba(155,27,48,0.25);
        }
        .u-status-used {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          background: rgba(22,163,74,0.08);
          color: #16a34a;
        }
        .u-status-expired {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          background: rgba(185,28,28,0.06);
          color: #b91c1c;
          text-decoration: line-through;
        }
        .u-status-active {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          background: rgba(155,27,48,0.06);
          color: #9B1B30;
        }
        .u-error {
          padding: 12px 18px;
          background: rgba(185,28,28,0.05);
          border: 1px solid rgba(185,28,28,0.1);
          border-radius: 14px;
          color: #b91c1c;
          font-size: 13px;
          margin-bottom: 20px;
          font-style: italic;
        }
        .u-empty {
          text-align: center;
          color: rgba(155,27,48,0.25);
          font-size: 13px;
          font-style: italic;
          padding: 28px 0;
        }
      `}</style>

      {/* Header */}
      <div className="u-header">
        <div className="u-title">Utilizatori</div>
        <div className="u-stats">
          <div className="u-stat">
            <span className="u-stat-val">{activeCount}</span> activi
          </div>
          <div className="u-stat">
            <span className="u-stat-val">{adminCount}</span> admini
          </div>
          <div className="u-stat">
            <span className="u-stat-val">{pendingInvites}</span> invitații
          </div>
        </div>
      </div>

      {error && <div className="u-error">{error}</div>}

      {/* Admin accounts */}
      {initialAdmins.length > 0 && (
        <div className="u-card" style={{ marginBottom: 20 }}>
          <div className="u-section">Conturi administrative</div>
          <table className="u-table">
            <thead>
              <tr>
                <th>EMAIL</th>
                <th>PAROLA</th>
                <th>ROL</th>
              </tr>
            </thead>
            <tbody>
              {initialAdmins.map(a => (
                <tr key={a.id}>
                  <td>{a.email}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{accountPasswords[a.email] || '•••'}</td>
                  <td>{ROLE_LABELS[a.role] || a.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Users table */}
      <div className="u-card">
        <div className="u-section">Echipa</div>
        <table className="u-table">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Telegram</th>
              <th>Punct</th>
              <th>Rol</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {initialUsers.map((user) => (
              <tr key={user.id} className={user.active ? '' : 'u-inactive'}>
                <td>
                  <span className="u-name">{getOperatorName(user.telegram_id, null)}</span>
                  {user.username && (
                    <span className="u-username">@{user.username}</span>
                  )}
                </td>
                <td>
                  <span className="u-tg-id">{user.telegram_id || '—'}</span>
                </td>
                <td>
                  <select
                    className="u-select"
                    value={user.point || ''}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      handlePointChange(user.id, val as PointEnum | null);
                    }}
                  >
                    <option value="">—</option>
                    <option value="CHISINAU">{POINT_LABELS.CHISINAU}</option>
                    <option value="BALTI">{POINT_LABELS.BALTI}</option>
                  </select>
                </td>
                <td>
                  <select
                    className="u-select"
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                  >
                    <option value="CONTROLLER">Controller</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td>
                  <span className={`u-status-dot ${user.active ? 'u-dot-active' : 'u-dot-inactive'}`}>
                    {user.active ? 'Activ' : 'Inactiv'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      className="u-btn"
                      onClick={() => handleToggle(user.id, user.active)}
                    >
                      {user.active ? 'Dezactivează' : 'Activează'}
                    </button>
                    <button
                      className="u-btn u-btn-danger"
                      onClick={() => handleDelete(user.id)}
                    >
                      Șterge
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {initialUsers.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="u-empty">Nu există utilizatori.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invite section */}
      <div className="u-card">
        <div className="u-section">Invitații</div>
        <div className="u-invite-form">
          <div className="u-form-group">
            <label className="u-form-label">Punct</label>
            <select
              className="u-form-select"
              value={point}
              onChange={(e) => setPoint(e.target.value as PointEnum)}
            >
              <option value="CHISINAU">{POINT_LABELS.CHISINAU}</option>
              <option value="BALTI">{POINT_LABELS.BALTI}</option>
            </select>
          </div>
          <button
            onClick={handleCreateInvite}
            className="u-btn u-btn-primary"
            disabled={invLoading}
          >
            {invLoading ? 'Se generează...' : 'Generează invitație'}
          </button>
        </div>
        {lastLink && (
          <div className="u-link-box">
            <code className="u-link-code">{lastLink}</code>
            <button onClick={copyLink} className="u-link-copy">
              Copiază
            </button>
          </div>
        )}
      </div>

      {/* Invites table */}
      {initialInvites.length > 0 && (
        <div className="u-card">
          <div className="u-section">Istoricul invitațiilor</div>
          <table className="u-table">
            <thead>
              <tr>
                <th>Punct</th>
                <th>Status</th>
                <th>Creat la</th>
                <th>Expiră la</th>
                <th>Utilizat de</th>
                <th style={{ textAlign: 'right' }}>Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {initialInvites.map((inv) => {
                const status = getInviteStatus(inv);
                return (
                  <tr key={inv.token}>
                    <td>
                      <span className={`u-point u-point-${inv.point}`}>
                        {POINT_LABELS[inv.point]}
                      </span>
                    </td>
                    <td>
                      <span className={status.cls}>{status.label}</span>
                    </td>
                    <td style={{ fontSize: 12, color: '#aaa' }}>{formatDate(inv.created_at)}</td>
                    <td style={{ fontSize: 12, color: '#aaa' }}>{formatDate(inv.expires_at)}</td>
                    <td>
                      {inv.users
                        ? <span style={{ fontWeight: 500, color: '#6E0E14' }}>@{inv.users.username || inv.users.telegram_id}</span>
                        : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {!inv.used_at && (
                        <button
                          className="u-btn u-btn-danger"
                          onClick={() => handleDeleteInvite(inv.token)}
                        >
                          Șterge
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
