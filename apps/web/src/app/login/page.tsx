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
    <>
      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .login-bg {
          position: fixed;
          inset: 0;
          background:
            radial-gradient(ellipse 60% 50% at 30% 20%, rgba(212, 32, 39, 0.06) 0%, transparent 50%),
            radial-gradient(ellipse 50% 40% at 70% 80%, rgba(212, 32, 39, 0.04) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(212, 32, 39, 0.02) 0%, transparent 70%);
          z-index: 0;
        }
        .login-grid {
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 70%);
          -webkit-mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 70%);
          z-index: 0;
        }
        .login-container {
          width: 420px;
          position: relative;
          z-index: 1;
        }
        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }
        .login-logo {
          height: 40px;
          margin-bottom: 16px;
          filter: brightness(1.1);
        }
        .login-title {
          font-size: 11px;
          letter-spacing: 0.25em;
          color: #666;
          text-transform: uppercase;
          font-weight: 500;
        }
        .login-card {
          background: rgba(30, 30, 30, 0.7);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 40px;
          position: relative;
          box-shadow:
            0 8px 64px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        .login-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(212, 32, 39, 0.5) 30%, rgba(212, 32, 39, 0.3) 70%, transparent);
          border-radius: 16px 16px 0 0;
        }
        .login-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #f87171;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .login-error-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #D42027;
          flex-shrink: 0;
        }
        .login-submit {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #D42027 0%, #a81a1f 100%);
          border: none;
          border-radius: 10px;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 0 24px rgba(212, 32, 39, 0.2);
          margin-top: 8px;
        }
        .login-submit:hover {
          box-shadow: 0 0 40px rgba(212, 32, 39, 0.4);
          transform: translateY(-1px);
        }
        .login-submit:active {
          transform: translateY(0);
        }
        .login-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .login-footer {
          text-align: center;
          margin-top: 24px;
          font-size: 12px;
          color: #444;
        }
      `}</style>

      <div className="login-page">
        <div className="login-bg" />
        <div className="login-grid" />

        <div className="login-container">
          <div className="login-header">
            <img src="/logo.svg" alt="TRANSLUX" className="login-logo" />
            <div className="login-title">Autentificare Administrator</div>
          </div>

          <div className="login-card">
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
                <label>Parola</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="login-error">
                  <span className="login-error-dot" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="login-submit"
                disabled={loading}
              >
                {loading ? 'Se incarca...' : 'Autentificare'}
              </button>
            </form>
          </div>

          <div className="login-footer">
            TRANSLUX Monitoring System
          </div>
        </div>
      </div>
    </>
  );
}
