'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SmmAccount, SmmPlatform } from '@translux/db';
import { SMM_PLATFORM_LABELS } from '@translux/db';
import {
  createSmmAccount,
  toggleSmmAccount,
  deleteSmmAccount,
  updateSmmToken,
} from './actions';

export default function SmmAccountsClient({
  initialAccounts,
}: {
  initialAccounts: SmmAccount[];
}) {
  const [platform, setPlatform] = useState<SmmPlatform>('TIKTOK');
  const [accountName, setAccountName] = useState('');
  const [platformId, setPlatformId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editToken, setEditToken] = useState('');
  const [editRefresh, setEditRefresh] = useState('');
  const router = useRouter();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createSmmAccount({
        platform,
        account_name: accountName,
        platform_id: platformId,
        access_token: accessToken,
        refresh_token: refreshToken || undefined,
      });
      setAccountName('');
      setPlatformId('');
      setAccessToken('');
      setRefreshToken('');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    await toggleSmmAccount(id, !active);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm('Sigur vrei să ștergi acest cont?')) return;
    try {
      await deleteSmmAccount(id);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleUpdateToken(id: string) {
    if (!editToken.trim()) return;
    await updateSmmToken(id, editToken, editRefresh || undefined);
    setEditingId(null);
    setEditToken('');
    setEditRefresh('');
    router.refresh();
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('ro-RO', {
      timeZone: 'Europe/Chisinau',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Conturi SMM</h1>
      </div>

      <div className="card mb-4">
        <form onSubmit={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Platformă</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as SmmPlatform)}
              >
                <option value="TIKTOK">TikTok</option>
                <option value="FACEBOOK">Facebook</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Nume cont</label>
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="ex: TT1, FB1"
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Platform ID</label>
              <input
                value={platformId}
                onChange={(e) => setPlatformId(e.target.value)}
                placeholder="TikTok: open_id / Facebook: page_id"
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Access Token</label>
              <input
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Token de acces"
                required
              />
            </div>
            {platform === 'TIKTOK' && (
              <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                <label>Refresh Token (doar TikTok)</label>
                <input
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  placeholder="Refresh token"
                />
              </div>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Se salvează...' : 'Adaugă cont'}
            </button>
          </div>
        </form>
        {error && (
          <p style={{ color: 'var(--danger)', fontSize: 14, marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Platformă</th>
              <th>Nume</th>
              <th>Platform ID</th>
              <th>Status</th>
              <th>Token expiră</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {initialAccounts.map((acc) => (
              <tr key={acc.id} style={{ opacity: acc.active ? 1 : 0.5 }}>
                <td>{SMM_PLATFORM_LABELS[acc.platform]}</td>
                <td style={{ fontWeight: 600 }}>{acc.account_name}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {acc.platform_id.slice(0, 20)}...
                </td>
                <td>
                  <span
                    className={`badge ${acc.active ? 'badge-ok' : 'badge-absent'}`}
                  >
                    {acc.active ? 'Activ' : 'Inactiv'}
                  </span>
                </td>
                <td style={{ fontSize: 12 }}>
                  {acc.token_expires_at
                    ? formatDate(acc.token_expires_at)
                    : '—'}
                </td>
                <td>
                  {editingId === acc.id ? (
                    <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                      <input
                        value={editToken}
                        onChange={(e) => setEditToken(e.target.value)}
                        placeholder="Noul access token"
                        style={{ fontSize: 12 }}
                      />
                      {acc.platform === 'TIKTOK' && (
                        <input
                          value={editRefresh}
                          onChange={(e) => setEditRefresh(e.target.value)}
                          placeholder="Noul refresh token"
                          style={{ fontSize: 12 }}
                        />
                      )}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 12, padding: '4px 8px' }}
                          onClick={() => handleUpdateToken(acc.id)}
                        >
                          Salvează
                        </button>
                        <button
                          className="btn btn-outline"
                          style={{ fontSize: 12, padding: '4px 8px' }}
                          onClick={() => setEditingId(null)}
                        >
                          Anulează
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        className="btn btn-outline"
                        onClick={() => {
                          setEditingId(acc.id);
                          setEditToken('');
                          setEditRefresh('');
                        }}
                      >
                        Token
                      </button>
                      <button
                        className="btn btn-outline"
                        onClick={() => handleToggle(acc.id, acc.active)}
                      >
                        {acc.active ? 'Dezactivează' : 'Activează'}
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDelete(acc.id)}
                      >
                        Șterge
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {initialAccounts.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted">
                  Nu există conturi SMM. Adaugă unul mai sus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
