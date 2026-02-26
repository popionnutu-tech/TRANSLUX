'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PointEnum } from '@translux/db';
import { POINT_LABELS } from '@translux/db';
import { createInvite, deleteInvite } from './actions';
import type { InviteWithAdmin } from './actions';

export default function InvitesClient({ initialInvites }: { initialInvites: InviteWithAdmin[] }) {
  const [point, setPoint] = useState<PointEnum>('CHISINAU');
  const [lastLink, setLastLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleCreate() {
    setError('');
    setLoading(true);
    try {
      const result = await createInvite(point);
      setLastLink(result.botLink);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(token: string) {
    if (!confirm('Sigur vrei să ștergi această invitație?')) return;
    await deleteInvite(token);
    router.refresh();
  }

  function copyLink() {
    navigator.clipboard.writeText(lastLink);
  }

  function getStatus(invite: InviteWithAdmin): { label: string; cls: string } {
    if (invite.used_at) return { label: 'Utilizat', cls: 'badge-ok' };
    if (new Date(invite.expires_at) < new Date()) return { label: 'Expirat', cls: 'badge-cancelled' };
    return { label: 'Activ', cls: 'badge-absent' };
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau' });

  return (
    <div className="page">
      <div className="page-header">
        <h1>Invitații</h1>
      </div>

      <div className="card mb-4">
        <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Punct</label>
            <select value={point} onChange={(e) => setPoint(e.target.value as PointEnum)}>
              <option value="CHISINAU">{POINT_LABELS.CHISINAU}</option>
              <option value="BALTI">{POINT_LABELS.BALTI}</option>
            </select>
          </div>
          <button onClick={handleCreate} className="btn btn-primary" disabled={loading}>
            {loading ? 'Se generează...' : 'Generează invitație'}
          </button>
        </div>
        {error && <p style={{ color: 'var(--danger)', fontSize: 14, marginTop: 8 }}>{error}</p>}
        {lastLink && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: '#f0f9ff',
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
              const status = getStatus(inv);
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
                      <button className="btn btn-danger" onClick={() => handleDelete(inv.token)}>
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
