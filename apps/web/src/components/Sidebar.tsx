'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const nav = [
  { href: '/reports', label: 'Rapoarte' },
  { href: '/invites', label: 'Invitații' },
  { href: '/routes', label: 'Rute' },
  { href: '/drivers', label: 'Șoferi' },
  { href: '/trips', label: 'Curse' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside
      style={{
        width: 220,
        minHeight: '100vh',
        background: '#1e293b',
        color: '#fff',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '0 20px', marginBottom: 32 }}>
        <img src="/logo.svg" alt="TRANSLUX" style={{ height: 32, marginBottom: 4 }} />
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Admin Panel</p>
      </div>

      <nav style={{ flex: 1 }}>
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'block',
              padding: '10px 20px',
              color: pathname === item.href ? '#fff' : '#94a3b8',
              background: pathname === item.href ? '#334155' : 'transparent',
              fontWeight: pathname === item.href ? 600 : 400,
              fontSize: 14,
              textDecoration: 'none',
              borderLeft: pathname === item.href ? '3px solid #3b82f6' : '3px solid transparent',
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div style={{ padding: '0 20px' }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid #475569',
            color: '#94a3b8',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Deconectare
        </button>
      </div>
    </aside>
  );
}
