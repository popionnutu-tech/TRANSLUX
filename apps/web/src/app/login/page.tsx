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
        /* Spotlight effect — noir atmosphere */
        background: `
          radial-gradient(ellipse 70% 60% at 50% 35%, #1f1500 0%, #0a0907 60%)
        `,
        backgroundColor: '#0a0907',
        backgroundImage: `
          radial-gradient(ellipse 70% 60% at 50% 35%, #1f1500 0%, #0a0907 60%),
          repeating-linear-gradient(
            to bottom,
            transparent 0px,
            transparent 3px,
            rgba(0,0,0,0.08) 3px,
            rgba(0,0,0,0.08) 4px
          )
        `,
      }}
    >
      <div style={{ width: 380, position: 'relative' }}>

        {/* ── Top rule ──────────────────────────── */}
        <div
          style={{
            height: 3,
            background: 'linear-gradient(90deg, transparent, #b22222 20%, #d4a017 50%, #b22222 80%, transparent)',
            marginBottom: 36,
          }}
        />

        {/* ── Title ─────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              fontFamily: 'var(--font-oswald, Impact, sans-serif)',
              fontSize: 52,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#d4a017',
              lineHeight: 1,
              textShadow: '0 0 40px rgba(212,160,23,0.3)',
            }}
          >
            TRANSLUX
          </div>
          <div
            style={{
              fontFamily: 'var(--font-oswald, Impact, sans-serif)',
              fontSize: 10,
              letterSpacing: '0.38em',
              textTransform: 'uppercase',
              color: '#4a3d2a',
              marginTop: 10,
            }}
          >
            ◂ ACCES RESTRICȚIONAT ▸
          </div>
        </div>

        {/* ── Card ──────────────────────────────── */}
        <div
          style={{
            background: '#131210',
            border: '1px solid #252320',
            borderRadius: 1,
            padding: '32px',
            position: 'relative',
          }}
        >
          {/* Gold top bar on card */}
          <div
            style={{
              position: 'absolute',
              top: -1, left: 0, right: 0,
              height: 2,
              background: 'linear-gradient(90deg, #b22222 0%, #d4a017 55%, transparent 100%)',
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
                  color: '#e05050',
                  fontSize: 12,
                  marginBottom: 16,
                  fontFamily: 'var(--font-oswald, Impact, sans-serif)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
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

        {/* ── Bottom rule ───────────────────────── */}
        <div
          style={{
            height: 1,
            background: 'linear-gradient(90deg, transparent, #3d3010, transparent)',
            marginTop: 36,
          }}
        />
      </div>
    </div>
  );
}
