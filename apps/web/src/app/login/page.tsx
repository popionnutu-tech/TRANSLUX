'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Eroare de autentificare');
        return;
      }

      router.push('/reports');
      router.refresh();
    } catch {
      setError('Eroare de conexiune');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0c0a1e',
        backgroundImage: `
          radial-gradient(ellipse 70% 55% at 50% 45%, rgba(80, 40, 120, 0.45) 0%, transparent 65%),
          radial-gradient(ellipse 40% 30% at 50% 55%, rgba(232, 160, 48, 0.08) 0%, transparent 60%),
          repeating-linear-gradient(
            45deg,
            transparent,
            transparent 7px,
            rgba(200, 160, 100, 0.015) 7px,
            rgba(200, 160, 100, 0.015) 8px
          ),
          repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 7px,
            rgba(200, 160, 100, 0.015) 7px,
            rgba(200, 160, 100, 0.015) 8px
          )
        `,
      }}
    >
      <div style={{ width: 380, position: 'relative' }}>

        {/* ── Logo ──────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo.svg" alt="TRANSLUX" style={{ height: 52 }} />

          {/* ornamental divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              justifyContent: 'center',
              marginTop: 16,
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #38305c)' }} />
            <span style={{ color: '#e8a030', fontSize: 10 }}>✦</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #38305c, transparent)' }} />
          </div>

          <div
            style={{
              fontFamily: 'var(--font-cinzel, serif)',
              fontSize: 10,
              letterSpacing: '0.26em',
              color: '#4a3d6a',
              marginTop: 12,
              textTransform: 'uppercase',
            }}
          >
            Autentificare Administrator
          </div>
        </div>

        {/* ── Card ──────────────────────────────── */}
        <div
          style={{
            background: '#14122e',
            border: '1px solid #38305c',
            borderRadius: 4,
            padding: '32px',
            position: 'relative',
            boxShadow: '0 0 0 1px rgba(232,160,48,0.06) inset, 0 8px 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* amber top glow */}
          <div
            style={{
              position: 'absolute',
              top: -1, left: 40, right: 40,
              height: 2,
              background: 'linear-gradient(90deg, transparent, #e8a030, transparent)',
              opacity: 0.6,
            }}
          />

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="admin@translux.md"
              />
            </div>
            <div className="form-group">
              <label>Parolă</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p
                style={{
                  color: '#e07050',
                  fontSize: 13,
                  marginBottom: 16,
                  fontFamily: 'var(--font-cinzel, serif)',
                  letterSpacing: '0.04em',
                }}
              >
                ⛔ {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              disabled={loading}
            >
              {loading ? '...' : 'Autentificare'}
            </button>
          </form>
        </div>

        {/* ── Bottom ornament ───────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            justifyContent: 'center',
            marginTop: 28,
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #1e1c3a)' }} />
          <span style={{ color: '#2a2050', fontSize: 10 }}>◆</span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #1e1c3a, transparent)' }} />
        </div>
      </div>
    </div>
  );
}
