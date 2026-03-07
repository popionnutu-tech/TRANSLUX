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
          background: #fff;
        }
        /* Scattered T pattern — left side */
        .login-decor-left,
        .login-decor-right {
          position: fixed;
          top: 0;
          bottom: 0;
          width: 120px;
          pointer-events: none;
          z-index: 0;
          overflow: hidden;
        }
        .login-decor-left { left: 0; }
        .login-decor-right { right: 0; }
        .login-decor-left svg,
        .login-decor-right svg {
          position: absolute;
          fill: #D42027;
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
        }
        .login-title {
          font-size: 11px;
          letter-spacing: 0.25em;
          color: #999;
          text-transform: uppercase;
          font-weight: 500;
        }
        .login-card {
          background: #fff;
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 40px;
          position: relative;
          box-shadow: 0 2px 20px rgba(0, 0, 0, 0.06);
        }
        .login-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: #D42027;
          border-radius: 12px 12px 0 0;
        }
        .login-error {
          background: rgba(239, 68, 68, 0.06);
          border: 1px solid rgba(239, 68, 68, 0.15);
          color: #ef4444;
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
          background: #ef4444;
          flex-shrink: 0;
        }
        .login-submit {
          width: 100%;
          padding: 12px;
          background: #D42027;
          border: none;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          font-style: italic;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(212, 32, 39, 0.2);
          margin-top: 8px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .login-submit:hover {
          background: #b81b21;
          box-shadow: 0 4px 16px rgba(212, 32, 39, 0.3);
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
          color: #bbb;
        }
      `}</style>

      <div className="login-page">
        {/* Scattered T decorations — left */}
        <div className="login-decor-left">
          <svg xmlns="http://www.w3.org/2000/svg" width="120" height="100%" viewBox="0 0 120 800">
            <text x="-10" y="80" fontFamily="Arial Black,Impact,sans-serif" fontWeight="900" fontStyle="italic" fontSize="72" fill="#D42027" opacity="0.12" transform="rotate(-15 30 80)">T</text>
            <text x="20" y="200" fontFamily="Arial Black,Impact,sans-serif" fontWeight="900" fontStyle="italic" fontSize="48" fill="#D42027" opacity="0.08" transform="rotate(10 40 200)">T</text>
            <text x="-5" y="340" fontFamily="Arial Black,Impact,sans-serif" fontWeight="900" fontStyle="italic" fontSize="60" fill="#D42027" opacity="0.10" transform="rotate(-20 25 340)">T</text>
            <text x="30" y="480" fontFamily="Arial Black,Impact,sans-serif" fontWeight="900" fontStyle="italic" fontSize="40" fill="#D42027" opacity="0.06" transform="rotate(5 50 480)">T</text>
            <text x="5" y="600" fontFamily="Arial Black,Impact,sans-serif" fontWeight="900" fontStyle="italic" fontSize="56" fill="#D42027" opacity="0.09" transform="rotate(-10 30 600)">T</text>
            <text x="25" y="740" fontFamily="Arial Black,Impact,sans-serif" fontWeight="900" fontStyle="italic" fontSize="44" fill="#D42027" opacity="0.07" transform="rotate(15 45 740)">T</text>
          </svg>
        </div>

        {/* Scattered T decorations — right */}
        <div className="login-decor-right">
          <svg xmlns="http://www.w3.org/2000/svg" width="120" height="100%" viewBox="0 0 120 800">
            <text x="30" y="120" fontFamily="Arial Black,Impact,sans-serif" fontWeight="900" fontStyle="italic" fontSize="64" fill="#D42027" opacity="0.10" transform="rotate(15 60 120)">T</text>
            <text x="10" y="280" fontFamily="Arial Black,Impact,sans-serif" fontWeight="900" fontStyle="italic" fontSize="44" fill="#D42027" opacity="0.07" transform="rotate(-10 30 280)">T</text>
            <text x="40" y="420" fontFamily="Arial Black,Impact,sans-serif" fontWeight="900" fontStyle="italic" fontSize="56" fill="#D42027" opacity="0.09" transform="rotate(20 60 420)">T</text>
            <text x="15" y="560" fontFamily="Arial Black,Impact,sans-serif" fontWeight="900" fontStyle="italic" fontSize="50" fill="#D42027" opacity="0.08" transform="rotate(-5 40 560)">T</text>
            <text x="35" y="700" fontFamily="Arial Black,Impact,sans-serif" fontWeight="900" fontStyle="italic" fontSize="68" fill="#D42027" opacity="0.11" transform="rotate(12 60 700)">T</text>
          </svg>
        </div>

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
                {loading ? 'Se incarca...' : 'Intrare'}
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
