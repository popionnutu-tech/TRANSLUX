'use client';

import { useState, useTransition } from 'react';
import { loginVerificare } from './actions';

export default function LoginForm() {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const r = await loginVerificare(user, pass);
      if (!r.ok) setErr(r.error || 'Eroare.');
    });
  };

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
      <input
        type="text"
        value={user}
        onChange={(e) => setUser(e.target.value)}
        placeholder="Utilizator"
        autoComplete="username"
        autoFocus
        required
        style={{
          padding: '12px 14px',
          fontSize: 14,
          border: '1px solid #d4d4d4',
          borderRadius: 8,
        }}
      />
      <input
        type="password"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        placeholder="Parolă"
        autoComplete="current-password"
        required
        style={{
          padding: '12px 14px',
          fontSize: 14,
          border: '1px solid #d4d4d4',
          borderRadius: 8,
        }}
      />
      {err && <div style={{ color: '#9B1B30', fontSize: 13 }}>{err}</div>}
      <button
        type="submit"
        disabled={isPending}
        style={{
          padding: '12px',
          borderRadius: 8,
          border: 'none',
          background: isPending ? '#c8a5ad' : '#9B1B30',
          color: '#fff',
          fontSize: 15,
          fontWeight: 700,
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending ? 'Se verifică…' : 'Intră'}
      </button>
    </form>
  );
}
